-- Carga idempotente desde migration_materiales_jm.legacy_* hacia el modulo Materiales.
-- Ejecutar despues de 01_staging_schema.sql y de cargar los CSV.

begin;

insert into public.branches (code, name, address, is_active)
select
  trim(code),
  trim(name),
  nullif(trim(address), ''),
  coalesce(is_active, true)
from migration_materiales_jm.legacy_branches
on conflict (code) do update
set
  name = excluded.name,
  address = excluded.address,
  is_active = excluded.is_active;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'branch', lb.legacy_id, b.id::text
from migration_materiales_jm.legacy_branches lb
join public.branches b on lower(b.code) = lower(trim(lb.code))
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.categories (name)
select distinct trim(name)
from migration_materiales_jm.legacy_categories
where nullif(trim(name), '') is not null
on conflict (name) do update set name = excluded.name;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'category', lc.legacy_id, c.id::text
from migration_materiales_jm.legacy_categories lc
join public.categories c on lower(c.name) = lower(trim(lc.name))
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

with normalized_uoms as (
  select
    lu.legacy_id,
    case
      when length(trim(lu.code)) <= 20 then trim(lu.code)
      else left(trim(lu.code), 15) || '_' || substr(md5(lu.legacy_id), 1, 4)
    end as code,
    trim(lu.name) as name
  from migration_materiales_jm.legacy_uoms lu
  where nullif(trim(lu.code), '') is not null
)
insert into public.uoms (code, name)
select distinct nu.code, nu.name
from normalized_uoms nu
where not exists (
  select 1
  from public.uoms existing
  where lower(trim(existing.code)) = lower(nu.code)
);

with normalized_uoms as (
  select
    lu.legacy_id,
    case
      when length(trim(lu.code)) <= 20 then trim(lu.code)
      else left(trim(lu.code), 15) || '_' || substr(md5(lu.legacy_id), 1, 4)
    end as code,
    trim(lu.name) as name
  from migration_materiales_jm.legacy_uoms lu
  where nullif(trim(lu.code), '') is not null
)
update public.uoms existing
set name = nu.name
from normalized_uoms nu
where lower(trim(existing.code)) = lower(nu.code);

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'uom', lu.legacy_id, u.id::text
from migration_materiales_jm.legacy_uoms lu
join public.uoms u
  on lower(u.code) = lower(
    case
      when length(trim(lu.code)) <= 20 then trim(lu.code)
      else left(trim(lu.code), 15) || '_' || substr(md5(lu.legacy_id), 1, 4)
    end
  )
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.suppliers (
  branch_id,
  business_unit,
  name,
  phone,
  email,
  address,
  is_active,
  created_at
)
select
  branch_map.new_id::bigint,
  'materiales',
  trim(s.name),
  nullif(trim(s.phone), ''),
  nullif(trim(s.email), ''),
  nullif(trim(s.address), ''),
  coalesce(s.is_active, true),
  coalesce(s.created_at, now())
from migration_materiales_jm.legacy_suppliers s
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = s.branch_legacy_id
where not exists (
  select 1
  from public.suppliers existing
  where existing.branch_id = branch_map.new_id::bigint
    and coalesce(existing.business_unit, 'materiales') = 'materiales'
    and lower(trim(existing.name)) = lower(trim(s.name))
);

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'supplier', s.legacy_id, existing.id::text
from migration_materiales_jm.legacy_suppliers s
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = s.branch_legacy_id
join public.suppliers existing
  on existing.branch_id = branch_map.new_id::bigint
 and coalesce(existing.business_unit, 'materiales') = 'materiales'
 and lower(trim(existing.name)) = lower(trim(s.name))
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.products (
  branch_id,
  business_unit,
  sku,
  barcode,
  name,
  precio,
  purchase_price,
  wholesale_price,
  retail_price,
  min_stock,
  stock,
  description,
  category_id,
  brand_id,
  base_uom_id,
  is_divisible,
  attrs,
  is_active,
  created_at
)
select
  branch_map.new_id::bigint,
  'materiales',
  trim(p.sku),
  nullif(trim(p.barcode), ''),
  trim(p.name),
  coalesce(p.retail_price, 0),
  coalesce(p.purchase_price, 0),
  coalesce(p.wholesale_price, 0),
  coalesce(p.retail_price, 0),
  coalesce(p.min_stock, 0),
  coalesce(p.stock_qty, 0),
  nullif(trim(p.description), ''),
  category_map.new_id::bigint,
  null,
  uom_map.new_id::bigint,
  coalesce(p.is_divisible, false),
  jsonb_build_object('legacy_id', p.legacy_id, 'source', 'concre45_crm2.sql'),
  coalesce(p.is_active, true),
  coalesce(p.created_at, now())
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = p.branch_legacy_id
left join public.migration_materiales_jm_id_map category_map
  on category_map.entity = 'category'
 and category_map.legacy_id = p.category_legacy_id
