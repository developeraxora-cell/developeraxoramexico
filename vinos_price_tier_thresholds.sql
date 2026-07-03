-- Casa Tahona: automatic price tier thresholds by base-unit quantity.
-- Run this in the VINOS / Casa Tahona Supabase database before deploying the app change.

alter table public.products
  add column if not exists purchase_cost numeric,
  add column if not exists price_mid_wholesale_min_qty numeric,
  add column if not exists price_wholesale_min_qty numeric;

update public.products
set
  price_mid_wholesale_min_qty = coalesce(price_mid_wholesale_min_qty, 10),
  price_wholesale_min_qty = coalesce(price_wholesale_min_qty, 20)
where deleted_at is null;

alter table public.products
  alter column price_mid_wholesale_min_qty set default 10,
  alter column price_wholesale_min_qty set default 20;

comment on column public.products.price_mid_wholesale_min_qty is
  'Base-unit quantity from which MEDIO_MAYOREO price applies.';

comment on column public.products.price_wholesale_min_qty is
  'Base-unit quantity from which MAYOREO price applies.';

comment on column public.products.purchase_cost is
  'Reference purchase cost per base unit used for suggested sales prices when no purchase item exists yet.';
