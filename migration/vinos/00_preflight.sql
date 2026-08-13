-- Preflight para migracion Vinos.
-- Ejecutar en la base destino de Supabase antes de cargar datos.

select
  current_database() as database_name,
  current_schema() as schema_name,
  now() as checked_at;

select
  extname
from pg_extension
where extname in ('pgcrypto')
order by extname;

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'branches',
    'categories',
    'brands',
    'uoms',
    'product_uoms',
    'suppliers',
    'products',
    'product_stocks',
    'customers',
    'sales',
    'sale_items',
    'credit_payments',
    'purchases',
    'purchase_items'
  )
order by table_name;

select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.table_name in (
    'branches',
    'categories',
    'brands',
    'uoms',
    'product_uoms',
    'suppliers',
    'products',
    'product_stocks',
    'customers',
    'sales',
    'sale_items',
    'credit_payments',
    'purchases',
    'purchase_items'
  )
order by tc.table_name, tc.constraint_type, tc.constraint_name;

select
  'branches' as table_name,
  count(*) as row_count
from public.branches
union all
select 'categories', count(*) from public.categories
union all
select 'brands', count(*) from public.brands
union all
select 'uoms', count(*) from public.uoms
union all
select 'suppliers', count(*) from public.suppliers
union all
select 'products', count(*) from public.products
union all
select 'product_uoms', count(*) from public.product_uoms
union all
select 'product_stocks', count(*) from public.product_stocks
union all
select 'customers', count(*) from public.customers
union all
select 'sales', count(*) from public.sales
union all
select 'sale_items', count(*) from public.sale_items
union all
select 'credit_payments', count(*) from public.credit_payments
union all
select 'purchases', count(*) from public.purchases
union all
select 'purchase_items', count(*) from public.purchase_items
order by table_name;
