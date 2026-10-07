-- Ejecutar SOLO en Supabase VINOS, despues de vinos_inventario_fisico.sql.
-- Acceso abierto solicitado: anon/authenticated pueden operar estas DOS tablas.
-- La clave publica permite acceso directo por API, sin validar usuarios de la app.
-- No cambia las politicas del catalogo, ventas, clientes ni otras tablas.
begin;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on public.vinos_physical_inventories, public.vinos_physical_inventory_items
  to anon, authenticated;
grant execute on function public.save_vinos_physical_inventory_capture(uuid, jsonb, uuid[])
  to anon, authenticated;

alter table public.vinos_physical_inventories enable row level security;
alter table public.vinos_physical_inventory_items enable row level security;

drop policy if exists vinos_physical_inventories_operacion_abierta
  on public.vinos_physical_inventories;
create policy vinos_physical_inventories_operacion_abierta
  on public.vinos_physical_inventories
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists vinos_physical_items_operacion_abierta
  on public.vinos_physical_inventory_items;
create policy vinos_physical_items_operacion_abierta
  on public.vinos_physical_inventory_items
  for all to anon, authenticated
  using (true) with check (true);

notify pgrst, 'reload schema';
commit;
