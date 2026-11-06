-- Carga idempotente. Ejecutar con psql -v ON_ERROR_STOP=1.
-- Requiere 01_staging.sql y load_staging.psql generados por extract.mjs.
begin;
set local time zone 'UTC';

do $$
begin
  if (select count(*) from public.branches where id = 2 and code = 'B2' and name = 'JESUS MARIA LOPAR') <> 1 then
    raise exception 'Sucursal B2 no coincide con Jesus Maria Lopar';
  end if;
  if to_regclass('public.concrete_sale_counters') is null
    or not exists (select 1 from pg_trigger
      where tgrelid = 'public.concrete_inventory_transactions'::regclass
        and tgname = 'trg_assign_concrete_branch_sale_reference'
        and not tgisinternal) then
    raise exception 'Ejecuta 01_branch_sale_folios.sql antes de migrar ventas';
  end if;
  if to_regclass('migration_concretera_jm.ventas') is null
    or to_regclass('migration_concretera_jm.productos') is null
    or to_regclass('migration_concretera_jm.listaventas') is null
    or to_regclass('migration_concretera_jm.abonos') is null then
    raise exception 'Faltan tablas de staging. Ejecuta out/01_staging_and_data.sql en esta misma base antes de 02_load.sql';
  end if;
  if (select count(*) from migration_concretera_jm.ventas) <> 2221
    or (select count(*) from migration_concretera_jm.productos) <> 38
    or (select count(*) from migration_concretera_jm.listaventas) <> 2528
    or (select count(*) from migration_concretera_jm.abonos) <> 1770 then
    raise exception 'Conteos del staging distintos del respaldo auditado';
  end if;
  if exists (select 1 from migration_concretera_jm.listaventas i left join migration_concretera_jm.ventas v on v.idventa = i.idventa where v.idventa is null)
    or exists (select 1 from migration_concretera_jm.abonos a left join migration_concretera_jm.ventas v on v.idventa = a.idventa where v.idventa is null)
    or exists (select 1 from migration_concretera_jm.ventas v left join migration_concretera_jm.clientes c on c.idcliente = v.cliente where c.idcliente is null) then
    raise exception 'Referencias rotas en el staging';
  end if;
  if exists (
    select 1 from migration_concretera_jm.productos p
    join public.concrete_products cp on cp.branch_id = 2 and cp.sku = 'LEG-C-2-' || p.idproducto
    where trim(cp.name) <> trim(p.producto)
      and not (p.idproducto in ('36','37','38') and cp.name like 'ACELERANTE%MR-42%')
  ) then raise exception 'SKU legado coincide con otro producto: revisar antes de cargar'; end if;
end $$;

create table if not exists public.migration_concretera_jm_id_map (
  entity text not null, legacy_id text not null, new_id text not null,
  created_at timestamptz not null default now(), primary key(entity, legacy_id)
);

