-- Protege el consecutivo visible de ventas de DEGOLLADO LOPAR.
--
-- Corrige ventas recientes que quedaron sin reference y agrega triggers para
-- que el folio visible de Degollado/materiales no dependa del frontend.
--
-- Alcance:
--   branch_id = 1
--   business_unit = 'materiales'
--   type = 'SALE'
--   desde la venta interna 7175 / folio visible 3808

begin;

create temporary table migration_degollado_missing_sale_refs on commit drop as
with base as (
  select coalesce(max(tx.reference::bigint), 3807) as current_max
  from public.inventory_transactions tx
  where tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.type = 'SALE'
    and coalesce(tx.is_deleted, false) = false
    and tx.id >= 7175
    and tx.created_at >= timestamp '2026-08-12 22:50:57.935214'
    and tx.reference ~ '^[0-9]+$'
),
missing as (
  select
    tx.id,
    tx.reference as old_reference,
    (base.current_max + row_number() over (order by tx.created_at, tx.id))::text as new_reference,
    tx.created_at,
    tx.nombre_cliente,
    tx.payment_type
  from public.inventory_transactions tx
  cross join base
  where tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.type = 'SALE'
    and coalesce(tx.is_deleted, false) = false
    and tx.id >= 7175
    and tx.created_at >= timestamp '2026-08-12 22:50:57.935214'
    and nullif(trim(coalesce(tx.reference, '')), '') is null
)
select *
from missing;

update public.inventory_transactions tx
set reference = fix.new_reference
from migration_degollado_missing_sale_refs fix
where tx.id = fix.id
  and tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE';

update public.credit_notes note
set
  folio = tx.reference,
  sale_reference = tx.reference
from public.inventory_transactions tx
where note.inventory_transaction_id = tx.id
  and note.branch_id = 1
  and note.business_unit = 'materiales'
  and tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE'
  and coalesce(tx.is_deleted, false) = false
  and tx.id >= 7175
  and tx.created_at >= timestamp '2026-08-12 22:50:57.935214'
  and tx.reference ~ '^[0-9]+$';

create or replace function public.assign_degollado_materiales_sale_reference()
returns trigger
language plpgsql
as $$
declare
  next_reference bigint;
begin
  if new.branch_id = 1
    and coalesce(new.business_unit, 'materiales') = 'materiales'
    and new.type = 'SALE'
    and coalesce(new.is_deleted, false) = false
    and nullif(trim(coalesce(new.reference, '')), '') is null
    and coalesce(new.created_at, now()) >= timestamp '2026-08-12 22:50:57.935214'
  then
    perform pg_advisory_xact_lock(10013808);

    select coalesce(max(tx.reference::bigint), 3807) + 1
    into next_reference
    from public.inventory_transactions tx
    where tx.branch_id = 1
      and tx.business_unit = 'materiales'
      and tx.type = 'SALE'
      and coalesce(tx.is_deleted, false) = false
      and tx.id >= 7175
      and tx.created_at >= timestamp '2026-08-12 22:50:57.935214'
      and tx.reference ~ '^[0-9]+$';

    new.business_unit = 'materiales';
    new.reference = next_reference::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_degollado_materiales_sale_reference on public.inventory_transactions;
create trigger trg_assign_degollado_materiales_sale_reference
before insert on public.inventory_transactions
for each row
execute function public.assign_degollado_materiales_sale_reference();

create or replace function public.sync_degollado_materiales_credit_note_folio()
returns trigger
language plpgsql
as $$
declare
  sale_reference text;
begin
  if new.branch_id = 1
    and coalesce(new.business_unit, 'materiales') = 'materiales'
    and new.inventory_transaction_id is not null
  then
    select tx.reference
    into sale_reference
    from public.inventory_transactions tx
    where tx.id = new.inventory_transaction_id
      and tx.branch_id = 1
      and tx.business_unit = 'materiales'
      and tx.type = 'SALE'
      and coalesce(tx.is_deleted, false) = false
      and tx.id >= 7175
      and tx.created_at >= timestamp '2026-08-12 22:50:57.935214'
      and tx.reference ~ '^[0-9]+$'
    limit 1;

    if sale_reference is not null then
      new.business_unit = 'materiales';
      new.folio = sale_reference;
      new.sale_reference = sale_reference;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_degollado_materiales_credit_note_folio on public.credit_notes;
create trigger trg_sync_degollado_materiales_credit_note_folio
before insert or update of branch_id, business_unit, inventory_transaction_id, folio, sale_reference
on public.credit_notes
for each row
execute function public.sync_degollado_materiales_credit_note_folio();

select
  id as internal_id,
  old_reference,
  new_reference as visible_sale_number,
  created_at,
  nombre_cliente,
  payment_type
from migration_degollado_missing_sale_refs
order by created_at, id;

commit;
