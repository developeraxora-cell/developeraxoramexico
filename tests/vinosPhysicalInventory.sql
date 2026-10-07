-- SOLO en una base temporal VACIA. Crea un catalogo de prueba, no datos reales.
\set ON_ERROR_STOP on
create table public.uoms (id uuid primary key, name text, symbol text);
create table public.products (
  id uuid primary key, name text, sku text, barcode text,
  uom_id uuid references public.uoms, is_active boolean, deleted_at timestamptz
);
create table public.product_stocks (
  product_id uuid references public.products primary key, qty numeric
);
\ir ../vinos_inventario_fisico.sql
\ir ../vinos_inventario_fisico.sql

insert into public.uoms values ('00000000-0000-0000-0000-000000000001', 'Botella', 'BOT');
insert into public.products values
  ('00000000-0000-0000-0000-000000000011', 'Vino local', 'SKU11', '111', '00000000-0000-0000-0000-000000000001', true, null),
  ('00000000-0000-0000-0000-000000000012', 'Vino inactivo', 'SKU12', '112', null, false, null);
insert into public.product_stocks values
  ('00000000-0000-0000-0000-000000000011', 10),
  ('00000000-0000-0000-0000-000000000012', 20);
insert into public.vinos_physical_inventories (id, branch_id, name, start_date, status)
  values ('00000000-0000-0000-0000-000000000021', 'casa-tahona', 'Inventario de prueba', '2026-10-06', 'ACTIVE');

do $$
declare
  v_inventory uuid := '00000000-0000-0000-0000-000000000021';
  v_item_id uuid;
  v_items jsonb := '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":8.125,"observation":"Faltante","counted_by":"Operador"}]';
begin
  perform public.save_vinos_physical_inventory_capture(v_inventory, v_items);
  select id into strict v_item_id from public.vinos_physical_inventory_items where inventory_id = v_inventory;
  if not exists (select 1 from public.vinos_physical_inventory_items where id = v_item_id
    and difference_qty = -1.875 and product_name = 'Vino local' and base_uom_code = 'BOT') then
    raise exception 'FAIL: diferencia o snapshot incorrecto';
  end if;
  if (select qty from public.product_stocks where product_id = '00000000-0000-0000-0000-000000000011') <> 10 then
    raise exception 'FAIL: stock modificado';
  end if;
  begin
    insert into public.vinos_physical_inventories (branch_id, name, start_date, status)
      values ('casa-tahona', 'Segundo', '2026-10-06', 'ACTIVE');
    raise exception 'FAIL: permitio dos inventarios activos';
  exception when unique_violation then null; end;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory,
      '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":8}]', array[v_item_id]);
    raise exception 'FAIL: acepto diferencia sin observacion';
  exception when check_violation then null; end;
  if not exists (select 1 from public.vinos_physical_inventory_items where id = v_item_id) then
    raise exception 'FAIL: eliminacion no revertida ante error';
  end if;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory,
      '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":-1,"observation":"Invalido"}]');
    raise exception 'FAIL: permitio negativo';
  exception when check_violation then null; end;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory,
      '[{"product_id":"00000000-0000-0000-0000-000000000011","system_qty":10,"physical_qty":8.1234,"observation":"Invalido"}]');
    raise exception 'FAIL: permitio mas de tres decimales';
  exception when check_violation then null; end;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory,
      '[{"product_id":"00000000-0000-0000-0000-000000000012","system_qty":20,"physical_qty":20}]');
    raise exception 'FAIL: permitio producto inactivo';
  exception when raise_exception then
    if sqlerrm <> 'Producto no disponible en el catalogo de Casa Tahona' then raise; end if;
  end;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory, v_items || v_items);
    raise exception 'FAIL: permitio duplicados';
  exception when raise_exception then
    if sqlerrm <> 'Hay productos repetidos en la captura' then raise; end if;
  end;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory, '[]', array['00000000-0000-0000-0000-000000000099'::uuid]);
    raise exception 'FAIL: permitio baja ajena';
  exception when raise_exception then
    if sqlerrm <> 'La captura a eliminar no pertenece a este inventario' then raise; end if;
  end;
  update public.vinos_physical_inventories set is_active = false, status = 'INACTIVE' where id = v_inventory;
  begin
    perform public.save_vinos_physical_inventory_capture(v_inventory, v_items);
    raise exception 'FAIL: permitio guardar en cerrado';
  exception when raise_exception then
    if sqlerrm <> 'El inventario esta cerrado' then raise; end if;
  end;
  update public.vinos_physical_inventories set is_active = true, status = 'ACTIVE' where id = v_inventory;
  perform public.save_vinos_physical_inventory_capture(v_inventory, '[]', array[v_item_id]);
  if exists (select 1 from public.vinos_physical_inventory_items where id = v_item_id) then
    raise exception 'FAIL: no elimino captura';
  end if;
  perform public.save_vinos_physical_inventory_capture(v_inventory, v_items);
  delete from public.vinos_physical_inventories where id = v_inventory;
  if exists (select 1 from public.vinos_physical_inventory_items where inventory_id = v_inventory) then
    raise exception 'FAIL: no elimino detalles en cascada';
  end if;
  if to_regclass('public.branches') is not null then raise exception 'FAIL: la prueba no debe tener branches'; end if;
  raise notice 'PASS: conteo, diferencia, stock intacto, unicidad, validaciones, sin branches, cierre, atomicidad y cascada';
end $$;