-- El destino no admite stock negativo. Conserva el faltante original para
-- conciliación sin romper la restricción del inventario operativo.
create table if not exists public.migration_concretera_jm_stock_deficits (
  branch_id bigint not null,
  product_id bigint not null,
  legacy_product_id text not null,
  source_stock numeric not null check (source_stock < 0),
  imported_stock numeric not null check (imported_stock >= 0),
  source_min_stock numeric not null,
  imported_min_stock numeric not null check (imported_min_stock >= 0),
  created_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

-- En origen diascredito=0 coincide con status_credito=0: crédito deshabilitado.
-- Se permite el cero conservando los demás límites del CHECK existente.
do $$
declare original_definition text; original_expression text;
begin
  select pg_get_constraintdef(c.oid) into original_definition
  from pg_constraint c
  where c.conrelid = 'public.concrete_credit_customers'::regclass
    and c.conname = 'concrete_credit_customers_default_credit_days_check';
  if original_definition is null then
    raise exception 'No se encontró la restricción de días de crédito; revisar esquema antes de cargar';
  end if;
  if original_definition like '%default_credit_days = 0%' then
    return;
  end if;
  original_expression := substring(original_definition from '^CHECK \((.*)\)$');
  if original_expression is null then
    raise exception 'No se pudo leer la restricción de días de crédito: %', original_definition;
  end if;
  alter table public.concrete_credit_customers
    drop constraint concrete_credit_customers_default_credit_days_check;
  execute format(
    'alter table public.concrete_credit_customers add constraint concrete_credit_customers_default_credit_days_check check (default_credit_days = 0 or (%s))',
    original_expression
  );
end $$;

create table if not exists public.migration_concretera_jm_disabled_credit (
  customer_id uuid primary key,
  legacy_customer_id text not null,
  source_credit_limit numeric not null,
  created_at timestamptz not null default now()
);

-- Los nombres de unidad son únicos en destino. Reutiliza los existentes y
-- crea solo los nombres nuevos, aunque varias presentaciones compartan nombre.
insert into public.concrete_uoms (code, name)
select 'CJM-M-' || m.idmedida, trim(m.medida)
from migration_concretera_jm.medidas m
where not exists (select 1 from public.concrete_uoms u where u.name = trim(m.medida));

insert into public.concrete_uoms (code, name)
select 'CJM-P-' || p.idpresentacion, p.name
from (
  select distinct on (trim(presentacion)) idpresentacion, trim(presentacion) as name
  from migration_concretera_jm.presentaciones
  order by trim(presentacion), idpresentacion::integer
) p
where not exists (select 1 from public.concrete_uoms u where u.name = p.name);

insert into public.migration_concretera_jm_id_map (entity, legacy_id, new_id)
select 'measure', m.idmedida, u.id::text from migration_concretera_jm.medidas m
join public.concrete_uoms u on u.name = trim(m.medida)
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

insert into public.migration_concretera_jm_id_map (entity, legacy_id, new_id)
select 'presentation_uom', p.idpresentacion, u.id::text from migration_concretera_jm.presentaciones p
join public.concrete_uoms u on u.name = trim(p.presentacion)
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

-- Reutiliza los 37 productos LEG-C-2-* ya existentes; crea solo faltantes.
insert into public.concrete_products
  (branch_id, sku, barcode, name, base_uom_id, is_divisible, purchase_price,
   wholesale_price, retail_price, precio, min_stock, stock, is_active)
select 2, 'LEG-C-2-' || p.idproducto, '9002' || lpad(p.idproducto, 8, '0'),
  trim(p.producto), m.new_id::bigint, false, 0,
  coalesce(pr.mayoreo::numeric, 0), coalesce(pr.menudeo::numeric, 0),
  coalesce(pr.menudeo::numeric, 0), greatest(p.minimo::numeric, 0),
  greatest(p.stock::numeric, 0), p.status = '1'
from migration_concretera_jm.productos p
join public.migration_concretera_jm_id_map m on m.entity = 'measure' and m.legacy_id = p.medida
left join lateral (
  select x.* from migration_concretera_jm.presentaciones x
  where x.idproducto = p.idproducto and x.status = '1'
  order by x.idpresentacion::integer limit 1
) pr on true
where not exists (select 1 from public.concrete_products cp where cp.branch_id = 2 and cp.sku = 'LEG-C-2-' || p.idproducto);

insert into public.migration_concretera_jm_id_map (entity, legacy_id, new_id)
select 'product', p.idproducto, cp.id::text from migration_concretera_jm.productos p
join public.concrete_products cp on cp.branch_id = 2 and cp.sku = 'LEG-C-2-' || p.idproducto
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

do $$ begin
  if (select count(*) from public.migration_concretera_jm_id_map where entity = 'product') <> 38 then
    raise exception 'No se mapearon los 38 productos';
  end if;
end $$;

-- Se agregan las 62 presentaciones históricas sin tocar las existentes.
insert into public.concrete_product_uoms
  (product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price,
   is_default_purchase, is_default_sale)
select pm.new_id::bigint, um.new_id::bigint, 'SALE',
  case when pr.factor_a_base::numeric > 0 then pr.factor_a_base::numeric else 1 end,
  pr.mayoreo::numeric, pr.menudeo::numeric, false, false
from migration_concretera_jm.presentaciones pr
join public.migration_concretera_jm_id_map pm on pm.entity = 'product' and pm.legacy_id = pr.idproducto
join public.migration_concretera_jm_id_map um on um.entity = 'presentation_uom' and um.legacy_id = pr.idpresentacion
where not exists (select 1 from public.concrete_product_uoms pu where pu.product_id = pm.new_id::bigint and pu.uom_id = um.new_id::bigint);

insert into public.migration_concretera_jm_id_map (entity, legacy_id, new_id)
select 'presentation', pr.idpresentacion, pu.id::text
from migration_concretera_jm.presentaciones pr
join public.migration_concretera_jm_id_map pm on pm.entity = 'product' and pm.legacy_id = pr.idproducto
join public.migration_concretera_jm_id_map um on um.entity = 'presentation_uom' and um.legacy_id = pr.idpresentacion
join public.concrete_product_uoms pu on pu.product_id = pm.new_id::bigint and pu.uom_id = um.new_id::bigint
on conflict (entity, legacy_id) do update set new_id = excluded.new_id;

-- Clientes: el mapeo evita duplicarlos en ejecuciones sucesivas.
do $$ declare r record; new_id uuid; begin
  for r in select * from migration_concretera_jm.clientes order by idcliente::integer loop
    if not exists (select 1 from public.migration_concretera_jm_id_map where entity = 'customer' and legacy_id = r.idcliente) then
      insert into public.concrete_credit_customers
        (branch_id, name, phone, address, credit_limit, default_credit_days, policy,
         allow_cash_if_blocked, late_tolerance_days, is_active, created_at)
      values (2, trim(r.nombre), nullif(trim(r.telefono), ''), nullif(trim(r.direccion), ''),
        case when r.status_credito = '1' then greatest(r.credito::numeric, 0) else 0 end,
        r.diascredito::integer,
        'BLOQUEO_PARCIAL', true, 0, r.status = '1',
        coalesce(nullif(r."create", '')::timestamptz, now()))
      returning id into new_id;
      insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
      values ('customer', r.idcliente, new_id::text);
      if nullif(trim(r.direccion), '') is not null then
        insert into public.concrete_credit_customer_addresses
          (customer_id, label, address, is_default)
        values (new_id, 'Principal', trim(r.direccion), true);
      end if;
    end if;
  end loop;
end $$;

insert into public.migration_concretera_jm_disabled_credit
  (customer_id, legacy_customer_id, source_credit_limit)
select cm.new_id::uuid, c.idcliente, c.credito::numeric
from migration_concretera_jm.clientes c
join public.migration_concretera_jm_id_map cm
  on cm.entity = 'customer' and cm.legacy_id = c.idcliente
where c.status_credito = '0'
on conflict (customer_id) do nothing;

-- Ventas: se conserva folio en reference. Las canceladas se conservan marcadas.
do $$ declare r record; new_id bigint; customer_name text; begin
  for r in select * from migration_concretera_jm.ventas order by idventa::integer loop
    if not exists (select 1 from public.migration_concretera_jm_id_map where entity = 'sale' and legacy_id = r.idventa) then
      select c.nombre into customer_name from migration_concretera_jm.clientes c where c.idcliente = r.cliente;
      if exists (select 1 from public.concrete_inventory_transactions where branch_id = 2 and type = 'SALE' and reference = r.idventa) then
        raise exception 'Folio de venta % ya existe sin mapeo', r.idventa;
      end if;
      insert into public.concrete_inventory_transactions
        (type, branch_id, reference, notes, created_by, nombre_cliente, direccion_cliente,
         payment_type, wallet_amount, cash_amount, credit_amount, is_credit,
         is_deleted, delete_note, created_at)
      values ('SALE', 2, r.idventa, 'Migrada de concre45_crm.sql', nullif(r.usuario, ''),
        customer_name, nullif(r.direccion, ''), case when r.credito = '1' then 'CREDITO' else 'EFECTIVO' end,
        0, case when r.credito = '1' then 0 else r.total::numeric end,
        case when r.credito = '1' then r.total::numeric else 0 end,
        r.credito = '1', r.status <> '1',
        case when r.status <> '1' then 'Cancelada en sistema anterior' else null end,
        r.fecha::timestamptz)
      returning id into new_id;
      insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
      values ('sale', r.idventa, new_id::text);
    end if;
  end loop;
end $$;

do $$ declare r record; item_id bigint; begin
  for r in
    select i.*, v.fecha, pr.idproducto, pr.factor_a_base,
      sm.new_id::bigint as sale_id, pm.new_id::bigint as product_id,
      um.new_id::bigint as product_uom_id
    from migration_concretera_jm.listaventas i
    join migration_concretera_jm.ventas v on v.idventa = i.idventa
    join migration_concretera_jm.presentaciones pr on pr.idpresentacion = i.presentacion
    join public.migration_concretera_jm_id_map sm on sm.entity = 'sale' and sm.legacy_id = i.idventa
    join public.migration_concretera_jm_id_map pm on pm.entity = 'product' and pm.legacy_id = pr.idproducto
    join public.migration_concretera_jm_id_map um on um.entity = 'presentation' and um.legacy_id = i.presentacion
    order by i.idlistaventas::integer
  loop
    if not exists (select 1 from public.migration_concretera_jm_id_map where entity = 'sale_item' and legacy_id = r.idlistaventas) then
      insert into public.concrete_inventory_transaction_items
        (transaction_id, product_id, product_uom_id, qty, factor_used, qty_base,
         unit_price, line_total, created_at)
      values (r.sale_id, r.product_id, r.product_uom_id, r.cantidad::numeric,
        case when r.factor_a_base::numeric > 0 then r.factor_a_base::numeric else 1 end,
        r.cantidad::numeric * case when r.factor_a_base::numeric > 0 then r.factor_a_base::numeric else 1 end,
        case when r.cantidad::numeric > 0 then round(r.subtotal::numeric / r.cantidad::numeric, 4) else 0 end,
        r.subtotal::numeric, r.fecha::timestamptz)
      returning id into item_id;
      insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
      values ('sale_item', r.idlistaventas, item_id::text);
    end if;
  end loop;
end $$;

do $$ begin
  if (select count(*) from public.concrete_inventory_transaction_items i
      join public.migration_concretera_jm_id_map sm on sm.entity = 'sale' and sm.new_id = i.transaction_id::text
     ) <> (select count(*) from migration_concretera_jm.listaventas) then
    raise exception 'Numero de partidas de venta diferente al respaldo';
  end if;
end $$;

-- Solo las ventas a crédito activas generan cartera. Los abonos de contado ya
-- están reflejados en cash_amount; no se duplican como credit_payments.
do $$ declare r record; sale_id bigint; customer_id uuid; note_id uuid; begin
  for r in select * from migration_concretera_jm.ventas where credito = '1' and status = '1' order by idventa::integer loop
    if not exists (select 1 from public.migration_concretera_jm_id_map where entity = 'note' and legacy_id = r.idventa) then
      select new_id::bigint into sale_id from public.migration_concretera_jm_id_map where entity = 'sale' and legacy_id = r.idventa;
      select new_id::uuid into customer_id from public.migration_concretera_jm_id_map where entity = 'customer' and legacy_id = r.cliente;
      insert into public.concrete_credit_notes
        (branch_id, customer_id, inventory_transaction_id, folio, sale_reference,
         issue_date, credit_days_applied, due_date, total, paid_amount, balance, created_at)
      values (2, customer_id, sale_id, r.idventa, r.idventa,
        r.fecha::date, greatest(coalesce(nullif(r.dias_restantes, '')::integer, 0), 1),
        case when r.fecha_limite = '0000-00-00' then r.fecha::date + 15 else r.fecha_limite::date end,
        r.total::numeric, 0, r.total::numeric, r.fecha::timestamptz)
      returning id into note_id;
      insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
      values ('note', r.idventa, note_id::text);
    end if;
  end loop;
end $$;

do $$ declare r record; note_id uuid; payment_id uuid; begin
  for r in select a.* from migration_concretera_jm.abonos a
    join migration_concretera_jm.ventas v on v.idventa = a.idventa
    where v.credito = '1' and v.status = '1' order by a.idabono::integer loop
    if not exists (select 1 from public.migration_concretera_jm_id_map where entity = 'payment' and legacy_id = r.idabono) then
      select new_id::uuid into note_id from public.migration_concretera_jm_id_map where entity = 'note' and legacy_id = r.idventa;
      insert into public.concrete_credit_payments (note_id, paid_at, amount, method, reference, notes)
      values (note_id, r.fecha::timestamptz, r.monto::numeric,
        (case lower(trim(r.forma_pago)) when 't' then 'TRANSFERENCIA' when 'e' then 'EFECTIVO' else 'EFECTIVO' end)::public.concrete_credit_payment_method,
        'CJM-ABONO-' || r.idabono, 'Forma original: ' || coalesce(r.forma_pago, ''))
      returning id into payment_id;
      insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
      values ('payment', r.idabono, payment_id::text);
    end if;
  end loop;
end $$;

update public.concrete_credit_notes n
set paid_amount = coalesce(x.paid, 0), balance = greatest(n.total - coalesce(x.paid, 0), 0)
from public.migration_concretera_jm_id_map nm
left join lateral (
  select sum(p.amount) paid from public.concrete_credit_payments p where p.note_id = nm.new_id::uuid
) x on true
where nm.entity = 'note' and n.id = nm.new_id::uuid;

-- El stock final se toma del respaldo una sola vez. Una reejecución posterior
-- no debe borrar movimientos nuevos registrados en el sistema actual.
do $$ begin
  if not exists (select 1 from public.migration_concretera_jm_id_map
                 where entity = 'stock_snapshot' and legacy_id = 'B2') then
    insert into public.concrete_inventory_stock (branch_id, product_id, qty_base, updated_at)
    select 2, pm.new_id::bigint, greatest(p.stock::numeric, 0), now()
    from migration_concretera_jm.productos p
    join public.migration_concretera_jm_id_map pm on pm.entity = 'product' and pm.legacy_id = p.idproducto
    on conflict (branch_id, product_id) do update set qty_base = excluded.qty_base, updated_at = excluded.updated_at;

    update public.concrete_products cp set stock = greatest(p.stock::numeric, 0)
    from migration_concretera_jm.productos p
    join public.migration_concretera_jm_id_map pm on pm.entity = 'product' and pm.legacy_id = p.idproducto
    where cp.id = pm.new_id::bigint;

    insert into public.migration_concretera_jm_stock_deficits
      (branch_id, product_id, legacy_product_id, source_stock, imported_stock,
       source_min_stock, imported_min_stock)
    select 2, pm.new_id::bigint, p.idproducto, p.stock::numeric, 0,
      p.minimo::numeric, greatest(p.minimo::numeric, 0)
    from migration_concretera_jm.productos p
    join public.migration_concretera_jm_id_map pm
      on pm.entity = 'product' and pm.legacy_id = p.idproducto
    where p.stock::numeric < 0
    on conflict (branch_id, product_id) do nothing;

    insert into public.migration_concretera_jm_id_map(entity, legacy_id, new_id)
    values ('stock_snapshot', 'B2', now()::text);
  end if;
end $$;

commit;
