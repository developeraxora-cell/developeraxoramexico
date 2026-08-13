-- Carga idempotente desde migration_vinos.legacy_* hacia public.*.
-- Recomendacion: cambiar commit por rollback durante pruebas.

begin;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create extension if not exists pgcrypto;
  end if;
end;
$$;

-- Usuario tecnico usado cuando origen no trae created_by.
create temp table _migration_defaults (
  created_by uuid not null
) on commit drop;

insert into _migration_defaults (created_by)
values ('00000000-0000-0000-0000-000000000001'::uuid);

insert into public.branches (code, name, address, phone, is_active)
select
  trim(code),
  trim(name),
  nullif(trim(address), ''),
  nullif(trim(phone), ''),
  coalesce(is_active, true)
from migration_vinos.legacy_branches
on conflict (code) do update
set
  name = excluded.name,
  address = excluded.address,
  phone = excluded.phone,
  is_active = excluded.is_active;

insert into public.categories (id, name, sort_order)
select
  migration_vinos.map_uuid('category', legacy_id),
  trim(name),
  coalesce(sort_order, 0)
from migration_vinos.legacy_categories
on conflict (name) do update
set sort_order = excluded.sort_order;

update public.migration_legacy_id_map m
set new_uuid = c.id
from migration_vinos.legacy_categories lc
join public.categories c on lower(c.name) = lower(trim(lc.name))
where m.entity = 'category'
  and m.legacy_id = lc.legacy_id
  and m.new_uuid <> c.id;

insert into public.brands (id, name)
select
  migration_vinos.map_uuid('brand', legacy_id),
  trim(name)
from migration_vinos.legacy_brands
on conflict (name) do nothing;

update public.migration_legacy_id_map m
set new_uuid = b.id
from migration_vinos.legacy_brands lb
join public.brands b on lower(b.name) = lower(trim(lb.name))
where m.entity = 'brand'
  and m.legacy_id = lb.legacy_id
  and m.new_uuid <> b.id;

insert into public.uoms (id, name, symbol, sort_order)
select
  migration_vinos.map_uuid('uom', legacy_id),
  trim(name),
  nullif(trim(symbol), ''),
  coalesce(sort_order, 0)
from migration_vinos.legacy_uoms
on conflict (name) do update
set
  symbol = excluded.symbol,
  sort_order = excluded.sort_order;

update public.migration_legacy_id_map m
set new_uuid = u.id
from migration_vinos.legacy_uoms lu
join public.uoms u on lower(u.name) = lower(trim(lu.name))
where m.entity = 'uom'
  and m.legacy_id = lu.legacy_id
  and m.new_uuid <> u.id;

insert into public.suppliers (id, name, phone, email, address, rfc, notes, is_active)
select
  migration_vinos.map_uuid('supplier', legacy_id),
  trim(name),
  nullif(trim(phone), ''),
  nullif(trim(email), ''),
  nullif(trim(address), ''),
  nullif(trim(rfc), ''),
  nullif(trim(notes), ''),
  coalesce(is_active, true)
from migration_vinos.legacy_suppliers
on conflict (id) do update
set
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  rfc = excluded.rfc,
  notes = excluded.notes,
  is_active = excluded.is_active;

with product_source as (
  select
    p.*,
    coalesce(
      brand_map.new_uuid,
      b_by_name.id
    ) as brand_id,
    coalesce(
      category_map.new_uuid,
      c_by_name.id
    ) as category_id,
    coalesce(
      uom_map.new_uuid,
      u_by_name.id
    ) as uom_id
  from migration_vinos.legacy_products p
  left join public.migration_legacy_id_map brand_map on brand_map.entity = 'brand' and brand_map.legacy_id = p.brand_legacy_id
  left join public.migration_legacy_id_map category_map on category_map.entity = 'category' and category_map.legacy_id = p.category_legacy_id
  left join public.migration_legacy_id_map uom_map on uom_map.entity = 'uom' and uom_map.legacy_id = p.uom_legacy_id
  left join public.brands b_by_name on p.brand_name is not null and lower(trim(b_by_name.name)) = lower(trim(p.brand_name))
  left join public.categories c_by_name on p.category_name is not null and lower(trim(c_by_name.name)) = lower(trim(p.category_name))
  left join public.uoms u_by_name on p.uom_name is not null and lower(trim(u_by_name.name)) = lower(trim(p.uom_name))
)
insert into public.products (
  id,
  sku,
  barcode,
  name,
  brand_id,
  category_id,
  origin_country,
  volume_ml,
  alcohol_pct,
  vintage_year,
  price_retail,
  price_mid_wholesale,
  price_wholesale,
  cost,
  purchase_cost,
  min_stock,
  max_stock,
  image_url,
  notes,
  is_active,
  uom_id,
  is_divisible,
  price_mid_wholesale_min_qty,
  price_wholesale_min_qty,
  single_price_mode
)
select
  migration_vinos.map_uuid('product', legacy_id),
  trim(sku),
  nullif(trim(barcode), ''),
  trim(name),
  brand_id,
  category_id,
  nullif(trim(origin_country), ''),
  volume_ml,
  alcohol_pct,
  vintage_year,
  coalesce(price_retail, 0),
  coalesce(price_mid_wholesale, 0),
  coalesce(price_wholesale, 0),
  coalesce(cost, 0),
  purchase_cost,
  coalesce(min_stock, 0),
  coalesce(max_stock, 9999),
  nullif(trim(image_url), ''),
  nullif(trim(notes), ''),
  coalesce(is_active, true),
  uom_id,
  coalesce(is_divisible, false),
  coalesce(price_mid_wholesale_min_qty, 6),
  coalesce(price_wholesale_min_qty, 12),
  coalesce(single_price_mode, false)
