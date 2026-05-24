-- Correccion RLS para guardar productos del inventario fisico de materiales.
-- Ejecutar en Supabase SQL Editor.

grant select, insert, update, delete on public.material_physical_inventories to anon, authenticated;
grant select, insert, update, delete on public.material_physical_inventory_items to anon, authenticated;

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

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('material_physical_inventories', 'material_physical_inventory_items')
order by tablename, policyname;
