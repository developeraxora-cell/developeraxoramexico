-- Ejecutar en SQL Editor del proyecto de MATERIALES, no VINOS.
-- La venta 4207 tiene ID interno 8440. Este script no ha sido ejecutado.
-- Fechas y responsable confirmados por el usuario para esta restauracion.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sale_restoration_receipts (
  sale_id bigint PRIMARY KEY,
  restored_at timestamptz NOT NULL DEFAULT now(),
  restored_by text NOT NULL,
  reason text NOT NULL,
  previous_sale jsonb NOT NULL,
  stock_changes jsonb NOT NULL,
  credit_note jsonb NOT NULL
);
ALTER TABLE public.sale_restoration_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_restoration_receipts FROM anon, authenticated;

DO $restore$
DECLARE
  v_issue_date date := DATE '2026-09-29';
  v_due_date date := DATE '2026-10-29';
  v_responsible text := 'Administrador Principal';
  v_sale public.inventory_transactions%ROWTYPE;
  v_note public.credit_notes%ROWTYPE;
  v_item record;
  v_before numeric;
  v_changes jsonb := '[]'::jsonb;
  v_reason text := 'Restauracion autorizada de venta #4207 con los mismos bultos, cantidades y precios originales.';
BEGIN
  IF v_issue_date IS NULL OR v_due_date IS NULL
     OR v_due_date <= v_issue_date OR nullif(btrim(v_responsible), '') IS NULL THEN
    RAISE EXCEPTION 'Completar responsable y fechas originales del credito antes de ejecutar. No se modifico la venta.';
  END IF;

  SELECT * INTO STRICT v_sale FROM public.inventory_transactions
  WHERE id = 8440 FOR UPDATE;
  IF v_sale.is_deleted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'La venta ya esta activa; se evita un segundo descuento.';
  END IF;
  IF v_sale.branch_id <> 1 OR v_sale.reference IS DISTINCT FROM '4207'
     OR v_sale.type IS DISTINCT FROM 'SALE'
     OR v_sale.business_unit IS DISTINCT FROM 'materiales'
     OR v_sale.payment_type IS DISTINCT FROM 'CREDITO'
     OR v_sale.credit_amount IS DISTINCT FROM 3730
     OR coalesce(v_sale.wallet_amount, 0) <> 0
     OR coalesce(v_sale.cash_amount, 0) <> 0 THEN
    RAISE EXCEPTION 'La venta cambio respecto a la revision; detener y revisar.';
  END IF;

  LOCK TABLE public.inventory_transaction_items IN SHARE MODE;
  IF (SELECT count(*) FROM public.inventory_transaction_items WHERE transaction_id=8440) <> 2
     OR (SELECT count(*) FROM public.inventory_transaction_items WHERE transaction_id=8440 AND (
       (id=14068 AND product_id=1666 AND product_uom_id=3874 AND qty=14 AND factor_used=50 AND qty_base=700 AND unit_price=250)
       OR (id=14069 AND product_id=1805 AND product_uom_id=3920 AND qty=2 AND factor_used=1 AND qty_base=2 AND unit_price=115)
     )) <> 2 THEN
    RAISE EXCEPTION 'Las partidas cambiaron respecto a la venta original.';
  END IF;

  LOCK TABLE public.credit_notes IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.credit_notes WHERE inventory_transaction_id=8440
    OR (branch_id=1 AND business_unit='materiales' AND (folio='4207' OR sale_reference='4207'))) THEN
    RAISE EXCEPTION 'Ya existe un credito relacionado; revisar antes de duplicarlo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_customers
      WHERE id='bfbbdd15-c182-4486-a64c-bdd5fa13e202' AND branch_id=1 AND business_unit='materiales') THEN
    RAISE EXCEPTION 'No se encontro el cliente original en la sucursal.';
  END IF;

  FOR v_item IN SELECT product_id, sum(qty_base) AS qty_base
    FROM public.inventory_transaction_items WHERE transaction_id=8440
    GROUP BY product_id ORDER BY product_id
  LOOP
    SELECT qty_base INTO STRICT v_before FROM public.inventory_stock
    WHERE branch_id=1 AND product_id=v_item.product_id FOR UPDATE;
    IF v_before IS NULL OR v_before < v_item.qty_base THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %.', v_item.product_id;
    END IF;
    UPDATE public.inventory_stock SET qty_base=qty_base-v_item.qty_base, updated_at=now()
    WHERE branch_id=1 AND product_id=v_item.product_id;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'product_id', v_item.product_id, 'stock_before', v_before,
      'movement', -v_item.qty_base, 'stock_after', v_before-v_item.qty_base));
  END LOOP;

  INSERT INTO public.credit_notes (
    branch_id,business_unit,customer_id,inventory_transaction_id,folio,sale_reference,
    issue_date,credit_days_applied,due_date,total,paid_amount,balance,notes
  ) VALUES (
    1,'materiales','bfbbdd15-c182-4486-a64c-bdd5fa13e202',8440,'4207','4207',
    v_issue_date,v_due_date-v_issue_date,v_due_date,3730,0,3730,v_reason
  ) RETURNING * INTO v_note;

  INSERT INTO public.sale_restoration_receipts (
    sale_id,restored_by,reason,previous_sale,stock_changes,credit_note
  ) VALUES (8440,v_responsible,v_reason,to_jsonb(v_sale),v_changes,to_jsonb(v_note));

  UPDATE public.inventory_transactions
  SET is_deleted=false, deleted_at=NULL, deleted_by=NULL, delete_note=NULL
  WHERE id=8440;
END;
$restore$;

COMMIT;

-- El recibo local conserva la evidencia en la misma transaccion.
-- La copia al modulo central de auditoria MongoDB requiere envio posterior.
SELECT * FROM public.sale_restoration_receipts WHERE sale_id=8440;
