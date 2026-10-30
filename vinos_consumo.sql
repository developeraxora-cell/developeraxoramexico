-- Casa Tahona / VINOS solamente. Ejecutar antes de publicar el frontend.
-- No modifica existencias historicas. Plazo inicial autorizado: 30 dias.
BEGIN;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_days integer NOT NULL DEFAULT 30 CHECK (credit_days > 0);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS credit_due_date date;
UPDATE public.sales s SET credit_due_date = (s.created_at AT TIME ZONE 'America/Mexico_City')::date + c.credit_days
FROM public.customers c WHERE c.id=s.customer_id AND s.credit_used > 0 AND s.credit_due_date IS NULL;

CREATE TABLE public.vinos_consumptions (
  id uuid PRIMARY KEY, folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id), customer_name text NOT NULL,
  due_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SETTLED')),
  price_type text NOT NULL CHECK (price_type IN ('MENUDEO','MEDIO_MAYOREO','MAYOREO')),
  settled_at timestamptz, settled_by text, payment_method text,
  sale_id uuid UNIQUE REFERENCES public.sales(id), total numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX ON public.vinos_consumptions(customer_id,due_date) WHERE status='OPEN';
CREATE INDEX ON public.vinos_consumptions(branch_id,created_at);
CREATE TABLE public.vinos_consumption_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consumption_id uuid NOT NULL REFERENCES public.vinos_consumptions(id),
  product_id uuid NOT NULL REFERENCES public.products(id), product_uom_id uuid NOT NULL REFERENCES public.product_uoms(id),
  product_name text NOT NULL, qty_out integer NOT NULL CHECK(qty_out>0),
  qty_returned integer NOT NULL DEFAULT 0 CHECK(qty_returned>=0 AND qty_returned<=qty_out),
  unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0), UNIQUE(consumption_id,product_id)
);
CREATE TABLE public.vinos_consumption_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consumption_id uuid NOT NULL REFERENCES public.vinos_consumptions(id), product_id uuid NOT NULL REFERENCES public.products(id),
  branch_id bigint NOT NULL, event text NOT NULL CHECK(event IN ('SALIDA','DEVOLUCION')),
  qty numeric NOT NULL, stock_before numeric NOT NULL, stock_after numeric NOT NULL,
  actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consumption_id,product_id,event), CHECK(stock_after=stock_before+qty)
);
ALTER TABLE public.vinos_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinos_consumption_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinos_consumption_movements ENABLE ROW LEVEL SECURITY;
-- El cliente VINOS usa la conexion anon y autenticacion externa del sistema.
-- Escritura solamente por RPC; el actor se registra segun el contrato existente.
CREATE POLICY consumption_read ON public.vinos_consumptions FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY consumption_items_read ON public.vinos_consumption_items FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY consumption_movements_read ON public.vinos_consumption_movements FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.vinos_consumptions,public.vinos_consumption_items,public.vinos_consumption_movements TO anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.vinos_consumptions,public.vinos_consumption_items,public.vinos_consumption_movements FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.vinos_consumption_credit(p_customer_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH credits AS (
    SELECT s.id, s.credit_used, s.credit_due_date,
      coalesce((SELECT sum(p.amount) FROM public.credit_payments p WHERE p.sale_id=s.id AND p.deleted_at IS NULL),0) paid
    FROM public.sales s WHERE s.customer_id=p_customer_id AND s.deleted_at IS NULL AND s.payment_method='CREDITO'
  ), totals AS (
    SELECT greatest(0,coalesce((SELECT sum(credit_used) FROM credits),0)-
      coalesce((SELECT sum(amount) FROM public.credit_payments WHERE customer_id=p_customer_id AND deleted_at IS NULL),0)) debt
  ), pending AS (
    SELECT coalesce(sum(greatest(credit_used-paid,0)) FILTER (WHERE credit_due_date<(now() AT TIME ZONE 'America/Mexico_City')::date),0) overdue,
      coalesce(sum(greatest(credit_used-paid,0)) FILTER (WHERE credit_due_date IS NULL),0) undated,
      greatest(0,coalesce((SELECT sum(amount) FROM public.credit_payments WHERE customer_id=p_customer_id AND deleted_at IS NULL),0)-coalesce(sum(paid),0)) unallocated
    FROM credits
  ) SELECT jsonb_build_object('credit_limit',c.credit_limit,'debt',t.debt,
    'available',greatest(0,c.credit_limit-t.debt),'credit_days',c.credit_days,
    'unknown_due_dates',t.debt>0 AND p.undated>greatest(0,p.unallocated-p.overdue),
    'overdue',t.debt>0 AND p.overdue>p.unallocated,
    'overdue_consumption',EXISTS(SELECT 1 FROM public.vinos_consumptions v WHERE v.customer_id=c.id AND v.status='OPEN' AND v.due_date<(now() AT TIME ZONE 'America/Mexico_City')::date))
  FROM public.customers c CROSS JOIN totals t CROSS JOIN pending p WHERE c.id=p_customer_id;
$$;

-- Serializa cambios de credito del POS y Consumo sobre el mismo cliente.
CREATE OR REPLACE FUNCTION public.vinos_consumption_credit_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND (NEW.credit_used>0 OR (TG_OP='UPDATE' AND OLD.credit_used>0)) THEN
    PERFORM 1 FROM public.customers WHERE id=NEW.customer_id FOR UPDATE;
    IF NEW.credit_used>0 AND NEW.credit_due_date IS NULL THEN
      SELECT (NEW.created_at AT TIME ZONE 'America/Mexico_City')::date+credit_days
      INTO NEW.credit_due_date FROM public.customers WHERE id=NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER vinos_consumption_credit_lock BEFORE INSERT OR UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.vinos_consumption_credit_lock();

CREATE OR REPLACE FUNCTION public.vinos_consumption_outstanding(p_branch_id bigint)
RETURNS TABLE(product_id uuid,qty bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT i.product_id,sum(i.qty_out)::bigint FROM public.vinos_consumption_items i
 JOIN public.vinos_consumptions c ON c.id=i.consumption_id
 WHERE c.branch_id=p_branch_id AND c.status='OPEN' GROUP BY i.product_id;
$$;

CREATE OR REPLACE FUNCTION public.create_vinos_consumption(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid := (p_input->>'id')::uuid;
  v_customer public.customers%ROWTYPE;
  v_branch bigint := (p_input->>'branch_id')::bigint;
  v_actor text := p_input->>'actor_id';
  v_due date := (p_input->>'due_date')::date;
  v_credit jsonb; r record; v_qty numeric; v_name text; v_uom uuid;
BEGIN
  IF v_id IS NULL OR v_branch IS NULL OR nullif(trim(v_actor),'') IS NULL OR v_due IS NULL
    OR v_due<(now() AT TIME ZONE 'America/Mexico_City')::date THEN RAISE EXCEPTION 'Datos de salida invalidos.'; END IF;
  SELECT * INTO STRICT v_customer FROM public.customers WHERE id=(p_input->>'customer_id')::uuid FOR UPDATE;
  IF NOT v_customer.is_active OR v_customer.branch_id<>v_branch THEN RAISE EXCEPTION 'Cliente no disponible en esta sucursal.'; END IF;
  IF EXISTS(SELECT 1 FROM public.vinos_consumptions WHERE id=v_id) THEN
    IF NOT EXISTS(SELECT 1 FROM public.vinos_consumptions WHERE id=v_id AND customer_id=v_customer.id AND branch_id=v_branch
      AND due_date=v_due AND price_type=p_input->>'price_type')
      OR jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Esta salida ya fue registrada con otros datos. Consulta el folio antes de repetirla.';
    END IF;
    IF jsonb_array_length(p_input->'items')<>(SELECT count(*) FROM public.vinos_consumption_items WHERE consumption_id=v_id)
      OR EXISTS(SELECT product_id,qty,round(unit_price,2) FROM jsonb_to_recordset(p_input->'items') AS x(product_id uuid,qty numeric,unit_price numeric)
        EXCEPT SELECT product_id,qty_out,unit_price FROM public.vinos_consumption_items WHERE consumption_id=v_id) THEN
      RAISE EXCEPTION 'Esta salida ya fue registrada con otras cantidades o precios. Consulta el folio antes de repetirla.';
    END IF;
    RETURN v_id;
  END IF;
  v_credit := public.vinos_consumption_credit(v_customer.id);
  IF (v_credit->>'overdue')::boolean OR (v_credit->>'overdue_consumption')::boolean
    OR (v_credit->>'unknown_due_dates')::boolean THEN RAISE EXCEPTION 'Cliente bloqueado por consumo o credito vencido, o credito pendiente sin fecha de vencimiento.'; END IF;
  IF jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'items')=0 THEN RAISE EXCEPTION 'Agrega productos.'; END IF;
  INSERT INTO public.vinos_consumptions(id,branch_id,customer_id,customer_name,due_date,created_by,price_type)
  VALUES(v_id,v_branch,v_customer.id,v_customer.name,v_due,v_actor,p_input->>'price_type');
  FOR r IN SELECT * FROM jsonb_to_recordset(p_input->'items') AS x(product_id uuid,qty numeric,unit_price numeric) ORDER BY product_id LOOP
    IF r.qty IS NULL OR r.qty<=0 OR r.qty>2147483647 OR r.qty<>trunc(r.qty) OR r.unit_price IS NULL OR r.unit_price<0 OR r.unit_price>=10000000000 THEN RAISE EXCEPTION 'Piezas o precio invalidos.'; END IF;
    SELECT name INTO STRICT v_name FROM public.products WHERE id=r.product_id AND is_active AND deleted_at IS NULL;
    SELECT id INTO v_uom FROM public.product_uoms WHERE product_id=r.product_id AND factor_to_base=1 ORDER BY id LIMIT 1;
    IF v_uom IS NULL THEN RAISE EXCEPTION 'El producto % requiere una unidad base configurada.',v_name; END IF;
    SELECT qty INTO STRICT v_qty FROM public.product_stocks WHERE product_id=r.product_id AND branch_id=v_branch FOR UPDATE;
    IF v_qty<r.qty THEN RAISE EXCEPTION 'Stock insuficiente: % (disponible %).',v_name,v_qty; END IF;
    INSERT INTO public.vinos_consumption_items(consumption_id,product_id,product_uom_id,product_name,qty_out,unit_price)
    VALUES(v_id,r.product_id,v_uom,v_name,r.qty,r.unit_price);
    UPDATE public.product_stocks SET qty=qty-r.qty WHERE product_id=r.product_id AND branch_id=v_branch;
    INSERT INTO public.vinos_consumption_movements(consumption_id,product_id,branch_id,event,qty,stock_before,stock_after,actor_id)
    VALUES(v_id,r.product_id,v_branch,'SALIDA',-r.qty,v_qty,v_qty-r.qty,v_actor);
  END LOOP;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.settle_vinos_consumption(p_id uuid,p_actor_id text,p_payment text,p_returns jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c public.vinos_consumptions%ROWTYPE; r record; v_back numeric; v_stock numeric;
  v_total numeric:=0; v_sale uuid; v_credit jsonb; v_session uuid;
BEGIN
  SELECT * INTO STRICT c FROM public.vinos_consumptions WHERE id=p_id FOR UPDATE;
  IF c.status='SETTLED' THEN RETURN c.sale_id; END IF;
  IF nullif(trim(p_actor_id),'') IS NULL OR p_payment IS NULL OR p_payment NOT IN ('EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO') THEN RAISE EXCEPTION 'Metodo de pago o usuario invalido.'; END IF;
  PERFORM 1 FROM public.customers WHERE id=c.customer_id FOR UPDATE;
  IF jsonb_typeof(p_returns) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Devoluciones invalidas.'; END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric))<>(SELECT count(*) FROM public.vinos_consumption_items WHERE consumption_id=p_id)
    OR EXISTS(SELECT 1 FROM jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) GROUP BY id HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) WHERE NOT EXISTS(SELECT 1 FROM public.vinos_consumption_items i WHERE i.id=x.id AND i.consumption_id=p_id)) THEN
    RAISE EXCEPTION 'Debe indicar una devolucion para cada partida, sin duplicados.';
  END IF;
  FOR r IN SELECT i.*,x.qty AS returned FROM public.vinos_consumption_items i
    JOIN jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) ON x.id=i.id WHERE i.consumption_id=p_id LOOP
    IF r.returned IS NULL OR r.returned<0 OR r.returned>r.qty_out OR r.returned<>trunc(r.returned) THEN RAISE EXCEPTION 'Cantidad devuelta invalida para %.',r.product_name; END IF;
    v_total := v_total+(r.qty_out-r.returned)*r.unit_price;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.vinos_consumption_items i JOIN jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) ON x.id=i.id
    WHERE i.consumption_id=p_id AND i.qty_out>x.qty) THEN
    SELECT id INTO v_session FROM public.cash_register_sessions WHERE branch_id=c.branch_id AND cashier_user_id=p_actor_id
      AND closed_at IS NULL AND (opened_at AT TIME ZONE 'America/Mexico_City')::date=(now() AT TIME ZONE 'America/Mexico_City')::date
      ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
    IF v_session IS NULL THEN RAISE EXCEPTION 'Abre la caja del dia antes de liquidar.'; END IF;
    IF p_payment='CREDITO' THEN
      v_credit:=public.vinos_consumption_credit(c.customer_id);
      IF coalesce((v_credit->>'credit_limit')::numeric,0)<=0 OR (v_credit->>'overdue')::boolean
        OR (v_credit->>'unknown_due_dates')::boolean OR (v_credit->>'available')::numeric<v_total THEN
        RAISE EXCEPTION 'Credito no autorizado, vencido o insuficiente.';
      END IF;
    END IF;
  END IF;
  -- Crear la venta sin descontar de nuevo: la mercancia ya salio al abrir el consumo.
  IF EXISTS(SELECT 1 FROM public.vinos_consumption_items i JOIN jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) ON x.id=i.id
    WHERE i.consumption_id=p_id AND i.qty_out>x.qty) THEN
    v_sale:=gen_random_uuid();
    INSERT INTO public.sales(id,branch_id,customer_id,payment_method,price_type,subtotal,discount_amount,total,wallet_used,credit_used,cash_received,notes,created_by)
    SELECT s.id,s.branch_id,s.customer_id,s.payment_method,s.price_type,s.subtotal,s.discount_amount,s.total,s.wallet_used,s.credit_used,s.cash_received,s.notes,s.created_by
    FROM jsonb_populate_record(NULL::public.sales,jsonb_build_object(
      'id',v_sale,'branch_id',c.branch_id,'customer_id',c.customer_id,'payment_method',p_payment,'price_type',c.price_type,
      'subtotal',v_total,'discount_amount',0,'total',v_total,'wallet_used',0,'credit_used',CASE WHEN p_payment='CREDITO' THEN v_total ELSE 0 END,
      'cash_received',CASE WHEN p_payment='EFECTIVO' THEN v_total ELSE 0 END,'notes','Liquidacion CON-'||c.folio,'created_by',p_actor_id)) s;
  END IF;
  FOR r IN SELECT i.*,x.qty AS returned FROM public.vinos_consumption_items i
    JOIN jsonb_to_recordset(p_returns) AS x(id uuid,qty numeric) ON x.id=i.id WHERE i.consumption_id=p_id ORDER BY i.product_id LOOP
    SELECT qty INTO STRICT v_stock FROM public.product_stocks WHERE branch_id=c.branch_id AND product_id=r.product_id FOR UPDATE;
    IF r.returned>0 THEN
      UPDATE public.product_stocks SET qty=qty+r.returned WHERE branch_id=c.branch_id AND product_id=r.product_id;
      INSERT INTO public.vinos_consumption_movements(consumption_id,product_id,branch_id,event,qty,stock_before,stock_after,actor_id)
      VALUES(p_id,r.product_id,c.branch_id,'DEVOLUCION',r.returned,v_stock,v_stock+r.returned,p_actor_id);
    END IF;
    UPDATE public.vinos_consumption_items SET qty_returned=r.returned WHERE id=r.id;
    IF r.qty_out>r.returned THEN
      INSERT INTO public.sale_items(sale_id,product_id,product_uom_id,qty,factor_used,qty_base,price_type,unit_price,line_total)
      SELECT s.sale_id,s.product_id,s.product_uom_id,s.qty,s.factor_used,s.qty_base,s.price_type,s.unit_price,s.line_total
      FROM jsonb_populate_record(NULL::public.sale_items,jsonb_build_object('sale_id',v_sale,'product_id',r.product_id,
        'product_uom_id',r.product_uom_id,'qty',r.qty_out-r.returned,'factor_used',1,'qty_base',r.qty_out-r.returned,
        'price_type',c.price_type,'unit_price',r.unit_price,'line_total',(r.qty_out-r.returned)*r.unit_price)) s;
    END IF;
  END LOOP;
  UPDATE public.vinos_consumptions SET status='SETTLED',settled_at=now(),settled_by=p_actor_id,payment_method=p_payment,sale_id=v_sale,total=v_total WHERE id=p_id;
  RETURN v_sale;
END; $$;

-- Una venta vinculada no puede cancelarse por el flujo antiguo (repondria stock sin reabrir el consumo).
CREATE OR REPLACE FUNCTION public.protect_vinos_consumption_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.vinos_consumptions WHERE sale_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Venta vinculada a consumo liquidado; requiere conciliacion de consumo.'; END IF;
   IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.credit_used IS DISTINCT FROM OLD.credit_used THEN
     RAISE EXCEPTION 'Venta vinculada a consumo liquidado; requiere conciliacion de consumo.';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_vinos_consumption_sale BEFORE UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.protect_vinos_consumption_sale();

REVOKE ALL ON FUNCTION public.create_vinos_consumption(jsonb),public.settle_vinos_consumption(uuid,text,text,jsonb),public.vinos_consumption_credit(uuid),public.vinos_consumption_outstanding(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vinos_consumption(jsonb),public.settle_vinos_consumption(uuid,text,text,jsonb),public.vinos_consumption_credit(uuid),public.vinos_consumption_outstanding(bigint) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
