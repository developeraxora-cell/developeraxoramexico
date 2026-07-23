-- Casa Tahona: permitir ventas con precio especial.
-- Ejecutar en la base de datos VINOS / Casa Tahona.
--
-- El frontend ya puede enviar price_type = 'ESPECIAL', pero la base puede tener
-- CHECK constraints antiguos que solo permiten MENUDEO, MEDIO_MAYOREO y MAYOREO.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and conname = 'sales_price_type_check'
  ) then
    alter table public.sales drop constraint sales_price_type_check;
  end if;

  alter table public.sales
    add constraint sales_price_type_check
    check (price_type in ('MENUDEO', 'MEDIO_MAYOREO', 'MAYOREO', 'ESPECIAL'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sale_items'::regclass
      and conname = 'sale_items_price_type_check'
  ) then
    alter table public.sale_items drop constraint sale_items_price_type_check;

    alter table public.sale_items
      add constraint sale_items_price_type_check
      check (price_type in ('MENUDEO', 'MEDIO_MAYOREO', 'MAYOREO', 'ESPECIAL'));
  end if;
end $$;

comment on constraint sales_price_type_check on public.sales is
  'Allowed sale price tier. ESPECIAL is used when a cashier registers an authorized special price.';
