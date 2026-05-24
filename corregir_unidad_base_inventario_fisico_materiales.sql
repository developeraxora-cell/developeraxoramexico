-- Agrega y rellena unidad base en productos capturados del inventario fisico de materiales.
-- Ejecutar en Supabase SQL Editor.

alter table public.material_physical_inventory_items
  add column if not exists base_uom_id bigint null references public.uoms(id),
  add column if not exists base_uom_code text null;

update public.material_physical_inventory_items item
set
  base_uom_id = p.base_uom_id,
  base_uom_code = coalesce(u.code, u.name)
from public.products p
left join public.uoms u on u.id = p.base_uom_id
where item.product_id = p.id
  and (item.base_uom_id is null or item.base_uom_code is null);

select
  item.id,
  item.product_name,
  item.base_uom_id,
  item.base_uom_code
from public.material_physical_inventory_items item
order by item.counted_at desc
limit 20;