join public.migration_materiales_jm_id_map uom_map
  on uom_map.entity = 'uom'
 and uom_map.legacy_id = p.base_uom_legacy_id
where not exists (
  select 1
  from public.products existing
  where existing.branch_id = branch_map.new_id::bigint
    and coalesce(existing.business_unit, 'materiales') = 'materiales'
    and (
      lower(trim(coalesce(existing.sku, ''))) = lower(trim(p.sku))
      or (
        nullif(trim(p.barcode), '') is not null
        and lower(trim(coalesce(existing.barcode, ''))) = lower(trim(p.barcode))
      )
    )
)
  and (
    nullif(trim(p.barcode), '') is null
    or not exists (
      select 1
      from migration_materiales_jm.legacy_products duplicate_source
      where nullif(trim(duplicate_source.barcode), '') is not null
        and lower(trim(duplicate_source.barcode)) = lower(trim(p.barcode))
        and duplicate_source.legacy_id::bigint < p.legacy_id::bigint
    )
  );

update public.products existing
set
  barcode = case
    when nullif(trim(p.barcode), '') is null then existing.barcode
    when exists (
      select 1
      from public.products barcode_owner
      where barcode_owner.branch_id = existing.branch_id
        and barcode_owner.id <> existing.id
        and lower(trim(coalesce(barcode_owner.barcode, ''))) = lower(trim(p.barcode))
    ) then existing.barcode
    else nullif(trim(p.barcode), '')
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
  attrs = coalesce(existing.attrs, '{}'::jsonb) || jsonb_build_object('legacy_id', p.legacy_id, 'source', 'concre45_crm2.sql'),
  is_active = coalesce(p.is_active, true),
  updated_at = now()
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = p.branch_legacy_id
left join public.migration_materiales_jm_id_map category_map
  on category_map.entity = 'category'
 and category_map.legacy_id = p.category_legacy_id
join public.migration_materiales_jm_id_map uom_map
  on uom_map.entity = 'uom'
 and uom_map.legacy_id = p.base_uom_legacy_id
where existing.branch_id = branch_map.new_id::bigint
  and coalesce(existing.business_unit, 'materiales') = 'materiales'
  and (
    lower(trim(coalesce(existing.sku, ''))) = lower(trim(p.sku))
    or (
      nullif(trim(p.barcode), '') is not null
      and lower(trim(coalesce(existing.barcode, ''))) = lower(trim(p.barcode))
    )
  );

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'product', p.legacy_id, existing.id::text
from migration_materiales_jm.legacy_products p
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = p.branch_legacy_id
join lateral (
  select matched.id
  from public.products matched
  where matched.branch_id = branch_map.new_id::bigint
    and coalesce(matched.business_unit, 'materiales') = 'materiales'
    and (
      lower(trim(coalesce(matched.sku, ''))) = lower(trim(p.sku))
      or (
        nullif(trim(p.barcode), '') is not null
        and lower(trim(coalesce(matched.barcode, ''))) = lower(trim(p.barcode))
      )
    )
  order by
    case when lower(trim(coalesce(matched.sku, ''))) = lower(trim(p.sku)) then 0 else 1 end,
    matched.id
  limit 1
) existing on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

