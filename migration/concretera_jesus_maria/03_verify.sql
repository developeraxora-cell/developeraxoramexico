-- Comparación tras 02_load.sql. Todos los deltas deben ser cero.
with expected(entity, n) as (
  values ('measure', 3), ('presentation_uom', 62), ('product', 38),
    ('presentation', 62), ('customer', 128), ('sale', 2221),
    ('sale_item', 2528),
    ('note', (select count(*) from migration_concretera_jm.ventas where credito = '1' and status = '1')),
    ('payment', (select count(*) from migration_concretera_jm.abonos a
      join migration_concretera_jm.ventas v on v.idventa = a.idventa
      where v.credito = '1' and v.status = '1'))
)
select e.entity, e.n as expected, count(m.legacy_id) as mapped, count(m.legacy_id) - e.n as delta
from expected e left join public.migration_concretera_jm_id_map m on m.entity = e.entity
group by e.entity, e.n order by e.entity;

select
  (select count(*) from migration_concretera_jm.clientes where diascredito::integer = 0 and status_credito = '0') as expected_without_credit,
  count(*) filter (where c.default_credit_days = 0 and c.credit_limit = 0) as imported_without_credit,
  count(*) filter (where c.default_credit_days = src.diascredito::integer) as matching_source_days
from migration_concretera_jm.clientes src
join public.migration_concretera_jm_id_map m on m.entity = 'customer' and m.legacy_id = src.idcliente
join public.concrete_credit_customers c on c.id = m.new_id::uuid;

select
  (select count(*) from migration_concretera_jm.clientes where status_credito = '0') as expected_disabled_credit,
  count(*) as audited_disabled_credit,
  count(*) filter (where d.source_credit_limit = src.credito::numeric) as matching_source_limits
from public.migration_concretera_jm_disabled_credit d
join migration_concretera_jm.clientes src on src.idcliente = d.legacy_customer_id;

select 'sales_total' as check_name,
  (select sum(total::numeric) from migration_concretera_jm.ventas) as source_total,
  (select sum(coalesce(t.cash_amount,0) + coalesce(t.credit_amount,0))
   from public.migration_concretera_jm_id_map m
   join public.concrete_inventory_transactions t on t.id = m.new_id::bigint
   where m.entity = 'sale') as target_total;

select 'items_total' as check_name,
  (select sum(subtotal::numeric) from migration_concretera_jm.listaventas) as source_total,
  (select sum(i.line_total) from public.migration_concretera_jm_id_map m
   join public.concrete_inventory_transaction_items i on i.id = m.new_id::bigint
   where m.entity = 'sale_item') as target_total;

select 'credit_paid' as check_name,
  (select sum(a.monto::numeric) from migration_concretera_jm.abonos a
   join migration_concretera_jm.ventas v on v.idventa = a.idventa
   where v.credito = '1' and v.status = '1') as source_total,
  (select sum(p.amount) from public.migration_concretera_jm_id_map m
   join public.concrete_credit_payments p on p.id = m.new_id::uuid
   where m.entity = 'payment') as target_total;

select 'active_credit_balance' as check_name,
  (select sum(greatest(v.total::numeric - coalesce(a.paid, 0), 0))
   from migration_concretera_jm.ventas v
   left join (select idventa, sum(monto::numeric) paid from migration_concretera_jm.abonos group by idventa) a using (idventa)
   where v.credito = '1' and v.status = '1') as source_total,
  (select sum(n.balance) from public.migration_concretera_jm_id_map m
   join public.concrete_credit_notes n on n.id = m.new_id::uuid
   where m.entity = 'note') as target_total;

select 'stock_qty' as check_name,
  (select sum(greatest(stock::numeric, 0)) from migration_concretera_jm.productos) as expected_operational_stock,
  (select sum(s.qty_base) from public.migration_concretera_jm_id_map m
   join public.concrete_inventory_stock s on s.product_id = m.new_id::bigint and s.branch_id = 2
   where m.entity = 'product') as target_operational_stock;

-- Los stocks negativos del origen quedan registrados fuera del inventario
-- operativo, que exige cantidades no negativas.
select
  (select count(*) from migration_concretera_jm.productos where stock::numeric < 0) as expected_deficit_products,
  count(*) as recorded_deficit_products,
  (select sum(stock::numeric) from migration_concretera_jm.productos where stock::numeric < 0) as source_negative_stock,
  sum(d.source_stock) as recorded_negative_stock,
  sum(d.imported_stock - d.source_stock) as deficit_to_reconcile
from public.migration_concretera_jm_stock_deficits d
where d.branch_id = 2;

select
  (select count(*) from migration_concretera_jm.productos where minimo::numeric < 0) as expected_negative_minimums,
  count(*) filter (where d.source_min_stock < 0) as recorded_negative_minimums,
  sum(d.imported_min_stock - d.source_min_stock) filter (where d.source_min_stock < 0) as minimum_adjustment
from public.migration_concretera_jm_stock_deficits d
where d.branch_id = 2;

select count(*) as migrated_canceled_sales
from public.migration_concretera_jm_id_map m
join public.concrete_inventory_transactions t on t.id = m.new_id::bigint
where m.entity = 'sale' and t.is_deleted = true;

-- El consecutivo visible de Concretera se lleva por sucursal.
select b.id as branch_id, b.code, c.last_number as last_visible_sale_number
from public.concrete_sale_counters c
join public.branches b on b.id = c.branch_id
order by b.id;