from product_source
on conflict (sku) do update
set
  barcode = excluded.barcode,
  name = excluded.name,
  brand_id = excluded.brand_id,
  category_id = excluded.category_id,
  origin_country = excluded.origin_country,
  volume_ml = excluded.volume_ml,
  alcohol_pct = excluded.alcohol_pct,
  vintage_year = excluded.vintage_year,
  price_retail = excluded.price_retail,
  price_mid_wholesale = excluded.price_mid_wholesale,
  price_wholesale = excluded.price_wholesale,
  cost = excluded.cost,
  purchase_cost = excluded.purchase_cost,
  min_stock = excluded.min_stock,
  max_stock = excluded.max_stock,
  image_url = excluded.image_url,
  notes = excluded.notes,
  is_active = excluded.is_active,
  uom_id = excluded.uom_id,
  is_divisible = excluded.is_divisible,
  price_mid_wholesale_min_qty = excluded.price_mid_wholesale_min_qty,
  price_wholesale_min_qty = excluded.price_wholesale_min_qty,
  single_price_mode = excluded.single_price_mode;

update public.migration_legacy_id_map m
set new_uuid = p.id
from migration_vinos.legacy_products lp
join public.products p on lower(p.sku) = lower(trim(lp.sku))
where m.entity = 'product'
  and m.legacy_id = lp.legacy_id
  and m.new_uuid <> p.id;

insert into public.product_uoms (
  id,
  product_id,
  uom_id,
  factor_to_base,
  price_retail,
  price_mid_wholesale,
  price_wholesale
)
select
  migration_vinos.map_uuid('product_uom', pu.legacy_id),
  migration_vinos.map_uuid('product', pu.product_legacy_id),
  coalesce(uom_map.new_uuid, u.id),
  coalesce(nullif(pu.factor_to_base, 0), 1),
  coalesce(pu.price_retail, 0),
  coalesce(pu.price_mid_wholesale, 0),
  coalesce(pu.price_wholesale, 0)
from migration_vinos.legacy_product_uoms pu
left join public.migration_legacy_id_map uom_map on uom_map.entity = 'uom' and uom_map.legacy_id = pu.uom_legacy_id
left join public.uoms u on lower(trim(u.name)) = lower(trim(pu.uom_name))
where coalesce(uom_map.new_uuid, u.id) is not null
  and migration_vinos.map_uuid('product', pu.product_legacy_id) is not null
on conflict (id) do update
set
  product_id = excluded.product_id,
  uom_id = excluded.uom_id,
  factor_to_base = excluded.factor_to_base,
  price_retail = excluded.price_retail,
  price_mid_wholesale = excluded.price_mid_wholesale,
  price_wholesale = excluded.price_wholesale;

insert into public.product_uoms (
  product_id,
  uom_id,
  factor_to_base,
  price_retail,
  price_mid_wholesale,
  price_wholesale
)
select
  migration_vinos.map_uuid('product', p.legacy_id),
  coalesce(uom_map.new_uuid, u.id),
  1,
  coalesce(p.price_retail, 0),
  coalesce(p.price_mid_wholesale, 0),
  coalesce(p.price_wholesale, 0)