update public.product_uoms existing
set
  is_default_purchase = false,
  is_default_sale = false
from (
  select distinct product_map.new_id::bigint as product_id
  from migration_materiales_jm.legacy_product_uoms pu
  join public.migration_materiales_jm_id_map product_map
    on product_map.entity = 'product'
   and product_map.legacy_id = pu.product_legacy_id
) migrated_products
where existing.product_id = migrated_products.product_id;

with resolved_product_uoms as (
  select
    pu.legacy_id,
    product_map.new_id::bigint as product_id,
    uom_map.new_id::bigint as uom_id,
    case when pu.purpose in ('PURCHASE', 'SALE', 'BOTH') then pu.purpose else 'BOTH' end as purpose,
    coalesce(nullif(pu.factor_to_base, 0), 1) as factor_to_base,
    coalesce(pu.wholesale_price, 0) as wholesale_price,
    coalesce(pu.retail_price, 0) as retail_price,
    coalesce(pu.is_default_purchase, false) as is_default_purchase,
    coalesce(pu.is_default_sale, false) as is_default_sale,
    row_number() over (
      partition by product_map.new_id::bigint, uom_map.new_id::bigint
      order by
        coalesce(pu.is_default_sale, false) desc,
        coalesce(pu.is_default_purchase, false) desc,
        coalesce(nullif(pu.factor_to_base, 0), 1),
        pu.legacy_id
    ) as product_uom_rank
  from migration_materiales_jm.legacy_product_uoms pu
  join public.migration_materiales_jm_id_map product_map
    on product_map.entity = 'product'
   and product_map.legacy_id = pu.product_legacy_id
  join public.migration_materiales_jm_id_map uom_map
    on uom_map.entity = 'uom'
   and uom_map.legacy_id = pu.uom_legacy_id
),
deduped_product_uoms as (
  select *
  from resolved_product_uoms
  where product_uom_rank = 1
),
ranked_product_uoms as (
  select
    *,
    row_number() over (
      partition by product_id
      order by
        is_default_purchase desc,
        abs(factor_to_base - 1),
        legacy_id
    ) as default_purchase_rank,
    row_number() over (
      partition by product_id
      order by
        is_default_sale desc,
        abs(factor_to_base - 1),
        legacy_id
    ) as default_sale_rank
  from deduped_product_uoms
)
insert into public.product_uoms (
  product_id,
  uom_id,
  purpose,
  factor_to_base,
  wholesale_price,
  retail_price,
  is_default_purchase,
  is_default_sale
)
select
  product_id,
  uom_id,
  purpose,
  factor_to_base,
  wholesale_price,
  retail_price,
  default_purchase_rank = 1,
  default_sale_rank = 1
from ranked_product_uoms
on conflict (product_id, uom_id) do update
set
  purpose = excluded.purpose,
  factor_to_base = excluded.factor_to_base,
  wholesale_price = excluded.wholesale_price,
  retail_price = excluded.retail_price,
  is_default_purchase = excluded.is_default_purchase,
  is_default_sale = excluded.is_default_sale;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'product_uom', pu.legacy_id, existing.id::text
from migration_materiales_jm.legacy_product_uoms pu
join public.migration_materiales_jm_id_map product_map
  on product_map.entity = 'product'
 and product_map.legacy_id = pu.product_legacy_id
join public.migration_materiales_jm_id_map uom_map
  on uom_map.entity = 'uom'
 and uom_map.legacy_id = pu.uom_legacy_id
join public.product_uoms existing
  on existing.product_id = product_map.new_id::bigint
 and existing.uom_id = uom_map.new_id::bigint
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.uoms (code, name)
select 'MIG', 'Unidad migrada'
where not exists (
  select 1
  from public.uoms existing
  where lower(trim(existing.code)) = 'mig'
);

update public.uoms
set name = 'Unidad migrada'
where lower(trim(code)) = 'mig';

