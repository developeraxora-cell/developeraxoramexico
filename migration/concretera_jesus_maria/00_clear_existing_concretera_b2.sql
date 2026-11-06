-- Limpieza previa de Concretera Jesús María (B2) en la base principal.
-- Ejecutar con psql -v ON_ERROR_STOP=1 o en el SQL Editor de Supabase.
-- Afecta solo datos operativos de Concretera ligados a branches.id = 2.
-- Conserva public.branches, tablas de Materiales y catálogos globales.
-- Todo se confirma junto; cualquier error revierte la transacción.

begin;

do $$
begin
  if (select count(*) from public.branches
      where id = 2 and code = 'B2' and name = 'JESUS MARIA LOPAR') <> 1 then
    raise exception 'Destino inesperado: no se borró nada. Se esperaba Jesús María, B2, id 2';
  end if;
end $$;

create temp table _cjm_products on commit drop as
select id from public.concrete_products where branch_id = 2;
create temp table _cjm_sales on commit drop as
select id from public.concrete_inventory_transactions where branch_id = 2;
create temp table _cjm_customers on commit drop as
select id from public.concrete_credit_customers where branch_id = 2;
create temp table _cjm_notes on commit drop as
select id from public.concrete_credit_notes
where branch_id = 2
   or customer_id in (select id from _cjm_customers)
   or inventory_transaction_id in (select id from _cjm_sales);
create temp table _cjm_payments on commit drop as
select id from public.concrete_credit_payments
where note_id in (select id from _cjm_notes);
create temp table _cjm_wallets on commit drop as
select id from public.concrete_customer_wallets
where branch_id = 2 or customer_id in (select id from _cjm_customers);

-- Abortamos si un producto de B2 está ligado a operaciones de otra sucursal.
-- Así nunca se elimina información ajena para resolver una clave foránea.
do $$
begin
  if exists (
    select 1 from public.concrete_inventory_transaction_items i
    join public.concrete_inventory_transactions t on t.id = i.transaction_id
    where i.product_id in (select id from _cjm_products) and t.branch_id <> 2
  ) or exists (
    select 1 from public.concrete_inventory_stock s
    where s.product_id in (select id from _cjm_products) and s.branch_id <> 2
  ) or exists (
    select 1 from public.concrete_inventory_stock_adjustments a
    where a.product_id in (select id from _cjm_products) and a.branch_id <> 2
  ) then
    raise exception 'Producto de B2 referenciado por otra sucursal; limpieza cancelada';
  end if;
end $$;

select 'productos' as entidad, count(*) as filas from _cjm_products
union all select 'transacciones', count(*) from _cjm_sales
union all select 'clientes', count(*) from _cjm_customers
union all select 'notas_credito', count(*) from _cjm_notes
union all select 'abonos_credito', count(*) from _cjm_payments
union all select 'billeteras', count(*) from _cjm_wallets;

-- Versiones anteriores pueden tener órdenes de producción en esta tabla.
do $$
begin
  if to_regclass('public.concrete_orders') is not null then
    execute 'delete from public.concrete_orders where branch_id = 2';
  end if;
end $$;

-- Tablas hijas: evidencias, pagos, movimientos, partidas y selecciones.
delete from public.concrete_credit_payment_evidences e
where e.payment_id in (select id from _cjm_payments);

delete from public.concrete_inventory_transaction_evidences e
where e.transaction_id in (select id from _cjm_sales);

delete from public.concrete_credit_customer_documents d
where d.customer_id in (select id from _cjm_customers);

delete from public.customer_selection_states s
where s.module = 'concretera' and s.branch_id::text = '2';

delete from public.concrete_customer_wallet_movements m
where m.branch_id = 2
   or m.wallet_id in (select id from _cjm_wallets)
   or m.customer_id in (select id from _cjm_customers)
   or m.sale_id in (select id from _cjm_sales);

delete from public.concrete_credit_payments p
where p.id in (select id from _cjm_payments);

delete from public.concrete_credit_notes n
where n.id in (select id from _cjm_notes);

delete from public.concrete_credit_customer_addresses a
where a.customer_id in (select id from _cjm_customers);

delete from public.concrete_customer_wallets w
where w.id in (select id from _cjm_wallets);

delete from public.concrete_inventory_transaction_items i
where i.transaction_id in (select id from _cjm_sales);

delete from public.concrete_inventory_transactions t
where t.id in (select id from _cjm_sales);

delete from public.concrete_inventory_stock_adjustments a
where a.branch_id = 2;

delete from public.concrete_inventory_stock s
where s.branch_id = 2;

delete from public.concrete_product_uoms u
where u.product_id in (select id from _cjm_products);

delete from public.concrete_products p
where p.id in (select id from _cjm_products);

delete from public.concrete_suppliers s
where s.branch_id = 2;

delete from public.concrete_credit_customers c
where c.id in (select id from _cjm_customers);

-- Permite volver a ejecutar la migración si ya se hubiera cargado antes.
do $$
begin
  if to_regclass('public.migration_concretera_jm_id_map') is not null then
    delete from public.migration_concretera_jm_id_map;
  end if;
  if to_regclass('public.migration_concretera_jm_stock_deficits') is not null then
    delete from public.migration_concretera_jm_stock_deficits where branch_id = 2;
  end if;
  if to_regclass('public.migration_concretera_jm_disabled_credit') is not null then
    delete from public.migration_concretera_jm_disabled_credit d
    where d.customer_id in (select id from _cjm_customers);
  end if;
  if to_regclass('public.concrete_sale_counters') is not null then
    delete from public.concrete_sale_counters where branch_id = 2;
  end if;
end $$;

-- Las unidades CJM-* pertenecen exclusivamente a esta migración. Se borran
-- solo si ninguna presentación restante las utiliza.
delete from public.concrete_uoms u
where (u.code like 'CJM-M-%' or u.code like 'CJM-P-%')
  and not exists (select 1 from public.concrete_product_uoms pu where pu.uom_id = u.id)
  and not exists (select 1 from public.concrete_products p where p.base_uom_id = u.id);

do $$
begin
  if exists (select 1 from public.concrete_products where branch_id = 2)
    or exists (select 1 from public.concrete_inventory_transactions where branch_id = 2)
    or exists (select 1 from public.concrete_inventory_stock where branch_id = 2)
    or exists (select 1 from public.concrete_inventory_stock_adjustments where branch_id = 2)
    or exists (select 1 from public.concrete_credit_customers where branch_id = 2)
    or exists (select 1 from public.concrete_credit_notes where branch_id = 2)
    or exists (select 1 from public.concrete_suppliers where branch_id = 2)
    or exists (select 1 from public.concrete_customer_wallets where branch_id = 2)
    or exists (select 1 from public.concrete_customer_wallet_movements where branch_id = 2)
    or exists (select 1 from public.customer_selection_states where module = 'concretera' and branch_id::text = '2') then
    raise exception 'La verificación final encontró datos de Concretera B2; limpieza revertida';
  end if;
end $$;

commit;
