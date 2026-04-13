begin;

alter table public.inventory_transaction_items
  add column if not exists line_total numeric(14,2);

update public.inventory_transaction_items
set line_total = round((coalesce(qty, 0) * coalesce(unit_price, 0))::numeric, 2)
where line_total is null;

alter table public.concrete_inventory_transaction_items
  add column if not exists line_total numeric(14,2);

update public.concrete_inventory_transaction_items
set line_total = round((coalesce(qty, 0) * coalesce(unit_price, 0))::numeric, 2)
where line_total is null;

commit;
