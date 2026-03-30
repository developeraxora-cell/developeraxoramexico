alter table public.inventory_transactions
add column if not exists notes text;

alter table public.concrete_inventory_transactions
add column if not exists notes text;