with migrated_products_without_uoms as (
  select distinct
    p.id as product_id,
    coalesce(p.base_uom_id, fallback_uom.id) as uom_id,
    coalesce(p.wholesale_price, p.precio, 0) as wholesale_price,
    coalesce(p.retail_price, p.precio, 0) as retail_price
  from public.products p
  join public.migration_materiales_jm_id_map product_map
    on product_map.entity = 'product'
   and product_map.new_id = p.id::text
  join lateral (
    select u.id
    from public.uoms u
    where lower(trim(u.code)) = 'mig'
    order by u.id
    limit 1
  ) fallback_uom on true
  where not exists (
    select 1
    from public.product_uoms existing
    where existing.product_id = p.id
  )
)
insert into public.product_uoms (
  product_id,
  uom_id,
  purpose,
  factor_to_base,
  wholesale_price,
  retail_price,
  is_default_purchase,
  is_default_sale
)
select
  product_id,
  uom_id,
  'BOTH',
  1,
  wholesale_price,
  retail_price,
  true,
  true
from migrated_products_without_uoms
where uom_id is not null
on conflict (product_id, uom_id) do update
set
  purpose = excluded.purpose,
  factor_to_base = excluded.factor_to_base,
  wholesale_price = excluded.wholesale_price,
  retail_price = excluded.retail_price;

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
set qty_base = excluded.qty_base,
    updated_at = excluded.updated_at;

update public.products p
set
  stock = s.qty_base,
  updated_at = now()
from public.inventory_stock s
where s.product_id = p.id
  and s.branch_id = p.branch_id
  and p.branch_id in (
    select new_id::bigint
    from public.migration_materiales_jm_id_map
    where entity = 'branch'
  )
  and coalesce(p.business_unit, 'materiales') = 'materiales';

with ranked_credit_customers as (
  select
    branch_map.new_id::bigint as branch_id,
    'materiales' as business_unit,
    trim(c.name) as name,
    nullif(trim(c.phone), '') as phone,
    nullif(trim(c.address), '') as address,
    coalesce(c.credit_limit, 0) as credit_limit,
    greatest(1, coalesce(c.default_credit_days, 15)) as default_credit_days,
    (case when c.policy in ('CERO_TOLERANCIA', 'BLOQUEO_PARCIAL') then c.policy else 'BLOQUEO_PARCIAL' end)::public.credit_policy as policy,
    coalesce(c.allow_cash_if_blocked, true) as allow_cash_if_blocked,
    coalesce(c.late_tolerance_days, 0) as late_tolerance_days,
    coalesce(c.is_active, true) as is_active,
    coalesce(c.created_at, now()) as created_at,
    row_number() over (
      partition by branch_map.new_id::bigint, lower(trim(c.name)), coalesce(nullif(trim(c.phone), ''), '')
      order by coalesce(c.is_active, true) desc, c.legacy_id
    ) as customer_rank
  from migration_materiales_jm.legacy_credit_customers c
  join public.migration_materiales_jm_id_map branch_map
    on branch_map.entity = 'branch'
   and branch_map.legacy_id = c.branch_legacy_id
)
insert into public.credit_customers (
  branch_id,
  business_unit,
  name,
  phone,
  address,
  credit_limit,
  default_credit_days,
  policy,
  allow_cash_if_blocked,
  late_tolerance_days,
  is_active,
  created_at
)
select
  c.branch_id,
  c.business_unit,
  c.name,
  c.phone,
  c.address,
  c.credit_limit,
  c.default_credit_days,
  c.policy,
  c.allow_cash_if_blocked,
  c.late_tolerance_days,
  c.is_active,
  c.created_at
from ranked_credit_customers c
where c.customer_rank = 1
  and not exists (
  select 1
  from public.credit_customers existing
  where existing.branch_id = c.branch_id
    and coalesce(existing.business_unit, 'materiales') = 'materiales'
    and lower(trim(existing.name)) = lower(c.name)
    and coalesce(existing.phone, '') = coalesce(c.phone, '')
);

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'customer', c.legacy_id, existing.id::text
from migration_materiales_jm.legacy_credit_customers c
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = c.branch_legacy_id
join lateral (
  select matched.id
  from public.credit_customers matched
  where matched.branch_id = branch_map.new_id::bigint
    and coalesce(matched.business_unit, 'materiales') = 'materiales'
    and lower(trim(matched.name)) = lower(trim(c.name))
    and coalesce(matched.phone, '') = coalesce(nullif(trim(c.phone), ''), '')
  order by matched.id
  limit 1
) existing on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

