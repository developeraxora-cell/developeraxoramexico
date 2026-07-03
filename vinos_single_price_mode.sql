-- Casa Tahona: allow products to use one price for every quantity.
-- Run this in the VINOS / Casa Tahona Supabase database before deploying the app change.

alter table public.products
  add column if not exists single_price_mode boolean not null default false;

update public.products
set single_price_mode = false
where single_price_mode is null;

comment on column public.products.single_price_mode is
  'When true, POS always applies MENUDEO price and ignores wholesale quantity thresholds.';
