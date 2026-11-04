-- VINOS / Casa Tahona. Migracion aditiva para permitir cancelar salidas abiertas.
-- Conserva el folio y el historial; devuelve cada partida al stock en una transaccion.
BEGIN;

ALTER TABLE public.vinos_consumptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.vinos_consumptions DROP CONSTRAINT IF EXISTS vinos_consumptions_status_check;
ALTER TABLE public.vinos_consumptions ADD CONSTRAINT vinos_consumptions_status_check
  CHECK (status IN ('OPEN','SETTLED','CANCELLED'));

ALTER TABLE public.vinos_consumption_movements DROP CONSTRAINT IF EXISTS vinos_consumption_movements_event_check;
ALTER TABLE public.vinos_consumption_movements ADD CONSTRAINT vinos_consumption_movements_event_check
  CHECK (event IN ('SALIDA','DEVOLUCION','CANCELACION'));

CREATE OR REPLACE FUNCTION public.cancel_vinos_consumption(p_id uuid,p_actor_id text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c public.vinos_consumptions%ROWTYPE;
  i record;
  v_stock numeric;
BEGIN
  SELECT * INTO STRICT c FROM public.vinos_consumptions WHERE id=p_id FOR UPDATE;
  IF c.status='CANCELLED' THEN RETURN; END IF;
  IF c.status<>'OPEN' THEN RAISE EXCEPTION 'Solo se pueden cancelar salidas abiertas. La liquidacion ya registro una venta.'; END IF;
  IF nullif(trim(p_actor_id),'') IS NULL OR nullif(trim(p_reason),'') IS NULL OR length(trim(p_reason))>500 THEN
    RAISE EXCEPTION 'Indica quien cancela y el motivo.';
  END IF;

  FOR i IN SELECT * FROM public.vinos_consumption_items WHERE consumption_id=p_id ORDER BY product_id LOOP
    SELECT qty INTO STRICT v_stock FROM public.product_stocks
      WHERE branch_id=c.branch_id AND product_id=i.product_id FOR UPDATE;
    UPDATE public.product_stocks SET qty=qty+i.qty_out
      WHERE branch_id=c.branch_id AND product_id=i.product_id;
    UPDATE public.vinos_consumption_items SET qty_returned=qty_out WHERE id=i.id;
    INSERT INTO public.vinos_consumption_movements(consumption_id,product_id,branch_id,event,qty,stock_before,stock_after,actor_id)
      VALUES(p_id,i.product_id,c.branch_id,'CANCELACION',i.qty_out,v_stock,v_stock+i.qty_out,p_actor_id);
  END LOOP;

  UPDATE public.vinos_consumptions SET status='CANCELLED',cancelled_at=now(),cancelled_by=p_actor_id,
    cancel_reason=trim(p_reason) WHERE id=p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.protect_cancelled_vinos_consumption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.status='CANCELLED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Una salida cancelada no se puede liquidar ni reabrir.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_cancelled_vinos_consumption ON public.vinos_consumptions;
CREATE TRIGGER protect_cancelled_vinos_consumption BEFORE UPDATE ON public.vinos_consumptions
FOR EACH ROW EXECUTE FUNCTION public.protect_cancelled_vinos_consumption();

REVOKE ALL ON FUNCTION public.cancel_vinos_consumption(uuid,text,text),public.protect_cancelled_vinos_consumption() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_vinos_consumption(uuid,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