with candidate_addresses as (
  select distinct on (customer_map.new_id::uuid, lower(trim(c.address)))
    customer_map.new_id::uuid as customer_id,
    trim(c.address) as address,
    c.legacy_id
  from migration_materiales_jm.legacy_credit_customers c
  join public.migration_materiales_jm_id_map customer_map
    on customer_map.entity = 'customer'
   and customer_map.legacy_id = c.legacy_id
  where nullif(trim(c.address), '') is not null
    and not exists (
      select 1
      from public.credit_customer_addresses existing
      where existing.customer_id = customer_map.new_id::uuid
        and lower(trim(existing.address)) = lower(trim(c.address))
    )
  order by customer_map.new_id::uuid, lower(trim(c.address)), c.legacy_id
),
ranked_addresses as (
  select
    ca.*,
    row_number() over (partition by ca.customer_id order by ca.legacy_id, ca.address) as address_rank,
    exists (
      select 1
      from public.credit_customer_addresses existing_default
      where existing_default.customer_id = ca.customer_id
        and existing_default.is_default = true
    ) as has_existing_default
  from candidate_addresses ca
)
insert into public.credit_customer_addresses (customer_id, address, label, is_default)
select
  customer_id,
  address,
  case when address_rank = 1 and not has_existing_default then 'Principal' else 'Migrada' end,
  address_rank = 1 and not has_existing_default
from ranked_addresses;

insert into public.inventory_transactions (
  type,
  branch_id,
  business_unit,
  reference,
  notes,
  supplier_id,
  purchase_date,
  is_credit,
  nombre_cliente,
  direccion_cliente,
  payment_type,
  wallet_amount,
  cash_amount,
  credit_amount,
  is_deleted,
  created_by,
  created_at
)
select
  t.tx_type,
  branch_map.new_id::bigint,
  'materiales',
  nullif(trim(t.reference), ''),
  nullif(trim(t.notes), ''),
  supplier_map.new_id::bigint,
  t.purchase_date,
  coalesce(t.is_credit, false),
  nullif(trim(t.nombre_cliente), ''),
  nullif(trim(t.direccion_cliente), ''),
  nullif(trim(t.payment_type), ''),
  coalesce(t.wallet_amount, 0),
  coalesce(t.cash_amount, 0),
  coalesce(t.credit_amount, 0),
  false,
  nullif(trim(t.created_by), ''),
  coalesce(t.created_at, now())
from migration_materiales_jm.legacy_inventory_transactions t
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = t.branch_legacy_id
left join public.migration_materiales_jm_id_map supplier_map
  on supplier_map.entity = 'supplier'
 and supplier_map.legacy_id = t.supplier_legacy_id
where not exists (
  select 1
  from public.inventory_transactions existing
  where existing.reference = t.reference
    and existing.branch_id = branch_map.new_id::bigint
    and coalesce(existing.business_unit, 'materiales') = 'materiales'
);

update public.inventory_transactions existing
set
  type = t.tx_type,
  notes = nullif(trim(t.notes), ''),
  supplier_id = supplier_map.new_id::bigint,
  purchase_date = t.purchase_date,
  is_credit = coalesce(t.is_credit, false),
  nombre_cliente = nullif(trim(t.nombre_cliente), ''),
  direccion_cliente = nullif(trim(t.direccion_cliente), ''),
  payment_type = nullif(trim(t.payment_type), ''),
  wallet_amount = coalesce(t.wallet_amount, 0),
  cash_amount = coalesce(t.cash_amount, 0),
  credit_amount = coalesce(t.credit_amount, 0),
  created_by = nullif(trim(t.created_by), ''),
  created_at = coalesce(t.created_at, existing.created_at)
