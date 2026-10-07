-- SOLO en la base temporal donde ya se ejecuto vinosPhysicalInventory.sql.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
-- Simula los permisos de lectura existentes del catalogo en VINOS.
grant select on public.products, public.uoms to anon, authenticated;
\ir ../vinos_inventario_fisico_permisos.sql
\ir ../vinos_inventario_fisico_permisos.sql

set role anon;
insert into public.vinos_physical_inventories (id, name, start_date, status)
values ('00000000-0000-0000-0000-000000000031', 'Prueba anon', current_date, 'ACTIVE');
select public.save_vinos_physical_inventory_capture(
  '00000000-0000-0000-0000-000000000031',
  '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":8,"observation":"Faltante"}]'
);
do $$ begin
  if not exists (select 1 from public.vinos_physical_inventory_items
    where inventory_id = '00000000-0000-0000-0000-000000000031' and difference_qty = -2) then
    raise exception 'FAIL: anon no puede leer captura';
  end if;
end $$;
update public.vinos_physical_inventories set name = 'Editado anon'
where id = '00000000-0000-0000-0000-000000000031';
delete from public.vinos_physical_inventory_items
where inventory_id = '00000000-0000-0000-0000-000000000031';
delete from public.vinos_physical_inventories where id = '00000000-0000-0000-0000-000000000031';
reset role;

set role authenticated;
insert into public.vinos_physical_inventories (id, name, start_date, status)
values ('00000000-0000-0000-0000-000000000032', 'Prueba authenticated', current_date, 'ACTIVE');
select public.save_vinos_physical_inventory_capture(
  '00000000-0000-0000-0000-000000000032',
  '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":10}]'
);
update public.vinos_physical_inventories set is_active = false, status = 'INACTIVE'
where id = '00000000-0000-0000-0000-000000000032';
delete from public.vinos_physical_inventories where id = '00000000-0000-0000-0000-000000000032';
do $$ begin
  if exists (select 1 from public.vinos_physical_inventory_items
    where inventory_id = '00000000-0000-0000-0000-000000000032') then
    raise exception 'FAIL: authenticated no elimino detalles en cascada';
  end if;
  raise notice 'PASS: RLS permite crear, leer, capturar, editar, cerrar y eliminar para anon/authenticated';
end $$;
reset role;
