-- Modulo Inventario Fisico - Materiales
-- Ejecutar en Supabase SQL Editor antes de usar /materiales/inventario.

create extension if not exists pgcrypto;

create table if not exists public.material_physical_inventories (
  id uuid primary key default gen_random_uuid(),
  branch_id bigint not null,
  business_unit text not null default 'materiales',
  name text not null,
  start_date date not null,
  end_date date null,
  status text not null default 'ACTIVE',
  is_active boolean not null default true,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  constraint material_physical_inventories_business_unit_chk check (business_unit = 'materiales'),
  constraint material_physical_inventories_status_chk check (status in ('ACTIVE', 'INACTIVE')),
  constraint material_physical_inventories_dates_chk check (end_date is null or end_date >= start_date)
);

create table if not exists public.material_physical_inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.material_physical_inventories(id) on delete cascade,
  product_id bigint not null references public.products(id),
  product_name text not null,
  product_sku text null,
  product_barcode text null,
  base_uom_id bigint null references public.uoms(id),
  base_uom_code text null,
  system_qty numeric(14, 3) not null default 0,
  physical_qty numeric(14, 3) not null default 0,
  difference_qty numeric(14, 3) not null default 0,
  observation text null,
  counted_by text null,
  counted_at timestamptz not null default now(),
  updated_at timestamptz null,
  constraint material_physical_inventory_items_qty_chk check (system_qty >= 0 and physical_qty >= 0),
  constraint material_physical_inventory_items_difference_chk check (difference_qty = physical_qty - system_qty),
  constraint material_physical_inventory_items_observation_chk check (difference_qty = 0 or nullif(trim(coalesce(observation, '')), '') is not null),
  constraint material_physical_inventory_items_inventory_product_uq unique (inventory_id, product_id)
);

create index if not exists material_physical_inventories_branch_idx
  on public.material_physical_inventories(branch_id, business_unit, created_at desc);

create index if not exists material_physical_inventory_items_inventory_idx
  on public.material_physical_inventory_items(inventory_id, counted_at desc);

create index if not exists material_physical_inventory_items_product_idx
  on public.material_physical_inventory_items(product_id);

alter table public.material_physical_inventory_items
  add column if not exists base_uom_id bigint null references public.uoms(id),
  add column if not exists base_uom_code text null;

grant select, insert, update, delete on public.material_physical_inventories to anon, authenticated;
grant select, insert, update, delete on public.material_physical_inventory_items to anon, authenticated;

-- Supabase puede tener RLS activo; estos permisos abren el CRUD para el flujo interno del sistema.
alter table public.material_physical_inventories enable row level security;
alter table public.material_physical_inventory_items enable row level security;

drop policy if exists material_physical_inventories_app_all on public.material_physical_inventories;
create policy material_physical_inventories_app_all
  on public.material_physical_inventories
  for all
  to anon, authenticated
  using (business_unit = 'materiales')
  with check (business_unit = 'materiales');

drop policy if exists material_physical_inventory_items_app_all on public.material_physical_inventory_items;
create policy material_physical_inventory_items_app_all
  on public.material_physical_inventory_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Diagnostico rapido
select
  'material_physical_inventories' as table_name,
  count(*) as rows
from public.material_physical_inventories
union all
select
  'material_physical_inventory_items' as table_name,
  count(*) as rows
from public.material_physical_inventory_items;