from migration_materiales_jm.legacy_inventory_transactions t
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = t.branch_legacy_id
left join public.migration_materiales_jm_id_map supplier_map
  on supplier_map.entity = 'supplier'
 and supplier_map.legacy_id = t.supplier_legacy_id
where existing.reference = t.reference
  and existing.branch_id = branch_map.new_id::bigint
  and coalesce(existing.business_unit, 'materiales') = 'materiales';

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'transaction', t.legacy_id, existing.id::text
from migration_materiales_jm.legacy_inventory_transactions t
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = t.branch_legacy_id
join lateral (
  select matched.id
  from public.inventory_transactions matched
  where matched.reference = t.reference
    and matched.branch_id = branch_map.new_id::bigint
    and coalesce(matched.business_unit, 'materiales') = 'materiales'
  order by matched.id
  limit 1
) existing on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

do $$
declare
  r record;
  v_id bigint;
begin
  for r in
    select
      i.*,
      transaction_map.new_id::bigint as transaction_id,
      product_map.new_id::bigint as product_id,
      coalesce(product_uom_map.new_id::bigint, fallback_product_uom.id) as product_uom_id,
      coalesce(item_by_map.id, item_by_signature.id) as existing_item_id
    from migration_materiales_jm.legacy_inventory_transaction_items i
    join public.migration_materiales_jm_id_map transaction_map
      on transaction_map.entity = 'transaction'
     and transaction_map.legacy_id = i.transaction_legacy_id
    join public.migration_materiales_jm_id_map product_map
      on product_map.entity = 'product'
     and product_map.legacy_id = i.product_legacy_id
    left join public.migration_materiales_jm_id_map product_uom_map
      on product_uom_map.entity = 'product_uom'
     and product_uom_map.legacy_id = i.product_uom_legacy_id
    left join lateral (
      select pu.id
      from public.product_uoms pu
      where pu.product_id = product_map.new_id::bigint
      order by
        coalesce(pu.is_default_sale, false) desc,
        abs(coalesce(pu.factor_to_base, 1) - coalesce(nullif(i.factor_used, 0), 1)),
        pu.id
      limit 1
    ) fallback_product_uom on product_uom_map.new_id is null
    left join public.migration_materiales_jm_id_map item_map
      on item_map.entity = 'transaction_item'
     and item_map.legacy_id = i.legacy_id
    left join public.inventory_transaction_items item_by_map
      on item_by_map.id = case
        when item_map.new_id ~ '^[0-9]+$' then item_map.new_id::bigint
        else null
      end
    left join lateral (
      select existing.id
      from public.inventory_transaction_items existing
      where existing.transaction_id = transaction_map.new_id::bigint
        and existing.product_id = product_map.new_id::bigint
        and existing.product_uom_id is not distinct from coalesce(product_uom_map.new_id::bigint, fallback_product_uom.id)
        and coalesce(existing.qty, 0) = coalesce(i.qty, 0)
        and coalesce(existing.unit_price, 0) = coalesce(i.unit_price, 0)
        and coalesce(existing.line_total, 0) = coalesce(i.line_total, i.qty * coalesce(i.unit_price, 0), 0)
      order by existing.id
      limit 1
    ) item_by_signature on item_by_map.id is null
  loop
    if r.existing_item_id is null then
      insert into public.inventory_transaction_items (
        transaction_id,
        product_id,
        product_uom_id,
        qty,
        factor_used,
        qty_base,
        unit_price,
        line_total,
        barcode_scanned
      )
      values (
        r.transaction_id,
        r.product_id,
        r.product_uom_id,
        r.qty,
        coalesce(r.factor_used, 1),
        coalesce(nullif(r.qty_base, 0), r.qty * coalesce(r.factor_used, 1)),
        coalesce(r.unit_price, 0),
        coalesce(r.line_total, r.qty * coalesce(r.unit_price, 0)),
        nullif(trim(r.barcode_scanned), '')
      )
      returning id into v_id;
    else
      update public.inventory_transaction_items
      set
        transaction_id = r.transaction_id,
        product_id = r.product_id,
        product_uom_id = r.product_uom_id,
        qty = r.qty,
        factor_used = coalesce(r.factor_used, 1),
        qty_base = coalesce(nullif(r.qty_base, 0), r.qty * coalesce(r.factor_used, 1)),
        unit_price = coalesce(r.unit_price, 0),
        line_total = coalesce(r.line_total, r.qty * coalesce(r.unit_price, 0)),
        barcode_scanned = nullif(trim(r.barcode_scanned), '')
      where id = r.existing_item_id
      returning id into v_id;
    end if;

    insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
    values ('transaction_item', r.legacy_id, v_id::text)
    on conflict (entity, legacy_id) do update set new_id = excluded.new_id;
  end loop;