from migration_vinos.legacy_products p
left join public.migration_legacy_id_map uom_map on uom_map.entity = 'uom' and uom_map.legacy_id = p.uom_legacy_id
left join public.uoms u on p.uom_name is not null and lower(trim(u.name)) = lower(trim(p.uom_name))
where coalesce(uom_map.new_uuid, u.id) is not null
  and not exists (
    select 1
    from public.product_uoms existing
    where existing.product_id = migration_vinos.map_uuid('product', p.legacy_id)
      and existing.uom_id = coalesce(uom_map.new_uuid, u.id)
      and existing.factor_to_base = 1
  );

insert into public.product_stocks (product_id, branch_id, qty)
select
  migration_vinos.map_uuid('product', s.product_legacy_id),
  b.id,
  coalesce(s.qty, 0)
from migration_vinos.legacy_product_stocks s
join migration_vinos.legacy_branches lb on lb.legacy_id = s.branch_legacy_id
join public.branches b on lower(b.code) = lower(trim(lb.code))
on conflict (product_id, branch_id) do update
set qty = excluded.qty;

insert into public.customers (
  id,
  branch_id,
  name,
  phone,
  email,
  birthday,
  gender,
  tags,
  status,
  preferred_payment_method,
  preferred_branch_id,
  notes,
  is_active,
  created_at,
  customer_types,
  credit_limit,
  wallet_enabled,
  wallet_balance
)
select
  migration_vinos.map_uuid('customer', c.legacy_id),
  b.id,
  trim(c.name),
  nullif(trim(c.phone), ''),
  nullif(trim(c.email), ''),
  c.birthday,
  case when c.gender in ('M', 'F', 'OTRO') then c.gender else null end,
  coalesce(c.tags, '{}'::text[]),
  case when c.status in ('ACTIVO', 'DORMIDO', 'EN_RIESGO', 'PERDIDO') then c.status else 'ACTIVO' end,
  nullif(trim(c.preferred_payment_method), ''),
  pb.id,
  nullif(trim(c.notes), ''),
  coalesce(c.is_active, true),
  coalesce(c.created_at, now()),
  coalesce(c.customer_types, array['vino']::text[]),
  coalesce(c.credit_limit, 0),
  coalesce(c.wallet_enabled, false),
  coalesce(c.wallet_balance, 0)
from migration_vinos.legacy_customers c
join migration_vinos.legacy_branches lb on lb.legacy_id = c.branch_legacy_id
join public.branches b on lower(b.code) = lower(trim(lb.code))
left join migration_vinos.legacy_branches lpb on lpb.legacy_id = c.preferred_branch_legacy_id
left join public.branches pb on lower(pb.code) = lower(trim(lpb.code))
on conflict (id) do update
set
  branch_id = excluded.branch_id,
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  birthday = excluded.birthday,
  gender = excluded.gender,
  tags = excluded.tags,
  status = excluded.status,
  preferred_payment_method = excluded.preferred_payment_method,
  preferred_branch_id = excluded.preferred_branch_id,
  notes = excluded.notes,
  is_active = excluded.is_active,
  customer_types = excluded.customer_types,
  credit_limit = excluded.credit_limit,
  wallet_enabled = excluded.wallet_enabled,
  wallet_balance = excluded.wallet_balance,
  updated_at = now();

insert into public.sales (
  id,
  branch_id,
  customer_id,
  payment_method,
  price_type,
  subtotal,
  discount_amount,
  total,
  delivery_address,
  notes,
  created_by,
  created_at,
  deleted_at,
  delete_note,
  coupon_code,
  wallet_used,
  credit_used,
  cash_received,
  payment_type_audit,
  split_payment_method,
  split_payment_amount
)
select
  migration_vinos.map_uuid('sale', s.legacy_id),
  b.id,
  migration_vinos.map_uuid('customer', s.customer_legacy_id),
  case when s.payment_method in ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO', 'CREDITO', 'PUNTOS', 'CORTESIA') then s.payment_method else 'EFECTIVO' end,
  case when s.price_type in ('MENUDEO', 'MEDIO_MAYOREO', 'MAYOREO', 'ESPECIAL') then s.price_type else 'MENUDEO' end,
  coalesce(s.subtotal, 0),
  coalesce(s.discount_amount, 0),
  coalesce(s.total, 0),
  nullif(trim(s.delivery_address), ''),
  nullif(trim(s.notes), ''),
  coalesce(s.created_by, d.created_by),
  coalesce(s.created_at, now()),
  s.deleted_at,
  nullif(trim(s.delete_note), ''),
  nullif(trim(s.coupon_code), ''),
  coalesce(s.wallet_used, 0),
  coalesce(s.credit_used, 0),
  coalesce(s.cash_received, 0),
  coalesce(s.payment_type_audit, '[]'::jsonb),
  nullif(trim(s.split_payment_method), ''),
  coalesce(s.split_payment_amount, 0)
