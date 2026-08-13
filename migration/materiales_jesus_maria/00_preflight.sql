-- Preflight para migracion Materiales Jesus Maria.
-- Debe ejecutarse en la base destino de Supabase antes de cargar staging.

select
  current_database() as database_name,
  current_schema() as schema_name,
  now() as checked_at;

select
  id,
  code,
  name,
  address,
  is_active
from public.branches
where code = 'B2'
   or lower(name) like '%jesus maria%'
order by id;

with required_tables(table_name) as (
  values
    ('branches'),
    ('categories'),
    ('uoms'),
    ('suppliers'),
    ('products'),
    ('product_uoms'),
    ('inventory_stock'),
    ('inventory_transactions'),
    ('inventory_transaction_items'),
    ('credit_customers'),
    ('credit_customer_addresses'),
    ('credit_notes'),
    ('credit_payments')
)
select
  rt.table_name,
  case when t.table_name is null then 'MISSING' else 'OK' end as status
from required_tables rt
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = rt.table_name
order by rt.table_name;

with required_columns(table_name, column_name) as (
  values
    ('branches', 'id'),
    ('branches', 'code'),
    ('branches', 'name'),
    ('branches', 'address'),
    ('branches', 'is_active'),
    ('categories', 'id'),
    ('categories', 'name'),
    ('uoms', 'id'),
    ('uoms', 'code'),
    ('uoms', 'name'),
    ('suppliers', 'id'),
    ('suppliers', 'branch_id'),
    ('suppliers', 'business_unit'),
    ('products', 'id'),
    ('products', 'branch_id'),
    ('products', 'business_unit'),
    ('products', 'sku'),
    ('products', 'base_uom_id'),
    ('product_uoms', 'id'),
    ('product_uoms', 'product_id'),
    ('product_uoms', 'uom_id'),
    ('inventory_stock', 'branch_id'),
    ('inventory_stock', 'product_id'),
    ('inventory_stock', 'qty_base'),
    ('inventory_transactions', 'id'),
    ('inventory_transactions', 'type'),
    ('inventory_transactions', 'branch_id'),
    ('inventory_transactions', 'business_unit'),
    ('inventory_transaction_items', 'id'),
    ('inventory_transaction_items', 'transaction_id'),
    ('inventory_transaction_items', 'product_id'),
    ('credit_customers', 'id'),
    ('credit_customers', 'branch_id'),
    ('credit_customers', 'business_unit'),
    ('credit_customer_addresses', 'customer_id'),
    ('credit_customer_addresses', 'address'),
    ('credit_notes', 'id'),
    ('credit_notes', 'branch_id'),
    ('credit_notes', 'business_unit'),
    ('credit_payments', 'id'),
    ('credit_payments', 'note_id')
)
select
  rc.table_name,
  rc.column_name,
  case when c.column_name is null then 'MISSING' else 'OK' end as status
from required_columns rc
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = rc.table_name
 and c.column_name = rc.column_name
where c.column_name is null
order by rc.table_name, rc.column_name;

create temp table if not exists migration_materiales_jm_preflight_counts (
  table_name text primary key,
  row_count bigint not null
);

truncate migration_materiales_jm_preflight_counts;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'business_unit'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'products B2/materiales', count(*) from public.products where branch_id = 2 and business_unit = 'materiales';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'business_unit'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'suppliers B2/materiales', count(*) from public.suppliers where branch_id = 2 and business_unit = 'materiales';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inventory_stock'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'inventory_stock B2', count(*) from public.inventory_stock where branch_id = 2;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_transactions' and column_name = 'business_unit'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'inventory_transactions B2/materiales', count(*) from public.inventory_transactions where branch_id = 2 and business_unit = 'materiales';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'credit_customers' and column_name = 'business_unit'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'credit_customers B2/materiales', count(*) from public.credit_customers where branch_id = 2 and business_unit = 'materiales';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'credit_notes' and column_name = 'business_unit'
  ) then
    insert into migration_materiales_jm_preflight_counts
    select 'credit_notes B2/materiales', count(*) from public.credit_notes where branch_id = 2 and business_unit = 'materiales';
  end if;
end;
$$;

select *
from migration_materiales_jm_preflight_counts
order by table_name;
