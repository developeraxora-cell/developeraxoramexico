-- Vista previa de los registros afectados por 00_clear_existing_concretera_b2.sql.
with
products as (select id from public.concrete_products where branch_id = 2),
transactions as (select id from public.concrete_inventory_transactions where branch_id = 2),
customers as (select id from public.concrete_credit_customers where branch_id = 2),
notes as (
  select id from public.concrete_credit_notes
  where branch_id = 2 or customer_id in (select id from customers)
     or inventory_transaction_id in (select id from transactions)
),
payments as (select id from public.concrete_credit_payments where note_id in (select id from notes)),
wallets as (select id from public.concrete_customer_wallets
  where branch_id = 2 or customer_id in (select id from customers))
select 'productos' as entidad, count(*) as filas from products
union all select 'presentaciones_producto', count(*) from public.concrete_product_uoms where product_id in (select id from products)
union all select 'stock', count(*) from public.concrete_inventory_stock where branch_id = 2
union all select 'ajustes_stock', count(*) from public.concrete_inventory_stock_adjustments where branch_id = 2
union all select 'transacciones', count(*) from transactions
union all select 'partidas', count(*) from public.concrete_inventory_transaction_items where transaction_id in (select id from transactions)
union all select 'clientes_credito', count(*) from customers
union all select 'notas_credito', count(*) from notes
union all select 'abonos_credito', count(*) from payments
union all select 'billeteras', count(*) from wallets
union all select 'movimientos_billetera', count(*) from public.concrete_customer_wallet_movements
  where branch_id = 2 or wallet_id in (select id from wallets)
union all select 'proveedores', count(*) from public.concrete_suppliers where branch_id = 2
union all select 'selecciones_clientes', count(*) from public.customer_selection_states
  where module = 'concretera' and branch_id::text = '2'
order by entidad;
