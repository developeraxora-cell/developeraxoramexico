-- Sincroniza catalogo y stock final de productos desde el staging de Jesus Maria.
-- Ejecutar despues de cargar staging y despues de 02_load_from_staging.sql.

begin;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'product', p.legacy_id, matched.id::text
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = p.branch_legacy_id
join lateral (
  select candidate.id
  from public.products candidate
  where candidate.branch_id = branch_map.new_id::bigint
    and coalesce(candidate.business_unit, 'materiales') = 'materiales'
    and (
      candidate.attrs->>'legacy_id' = p.legacy_id
      or lower(trim(coalesce(candidate.sku, ''))) = lower(trim(p.sku))
      or (
        nullif(trim(p.barcode), '') is not null
        and lower(trim(coalesce(candidate.barcode, ''))) = lower(trim(p.barcode))
      )
    )
  order by
    case when candidate.attrs->>'legacy_id' = p.legacy_id then 0 else 1 end,
    case when lower(trim(coalesce(candidate.sku, ''))) = lower(trim(p.sku)) then 0 else 1 end,
    candidate.id
  limit 1
) matched on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

update public.products product
set
  sku = case
    when nullif(trim(p.sku), '') is null then product.sku
    when exists (
      select 1
      from public.products sku_owner
      where sku_owner.branch_id = product.branch_id
        and sku_owner.id <> product.id
        and lower(trim(coalesce(sku_owner.sku, ''))) = lower(trim(p.sku))
    ) then product.sku
    else trim(p.sku)
  end,
  barcode = case
    when nullif(trim(p.barcode), '') is null then product.barcode
    when exists (
      select 1
      from public.products barcode_owner
      where barcode_owner.branch_id = product.branch_id
        and barcode_owner.id <> product.id
        and lower(trim(coalesce(barcode_owner.barcode, ''))) = lower(trim(p.barcode))
    ) then product.barcode
    else trim(p.barcode)
  end,
  name = trim(p.name),
  precio = coalesce(p.retail_price, 0),
  purchase_price = coalesce(p.purchase_price, 0),
  wholesale_price = coalesce(p.wholesale_price, 0),
  retail_price = coalesce(p.retail_price, 0),
  min_stock = coalesce(p.min_stock, 0),
  stock = coalesce(p.stock_qty, 0),
  description = nullif(trim(p.description), ''),
  category_id = category_map.new_id::bigint,
  base_uom_id = uom_map.new_id::bigint,
  is_divisible = coalesce(p.is_divisible, false),
  attrs = coalesce(product.attrs, '{}'::jsonb) || jsonb_build_object('legacy_id', p.legacy_id, 'source', 'concre45_crm2.sql'),
  is_active = coalesce(p.is_active, true),
  updated_at = now()
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map product_map
  on product_map.entity = 'product'
 and product_map.legacy_id = p.legacy_id
left join public.migration_materiales_jm_id_map category_map
  on category_map.entity = 'category'
 and category_map.legacy_id = p.category_legacy_id
join public.migration_materiales_jm_id_map uom_map
  on uom_map.entity = 'uom'
 and uom_map.legacy_id = p.base_uom_legacy_id
where product.id = product_map.new_id::bigint
  and product.branch_id in (
    select new_id::bigint
    from public.migration_materiales_jm_id_map
    where entity = 'branch'
  )
  and coalesce(product.business_unit, 'materiales') = 'materiales';

insert into public.inventory_stock (branch_id, product_id, qty_base, updated_at)
select
  branch_map.new_id::bigint,
  product_map.new_id::bigint,
  sum(coalesce(p.stock_qty, 0)),
  now()
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = p.branch_legacy_id
join public.migration_materiales_jm_id_map product_map
  on product_map.entity = 'product'
 and product_map.legacy_id = p.legacy_id
group by branch_map.new_id::bigint, product_map.new_id::bigint
on conflict (branch_id, product_id) do update
set
  qty_base = excluded.qty_base,
  updated_at = excluded.updated_at;

update public.products product
set
  stock = stock.qty_base,
  updated_at = now()
from public.inventory_stock stock
where stock.product_id = product.id
  and stock.branch_id = product.branch_id
  and product.branch_id in (
    select new_id::bigint
    from public.migration_materiales_jm_id_map
    where entity = 'branch'
  )
  and coalesce(product.business_unit, 'materiales') = 'materiales';

select
  p.legacy_id,
  p.name as source_name,
  product.name as supabase_name,
  p.barcode,
  u.name as supabase_uom_name,
  u.code as supabase_uom_code,
  p.stock_qty as source_stock,
  stock.qty_base as supabase_stock
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map product_map
  on product_map.entity = 'product'
 and product_map.legacy_id = p.legacy_id
join public.products product
  on product.id = product_map.new_id::bigint
left join public.uoms u
  on u.id = product.base_uom_id
left join public.inventory_stock stock
  on stock.product_id = product.id
 and stock.branch_id = product.branch_id
where p.barcode in ('501206690765', '501206694022', '501206693988', '0737658568063')
order by p.name;

select count(*) as product_stock_mismatches
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map product_map
  on product_map.entity = 'product'
 and product_map.legacy_id = p.legacy_id
join public.products product
  on product.id = product_map.new_id::bigint
left join public.inventory_stock stock
  on stock.product_id = product.id
 and stock.branch_id = product.branch_id
where coalesce(stock.qty_base, 0) <> coalesce(p.stock_qty, 0);

commit;