end;
$$;

-- El dump ya trae el stock final actual. Despues de insertar movimientos historicos,
-- reseteamos existencias para evitar que triggers de inventario dupliquen entradas/salidas.
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
set qty_base = excluded.qty_base,
    updated_at = excluded.updated_at;

update public.products p
set
  stock = s.qty_base,
  updated_at = now()
from public.inventory_stock s
where s.product_id = p.id
  and s.branch_id = p.branch_id
  and p.branch_id in (
    select new_id::bigint
    from public.migration_materiales_jm_id_map
    where entity = 'branch'
  )
  and coalesce(p.business_unit, 'materiales') = 'materiales';

insert into public.credit_notes (
  branch_id,
  business_unit,
  customer_id,
  folio,
  sale_reference,
  issue_date,
  credit_days_applied,
  due_date,
  total,
  paid_amount,
  balance,
  notes,
  inventory_transaction_id
)
select
  branch_map.new_id::bigint,
  'materiales',
  customer_map.new_id::uuid,
  trim(n.folio),
  nullif(trim(n.sale_reference), ''),
  n.issue_date,
  n.credit_days_applied,
  n.due_date,
  coalesce(n.total, 0),
  coalesce(n.paid_amount, 0),
  coalesce(n.balance, 0),
  nullif(trim(n.notes), ''),
  transaction_map.new_id::bigint
from migration_materiales_jm.legacy_credit_notes n
join migration_materiales_jm.legacy_inventory_transactions t
  on t.legacy_id = n.sale_legacy_id
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = t.branch_legacy_id
join public.migration_materiales_jm_id_map customer_map
  on customer_map.entity = 'customer'
 and customer_map.legacy_id = n.customer_legacy_id
join public.migration_materiales_jm_id_map transaction_map
  on transaction_map.entity = 'transaction'
 and transaction_map.legacy_id = n.sale_legacy_id
where not exists (
  select 1
  from public.credit_notes existing
  where existing.folio = n.folio
);

update public.credit_notes existing
set
  branch_id = branch_map.new_id::bigint,
  business_unit = 'materiales',
  customer_id = customer_map.new_id::uuid,
  sale_reference = nullif(trim(n.sale_reference), ''),
  issue_date = n.issue_date,
  credit_days_applied = n.credit_days_applied,
  due_date = n.due_date,
  total = coalesce(n.total, 0),
  paid_amount = coalesce(n.paid_amount, 0),
  balance = coalesce(n.balance, 0),
  notes = nullif(trim(n.notes), ''),
  inventory_transaction_id = transaction_map.new_id::bigint
from migration_materiales_jm.legacy_credit_notes n
join migration_materiales_jm.legacy_inventory_transactions t
  on t.legacy_id = n.sale_legacy_id
join public.migration_materiales_jm_id_map branch_map
  on branch_map.entity = 'branch'
 and branch_map.legacy_id = t.branch_legacy_id
join public.migration_materiales_jm_id_map customer_map
  on customer_map.entity = 'customer'
 and customer_map.legacy_id = n.customer_legacy_id
join public.migration_materiales_jm_id_map transaction_map
  on transaction_map.entity = 'transaction'
 and transaction_map.legacy_id = n.sale_legacy_id
