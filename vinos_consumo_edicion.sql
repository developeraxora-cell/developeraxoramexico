-- Casa Tahona: edicion transaccional de salidas a consumo abiertas.
-- Aplicar en la base independiente de VINOS despues de las migraciones de consumo.
BEGIN;

ALTER TABLE public.vinos_consumptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE public.vinos_consumption_movements
  DROP CONSTRAINT IF EXISTS vinos_consumption_movements_event_check,
  DROP CONSTRAINT IF EXISTS vinos_consumption_movements_consumption_id_product_id_event_key;
ALTER TABLE public.vinos_consumption_movements
  ADD CONSTRAINT vinos_consumption_movements_event_check
    CHECK (event IN ('SALIDA','DEVOLUCION','CANCELACION','AJUSTE_EDICION'));

CREATE TABLE IF NOT EXISTS public.vinos_consumption_edits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consumption_id uuid NOT NULL REFERENCES public.vinos_consumptions(id),
  actor_id text NOT NULL,
  reason text NOT NULL,
  previous_data jsonb NOT NULL,
  new_data jsonb NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vinos_consumption_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vinos_consumption_edits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_vinos_consumption(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c public.vinos_consumptions%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_customer_id uuid := (p_input->>'customer_id')::uuid;
  v_actor text := nullif(trim(p_input->>'actor_id'),'');
  v_reason text := nullif(trim(p_input->>'reason'),'');
  v_due date := nullif(p_input->>'due_date','')::date;
  v_price_type text := p_input->>'price_type';
  v_credit jsonb;
  v_old_data jsonb;
  v_new_data jsonb;
  v_product_name text;
  v_uom uuid;
  v_stock numeric;
  v_delta numeric;
  r record;
BEGIN
  IF p_input->>'id' IS NULL OR v_customer_id IS NULL OR v_due IS NULL
    OR v_actor IS NULL OR v_reason IS NULL OR length(v_reason)>500
    OR v_price_type IS NULL OR v_price_type NOT IN ('MENUDEO','MEDIO_MAYOREO','MAYOREO') THEN
    RAISE EXCEPTION 'Revisa los datos y el motivo de la edicion.';
  END IF;
  IF jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de productos es invalida.';
  END IF;
  IF jsonb_array_length(p_input->'items')=0 THEN
    RAISE EXCEPTION 'El consumo debe conservar al menos un producto.';
  END IF;
  IF v_due < (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'La fecha limite no puede estar en el pasado.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_input->'items') AS x(product_id uuid,qty numeric,unit_price numeric)
    WHERE product_id IS NULL OR qty IS NULL OR qty<=0 OR qty>2147483647 OR qty<>trunc(qty)
      OR unit_price IS NULL OR unit_price<0 OR unit_price>=10000000000
  ) OR EXISTS (
    SELECT product_id FROM jsonb_to_recordset(p_input->'items') AS x(product_id uuid,qty numeric,unit_price numeric)
    GROUP BY product_id HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Hay productos repetidos o cantidades/precios invalidos.';
  END IF;

  SELECT * INTO STRICT c FROM public.vinos_consumptions
    WHERE id=(p_input->>'id')::uuid FOR UPDATE;
  IF c.status<>'OPEN' THEN
    RAISE EXCEPTION 'Solo se pueden editar salidas abiertas, antes de liquidarlas o cancelarlas.';
  END IF;

  -- Bloquea ambos clientes en orden estable para no competir con otras operaciones de credito.
  PERFORM 1 FROM public.customers
    WHERE id IN (c.customer_id,v_customer_id) ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT v_customer FROM public.customers WHERE id=v_customer_id;
  IF NOT v_customer.is_active OR v_customer.branch_id<>c.branch_id THEN
    RAISE EXCEPTION 'El cliente debe estar activo en la misma sucursal del consumo.';
  END IF;
  IF v_customer_id<>c.customer_id THEN
    v_credit:=public.vinos_consumption_credit(v_customer_id);
    IF coalesce((v_credit->>'overdue')::boolean,false)
      OR coalesce((v_credit->>'overdue_consumption')::boolean,false)
      OR coalesce((v_credit->>'unknown_due_dates')::boolean,false) THEN
      RAISE EXCEPTION 'El nuevo cliente tiene credito o consumos vencidos.';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'customer_id',c.customer_id,'customer_name',c.customer_name,'due_date',c.due_date,'price_type',c.price_type,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,
      'qty',i.qty_out,'unit_price',i.unit_price) ORDER BY i.product_id)
      FROM public.vinos_consumption_items i WHERE i.consumption_id=c.id),'[]'::jsonb)
  ) INTO v_old_data;

  -- El stock cambia por la diferencia entre lo que salio antes y lo que saldra ahora.
  FOR r IN
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(p_input->'items') AS x(product_id uuid,qty numeric,unit_price numeric)
    )
    SELECT coalesce(n.product_id,o.product_id) AS product_id,
      coalesce(o.qty_out,0)::numeric AS old_qty,coalesce(n.qty,0)::numeric AS new_qty,
      n.unit_price,o.id AS item_id,o.product_uom_id AS old_uom_id
    FROM incoming n FULL JOIN public.vinos_consumption_items o
      ON o.consumption_id=c.id AND o.product_id=n.product_id
    ORDER BY coalesce(n.product_id,o.product_id)
  LOOP
    SELECT qty INTO STRICT v_stock FROM public.product_stocks
      WHERE branch_id=c.branch_id AND product_id=r.product_id FOR UPDATE;
    v_delta:=r.old_qty-r.new_qty;
    IF v_stock+v_delta<0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id=r.product_id;
      RAISE EXCEPTION 'Stock insuficiente para %.',coalesce(v_product_name,r.product_id::text);
    END IF;

    IF r.new_qty>0 THEN
      SELECT name INTO STRICT v_product_name FROM public.products
        WHERE id=r.product_id AND (r.item_id IS NOT NULL OR (is_active AND deleted_at IS NULL));
      IF r.old_uom_id IS NOT NULL THEN
        v_uom:=r.old_uom_id;
      ELSE
        SELECT id INTO v_uom FROM public.product_uoms
          WHERE product_id=r.product_id AND factor_to_base=1 ORDER BY id LIMIT 1;
      END IF;
      IF v_uom IS NULL THEN
        RAISE EXCEPTION 'El producto % requiere una unidad base configurada.',v_product_name;
      END IF;
    END IF;

    IF v_delta<>0 THEN
      UPDATE public.product_stocks SET qty=qty+v_delta
        WHERE branch_id=c.branch_id AND product_id=r.product_id;
      INSERT INTO public.vinos_consumption_movements(consumption_id,product_id,branch_id,event,qty,stock_before,stock_after,actor_id)
        VALUES(c.id,r.product_id,c.branch_id,'AJUSTE_EDICION',v_delta,v_stock,v_stock+v_delta,v_actor);
    END IF;

    IF r.new_qty=0 THEN
      DELETE FROM public.vinos_consumption_items WHERE id=r.item_id;
    ELSIF r.item_id IS NULL THEN
      INSERT INTO public.vinos_consumption_items(consumption_id,product_id,product_uom_id,product_name,qty_out,unit_price)
        VALUES(c.id,r.product_id,v_uom,v_product_name,r.new_qty,r.unit_price);
    ELSE
      UPDATE public.vinos_consumption_items SET product_uom_id=v_uom,product_name=v_product_name,
        qty_out=r.new_qty,unit_price=r.unit_price WHERE id=r.item_id;
    END IF;
  END LOOP;

  UPDATE public.vinos_consumptions SET customer_id=v_customer.id,customer_name=v_customer.name,
    due_date=v_due,price_type=v_price_type,updated_at=now(),updated_by=v_actor WHERE id=c.id;
  SELECT jsonb_build_object(
    'customer_id',v_customer.id,'customer_name',v_customer.name,'due_date',v_due,'price_type',v_price_type,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,
      'qty',i.qty_out,'unit_price',i.unit_price) ORDER BY i.product_id)
      FROM public.vinos_consumption_items i WHERE i.consumption_id=c.id),'[]'::jsonb)
  ) INTO v_new_data;
  INSERT INTO public.vinos_consumption_edits(consumption_id,actor_id,reason,previous_data,new_data)
    VALUES(c.id,v_actor,v_reason,v_old_data,v_new_data);
  RETURN c.id;
END; $$;

REVOKE ALL ON FUNCTION public.edit_vinos_consumption(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_vinos_consumption(jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
