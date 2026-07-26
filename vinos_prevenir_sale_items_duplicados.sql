-- Casa Tahona: prevenir renglones duplicados en una misma nota de venta.
-- Ejecutar en la base de datos VINOS / Casa Tahona despues de limpiar duplicados historicos.
--
-- Regla:
-- Una misma venta no debe tener dos renglones con el mismo producto, unidad,
-- tipo de precio y precio unitario. Si el cajero agrega el mismo producto otra
-- vez, la app debe sumar cantidad en el mismo renglon.

do $$
begin
  if exists (
    select 1
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.deleted_at is null
    group by
      si.sale_id,
      si.product_id,
      coalesce(si.product_uom_id, '00000000-0000-0000-0000-000000000000'::uuid),
      si.price_type,
      si.unit_price
    having count(*) > 1
  ) then
    raise exception 'Aun existen renglones duplicados en sale_items. Limpialos antes de crear el indice unico.';
  end if;
end $$;

create unique index if not exists sale_items_no_duplicate_line_idx
on public.sale_items (
  sale_id,
  product_id,
  coalesce(product_uom_id, '00000000-0000-0000-0000-000000000000'::uuid),
  price_type,
  unit_price
);