where existing.folio = n.folio;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'credit_note', n.legacy_id, existing.id::text
from migration_materiales_jm.legacy_credit_notes n
join lateral (
  select matched.id
  from public.credit_notes matched
  where matched.folio = n.folio
  order by matched.id
  limit 1
) existing on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.credit_payments (
  note_id,
  paid_at,
  amount,
  method,
  reference,
  notes
)
select
  note_map.new_id::uuid,
  p.paid_at,
  p.amount,
  (case when p.method in ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'YAPE', 'PLIN', 'OTRO') then p.method else 'EFECTIVO' end)::public.credit_payment_method,
  nullif(trim(p.reference), ''),
  nullif(trim(p.notes), '')
from migration_materiales_jm.legacy_credit_payments p
join public.migration_materiales_jm_id_map note_map
  on note_map.entity = 'credit_note'
 and note_map.legacy_id = p.note_legacy_id
where not exists (
  select 1
  from public.credit_payments existing
  where existing.reference = p.reference
);

update public.credit_payments existing
set
  note_id = note_map.new_id::uuid,
  paid_at = p.paid_at,
  amount = p.amount,
  method = (case when p.method in ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'YAPE', 'PLIN', 'OTRO') then p.method else 'EFECTIVO' end)::public.credit_payment_method,
  notes = nullif(trim(p.notes), '')
from migration_materiales_jm.legacy_credit_payments p
join public.migration_materiales_jm_id_map note_map
  on note_map.entity = 'credit_note'
 and note_map.legacy_id = p.note_legacy_id
where existing.reference = p.reference;

insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
select 'credit_payment', p.legacy_id, existing.id::text
from migration_materiales_jm.legacy_credit_payments p
join lateral (
  select matched.id
  from public.credit_payments matched
  where matched.reference = p.reference
  order by matched.id
  limit 1
) existing on true
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

select 'migration_materiales_jm.legacy_products' as table_name, count(*) as row_count from migration_materiales_jm.legacy_products
union all select 'migration_materiales_jm.legacy_product_uoms', count(*) from migration_materiales_jm.legacy_product_uoms
union all select 'migration_materiales_jm.legacy_credit_customers', count(*) from migration_materiales_jm.legacy_credit_customers
union all select 'migration_materiales_jm.legacy_inventory_transactions', count(*) from migration_materiales_jm.legacy_inventory_transactions
union all select 'migration_materiales_jm.legacy_inventory_transaction_items', count(*) from migration_materiales_jm.legacy_inventory_transaction_items
union all select 'migration_materiales_jm.legacy_credit_notes', count(*) from migration_materiales_jm.legacy_credit_notes
union all select 'migration_materiales_jm.legacy_credit_payments', count(*) from migration_materiales_jm.legacy_credit_payments
order by table_name;

select 'public.products B2/materiales' as table_name, count(*) as row_count from public.products where branch_id = 2 and business_unit = 'materiales'
union all select 'public.inventory_stock B2', count(*) from public.inventory_stock where branch_id = 2
union all select 'public.inventory_transactions B2/materiales', count(*) from public.inventory_transactions where branch_id = 2 and business_unit = 'materiales'
union all select 'public.inventory_transaction_items B2/materiales', count(*)
from public.inventory_transaction_items item
join public.inventory_transactions tx
  on tx.id = item.transaction_id
where tx.branch_id = 2
  and tx.business_unit = 'materiales'
union all select 'public.credit_customers B2/materiales', count(*) from public.credit_customers where branch_id = 2 and business_unit = 'materiales'
union all select 'public.credit_notes B2/materiales', count(*) from public.credit_notes where branch_id = 2 and business_unit = 'materiales'
union all select 'public.credit_notes sin items B2/materiales', count(*)
from public.credit_notes note
where note.branch_id = 2
  and note.business_unit = 'materiales'
  and note.inventory_transaction_id is not null
  and not exists (
    select 1
    from public.inventory_transaction_items item
    where item.transaction_id = note.inventory_transaction_id
  )
order by table_name;

commit;