from migration_vinos.legacy_sales s
cross join _migration_defaults d
join migration_vinos.legacy_branches lb on lb.legacy_id = s.branch_legacy_id
join public.branches b on lower(b.code) = lower(trim(lb.code))
where not exists (
  select 1
  from public.sales existing
  where existing.id = migration_vinos.map_uuid('sale', s.legacy_id)
);

insert into public.sale_items (
  id,
  sale_id,
  product_id,
  qty,
  price_type,
  unit_price,
  line_total,
  product_uom_id,
  factor_used,
  qty_base
)
select
  migration_vinos.map_uuid('sale_item', i.legacy_id),
  migration_vinos.map_uuid('sale', i.sale_legacy_id),
  migration_vinos.map_uuid('product', i.product_legacy_id),
  i.qty,
  case when i.price_type in ('MENUDEO', 'MEDIO_MAYOREO', 'MAYOREO', 'ESPECIAL') then i.price_type else 'MENUDEO' end,
  coalesce(i.unit_price, 0),
  coalesce(i.line_total, 0),
  migration_vinos.map_uuid('product_uom', i.product_uom_legacy_id),
  coalesce(i.factor_used, 1),
  coalesce(nullif(i.qty_base, 0), i.qty * coalesce(i.factor_used, 1))
from migration_vinos.legacy_sale_items i
where not exists (
  select 1
  from public.sale_items existing
  where existing.id = migration_vinos.map_uuid('sale_item', i.legacy_id)
);

insert into public.credit_payments (
  id,
  customer_id,
  sale_id,
  amount,
  payment_method,
  reference,
  notes,
  created_by,
  created_at,
  deleted_at
)
select
  migration_vinos.map_uuid('credit_payment', p.legacy_id),
  coalesce(migration_vinos.map_uuid('customer', p.customer_legacy_id), s.customer_id),
  migration_vinos.map_uuid('sale', p.sale_legacy_id),
  p.amount,
  case
    when p.payment_method in ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'SALDO_FAVOR') then p.payment_method
    else 'EFECTIVO'
  end,
  nullif(trim(p.reference), ''),
  nullif(trim(p.notes), ''),
  coalesce(p.created_by, d.created_by),
  coalesce(p.created_at, now()),
  p.deleted_at
from migration_vinos.legacy_credit_payments p
cross join _migration_defaults d
left join public.sales s on s.id = migration_vinos.map_uuid('sale', p.sale_legacy_id)
where p.amount > 0
  and coalesce(migration_vinos.map_uuid('customer', p.customer_legacy_id), s.customer_id) is not null
  and not exists (
    select 1
    from public.credit_payments existing
    where existing.id = migration_vinos.map_uuid('credit_payment', p.legacy_id)
  );

insert into public.purchases (
  id,
  branch_id,
  supplier_id,
  reference,
  purchase_date,
  total,
  notes,
  created_by,
  created_at,
  deleted_at,
  delete_note,
  is_credit
)
select
  migration_vinos.map_uuid('purchase', p.legacy_id),
  b.id,
  migration_vinos.map_uuid('supplier', p.supplier_legacy_id),
  nullif(trim(p.reference), ''),
  coalesce(p.purchase_date, current_date),
  coalesce(p.total, 0),
  nullif(trim(p.notes), ''),
  coalesce(p.created_by, d.created_by),
  coalesce(p.created_at, now()),
  p.deleted_at,
  nullif(trim(p.delete_note), ''),
  coalesce(p.is_credit, false)
from migration_vinos.legacy_purchases p
cross join _migration_defaults d
join migration_vinos.legacy_branches lb on lb.legacy_id = p.branch_legacy_id
join public.branches b on lower(b.code) = lower(trim(lb.code))
where not exists (
  select 1
  from public.purchases existing
  where existing.id = migration_vinos.map_uuid('purchase', p.legacy_id)
);

