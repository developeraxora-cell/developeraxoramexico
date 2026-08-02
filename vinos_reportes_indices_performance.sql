-- Casa Tahona: indices recomendados para acelerar Reportes / CRM.
-- Ejecutar en la base VINOS / Casa Tahona.
--
-- El modulo de reportes filtra ventas por sucursal, fecha y deleted_at,
-- luego consulta sale_items por sale_id y productos por stock/sucursal.

create index if not exists idx_vinos_sales_branch_created_active
on public.sales (branch_id, created_at)
where deleted_at is null;

create index if not exists idx_vinos_sales_created_active
on public.sales (created_at)
where deleted_at is null;

create index if not exists idx_vinos_sale_items_sale_id
on public.sale_items (sale_id);

create index if not exists idx_vinos_sale_items_product_id
on public.sale_items (product_id);

create index if not exists idx_vinos_purchases_branch_dates_active
on public.purchases (branch_id, purchase_date desc, created_at desc)
where deleted_at is null;

create index if not exists idx_vinos_purchase_items_purchase_product
on public.purchase_items (purchase_id, product_id);

create index if not exists idx_vinos_product_stocks_branch_product
on public.product_stocks (branch_id, product_id);

create index if not exists idx_vinos_customers_branch_active_created
on public.customers (branch_id, created_at)
where is_active = true;
