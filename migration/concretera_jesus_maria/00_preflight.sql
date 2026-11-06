-- Solo lectura. Ejecutar antes de crear staging o cargar datos.
select id, code, name from public.branches where code = 'B2';

with required(name) as (values
  ('concrete_uoms'), ('concrete_products'), ('concrete_product_uoms'),
  ('concrete_inventory_stock'), ('concrete_credit_customers'),
  ('concrete_credit_customer_addresses'), ('concrete_inventory_transactions'),
  ('concrete_inventory_transaction_items'), ('concrete_credit_notes'),
  ('concrete_credit_payments')
)
select r.name, case when to_regclass('public.' || r.name) is null then 'MISSING' else 'OK' end as status
from required r order by r.name;

select 'products' as entity, count(*) as rows from public.concrete_products where branch_id = 2
union all select 'sales', count(*) from public.concrete_inventory_transactions where branch_id = 2 and type = 'SALE'
union all select 'customers', count(*) from public.concrete_credit_customers where branch_id = 2
union all select 'credit_notes', count(*) from public.concrete_credit_notes where branch_id = 2;

select id, sku, name from public.concrete_products
where branch_id = 2 and sku like 'LEG-C-2-%' order by id;
