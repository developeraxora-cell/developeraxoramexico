-- Casa Tahona: consolidar renglones repetidos legitimos en una misma venta.
-- Ejecutar solo para ventas revisadas donde el mismo producto fue agregado en
-- dos renglones con misma unidad, tipo de precio y precio unitario, pero debe
-- quedar como una sola linea sumando cantidades.
--
-- IMPORTANTE:
-- Este script NO toca product_stocks porque no cambia la cantidad total vendida.
-- Solo une renglones de sale_items y recalcula subtotal/total con el mismo monto.
--
-- Cambia SALE_ID_A_CONSOLIDAR por la venta revisada.

begin;

with duplicate_groups as (
  select
    si.sale_id,
    si.product_id,
    si.product_uom_id,
    si.price_type,
    si.unit_price,
    min(si.id) as keep_id,
    sum(si.qty) as qty_total,
    sum(si.qty_base) as qty_base_total,
    sum(si.line_total) as line_total_total,
    array_agg(si.id order by si.id) as item_ids
  from public.sale_items si
  where si.sale_id = 'SALE_ID_A_CONSOLIDAR'
  group by
    si.sale_id,
    si.product_id,
    si.product_uom_id,
    si.price_type,
    si.unit_price
  having count(*) > 1
),
updated_keep_rows as (
  update public.sale_items si
  set
    qty = dg.qty_total,
    qty_base = dg.qty_base_total,
    line_total = dg.line_total_total
  from duplicate_groups dg
  where si.id = dg.keep_id
  returning si.sale_id
),
deleted_duplicate_rows as (
  delete from public.sale_items si
  using duplicate_groups dg
  where si.sale_id = dg.sale_id
    and si.product_id = dg.product_id
    and coalesce(si.product_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(dg.product_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and si.price_type = dg.price_type
    and si.unit_price = dg.unit_price
    and si.id <> dg.keep_id
  returning si.sale_id
),
sale_totals as (
  select
    sale_id,
    sum(line_total) as subtotal
  from public.sale_items
  where sale_id = 'SALE_ID_A_CONSOLIDAR'
  group by sale_id
)
update public.sales s
set
  subtotal = st.subtotal,
  total = greatest(
    0,
    st.subtotal
    - coalesce(s.discount_amount, 0)
    - coalesce(s.wallet_used, 0)
  )
from sale_totals st
where s.id = st.sale_id;

commit;
