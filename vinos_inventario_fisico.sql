-- Ejecutar SOLO en el proyecto Supabase de VINOS / Casa Tahona.
-- Requiere las tablas locales products y uoms. NO requiere branches.
-- No modifica existencias de venta ni depende de Produccion o Materiales.
begin;

create table if not exists public.vinos_physical_inventories (
  id uuid primary key default gen_random_uuid(),
  -- Etiqueta interna de ambito; no es un ID de sucursal de otra base.
  branch_id text not null default 'casa-tahona' check (branch_id = 'casa-tahona'),
  business_unit text not null default 'vinos' check (business_unit = 'vinos'),
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date,
  status text not null check (status in ('ACTIVE', 'INACTIVE')),
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (is_active = (status = 'ACTIVE'))
);
create unique index if not exists vinos_physical_inventory_active_branch
  on public.vinos_physical_inventories(branch_id) where is_active;
create index if not exists vinos_physical_inventory_branch_date
  on public.vinos_physical_inventories(branch_id, created_at desc);

create table if not exists public.vinos_physical_inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.vinos_physical_inventories(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  product_sku text,
  product_barcode text,
  base_uom_id uuid,
  base_uom_code text,
  system_qty numeric not null check (system_qty >= 0 and system_qty < 1e12 and system_qty = round(system_qty, 3)),
  physical_qty numeric not null check (physical_qty >= 0 and physical_qty < 1e12 and physical_qty = round(physical_qty, 3)),
  difference_qty numeric generated always as (physical_qty - system_qty) stored,
  observation text,
  counted_by text,
  counted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_id, product_id),
  check (physical_qty = system_qty or length(trim(coalesce(observation, ''))) > 0)
);
create index if not exists vinos_physical_items_inventory_date
  on public.vinos_physical_inventory_items(inventory_id, counted_at desc);

-- Invoker: conserva los permisos del llamador, sin elevar privilegios.
create or replace function public.save_vinos_physical_inventory_capture(
  p_inventory_id uuid, p_items jsonb default '[]'::jsonb,
  p_delete_item_ids uuid[] default '{}'::uuid[]
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_inventory public.vinos_physical_inventories%rowtype;
  v_item record;
  v_product record;
begin
  select * into v_inventory from public.vinos_physical_inventories
    where id = p_inventory_id for update;
  if not found then raise exception 'Inventario no encontrado'; end if;
  if not v_inventory.is_active then raise exception 'El inventario esta cerrado'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La captura debe ser una lista de productos';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_delete_item_ids, '{}'::uuid[])) d(id)
    where not exists (select 1 from public.vinos_physical_inventory_items i
      where i.id = d.id and i.inventory_id = p_inventory_id)
  ) then raise exception 'La captura a eliminar no pertenece a este inventario'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i
    group by i->>'product_id' having count(*) > 1) then
    raise exception 'Hay productos repetidos en la captura';
  end if;

  delete from public.vinos_physical_inventory_items
    where inventory_id = p_inventory_id and id = any(coalesce(p_delete_item_ids, '{}'::uuid[]));
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    product_id uuid, system_qty numeric, physical_qty numeric,
    observation text, counted_by text
  ) loop
    select p.id, p.name, p.sku, p.barcode, p.uom_id, coalesce(u.symbol, u.name) as uom_code
      into v_product from public.products p left join public.uoms u on u.id = p.uom_id
      where p.id = v_item.product_id and p.is_active and p.deleted_at is null;
    if not found then raise exception 'Producto no disponible en el catalogo de Casa Tahona'; end if;
    insert into public.vinos_physical_inventory_items (
      inventory_id, product_id, product_name, product_sku, product_barcode,
      base_uom_id, base_uom_code, system_qty, physical_qty, observation, counted_by
    ) values (
      p_inventory_id, v_product.id, v_product.name, v_product.sku, v_product.barcode,
      v_product.uom_id, v_product.uom_code, v_item.system_qty, v_item.physical_qty,
      nullif(trim(v_item.observation), ''), v_item.counted_by
    ) on conflict (inventory_id, product_id) do update set
      product_name = excluded.product_name, product_sku = excluded.product_sku,
      product_barcode = excluded.product_barcode, base_uom_id = excluded.base_uom_id,
      base_uom_code = excluded.base_uom_code, system_qty = excluded.system_qty,
      physical_qty = excluded.physical_qty, observation = excluded.observation,
      counted_by = excluded.counted_by, counted_at = now(), updated_at = now();
  end loop;
end;
$$;

-- Se conserva el modelo de acceso actual de VINOS. Ver instrucciones de permisos
-- y RLS en docs/casa-tahona-inventario.md antes de habilitar en produccion.
notify pgrst, 'reload schema';
commit;
