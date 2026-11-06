-- Folios visibles de ventas de Concretera independientes por sucursal.
-- Ejecutar antes de 02_load.sql. Los IDs internos siguen siendo globales.
begin;

create table if not exists public.concrete_sale_counters (
  branch_id bigint primary key references public.branches(id),
  last_number bigint not null default 0 check (last_number >= 0)
);

-- Degollado ya muestra los IDs internos históricos; continúa desde su último
-- ID visible. En otras sucursales se prefieren referencias numéricas existentes.
insert into public.concrete_sale_counters (branch_id, last_number)
select branch_id,
  case when branch_id = 1 then greatest(max(id), coalesce(max(reference::bigint) filter (where reference ~ '^[0-9]+$'), 0))
       else coalesce(max(reference::bigint) filter (where reference ~ '^[0-9]+$'), max(id)) end
from public.concrete_inventory_transactions
where type = 'SALE'
group by branch_id
on conflict (branch_id) do update
set last_number = greatest(public.concrete_sale_counters.last_number, excluded.last_number);

create or replace function public.assign_concrete_branch_sale_reference()
returns trigger language plpgsql as $$
declare assigned bigint;
begin
  if new.type <> 'SALE' or new.branch_id is null then return new; end if;

  if nullif(trim(coalesce(new.reference, '')), '') is null then
    insert into public.concrete_sale_counters (branch_id, last_number)
    values (new.branch_id, 1)
    on conflict (branch_id) do update
    set last_number = public.concrete_sale_counters.last_number + 1
    returning last_number into assigned;
    new.reference = assigned::text;
  elsif trim(new.reference) ~ '^[0-9]+$' then
    insert into public.concrete_sale_counters (branch_id, last_number)
    values (new.branch_id, trim(new.reference)::bigint)
    on conflict (branch_id) do update
    set last_number = greatest(public.concrete_sale_counters.last_number, excluded.last_number);
  end if;

  return new;
end $$;

drop trigger if exists trg_assign_concrete_branch_sale_reference
  on public.concrete_inventory_transactions;
create trigger trg_assign_concrete_branch_sale_reference
before insert on public.concrete_inventory_transactions
for each row execute function public.assign_concrete_branch_sale_reference();

select b.id, b.code, c.last_number as current_visible_sale_number
from public.concrete_sale_counters c
join public.branches b on b.id = c.branch_id
order by b.id;

commit;