insert into public.purchase_items (
  id,
  purchase_id,
  product_id,
  qty,
  cost_per_unit,
  subtotal,
  product_uom_id,
  factor_used,
  qty_base
)
select
  migration_vinos.map_uuid('purchase_item', i.legacy_id),
  migration_vinos.map_uuid('purchase', i.purchase_legacy_id),
  migration_vinos.map_uuid('product', i.product_legacy_id),
  i.qty,
  coalesce(i.cost_per_unit, 0),
  coalesce(i.subtotal, 0),
  migration_vinos.map_uuid('product_uom', i.product_uom_legacy_id),
  coalesce(i.factor_used, 1),
  coalesce(nullif(i.qty_base, 0), i.qty * coalesce(i.factor_used, 1))
from migration_vinos.legacy_purchase_items i
where not exists (
  select 1
  from public.purchase_items existing
  where existing.id = migration_vinos.map_uuid('purchase_item', i.legacy_id)
);

-- Recalcula metricas basicas de cliente desde ventas migradas.
with customer_sales as (
  select
    s.customer_id,
    count(*)::integer as total_purchase_count,
    coalesce(sum(s.total), 0) as total_spent,
    coalesce(avg(s.total), 0) as avg_ticket,
    max(s.created_at::date) as last_purchase_date
  from public.sales s
  where s.customer_id is not null
    and s.deleted_at is null
  group by s.customer_id
)
update public.customers c
set
  total_purchase_count = cs.total_purchase_count,
  total_spent = cs.total_spent,
  ltv = cs.total_spent,
  avg_ticket = cs.avg_ticket,
  last_purchase_date = cs.last_purchase_date,
  updated_at = now()
from customer_sales cs
where c.id = cs.customer_id;

insert into public.customer_product_history (
  customer_id,
  product_id,
  purchase_count,
  total_qty,
  total_spent,
  first_purchased,
  last_purchased
)
select
  s.customer_id,
  si.product_id,
  count(*)::integer,
  coalesce(sum(si.qty), 0),
  coalesce(sum(si.line_total), 0),
  min(s.created_at::date),
  max(s.created_at::date)
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.customer_id is not null
  and s.deleted_at is null
group by s.customer_id, si.product_id
on conflict (customer_id, product_id) do update
set
  purchase_count = excluded.purchase_count,
  total_qty = excluded.total_qty,
  total_spent = excluded.total_spent,
  first_purchased = excluded.first_purchased,
  last_purchased = excluded.last_purchased;

select 'migration_vinos.legacy_branches' as table_name, count(*) as row_count from migration_vinos.legacy_branches
union all select 'migration_vinos.legacy_categories', count(*) from migration_vinos.legacy_categories
union all select 'migration_vinos.legacy_brands', count(*) from migration_vinos.legacy_brands
union all select 'migration_vinos.legacy_uoms', count(*) from migration_vinos.legacy_uoms
union all select 'migration_vinos.legacy_suppliers', count(*) from migration_vinos.legacy_suppliers
union all select 'migration_vinos.legacy_products', count(*) from migration_vinos.legacy_products
union all select 'migration_vinos.legacy_product_stocks', count(*) from migration_vinos.legacy_product_stocks
union all select 'migration_vinos.legacy_product_uoms', count(*) from migration_vinos.legacy_product_uoms
union all select 'migration_vinos.legacy_customers', count(*) from migration_vinos.legacy_customers
union all select 'migration_vinos.legacy_sales', count(*) from migration_vinos.legacy_sales
union all select 'migration_vinos.legacy_sale_items', count(*) from migration_vinos.legacy_sale_items
union all select 'migration_vinos.legacy_credit_payments', count(*) from migration_vinos.legacy_credit_payments
union all select 'migration_vinos.legacy_purchases', count(*) from migration_vinos.legacy_purchases
union all select 'migration_vinos.legacy_purchase_items', count(*) from migration_vinos.legacy_purchase_items
order by table_name;

select 'public.branches' as table_name, count(*) as row_count from public.branches
union all select 'public.categories', count(*) from public.categories
union all select 'public.brands', count(*) from public.brands
union all select 'public.uoms', count(*) from public.uoms
union all select 'public.suppliers', count(*) from public.suppliers
union all select 'public.products', count(*) from public.products
union all select 'public.product_uoms', count(*) from public.product_uoms
union all select 'public.product_stocks', count(*) from public.product_stocks
union all select 'public.customers', count(*) from public.customers
union all select 'public.sales', count(*) from public.sales
union all select 'public.sale_items', count(*) from public.sale_items
union all select 'public.credit_payments', count(*) from public.credit_payments
union all select 'public.purchases', count(*) from public.purchases
union all select 'public.purchase_items', count(*) from public.purchase_items
order by table_name;

commit;
