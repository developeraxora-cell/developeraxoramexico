-- Restore the 17 recovered historical sales with reused folios to their
-- original document numbers. Leave the nonduplicated 4308 and 4309 untouched.
-- Review the preflight counts and customer payment status before running in production.

begin;

do $$
begin
  if to_regclass('public.inventory_transactions') is null
     or to_regclass('public.credit_notes') is null
     or to_regclass('public.historical_sales') is null then
    raise exception 'Proyecto o esquema incorrecto: faltan tablas de Materiales. Abrir el SQL Editor del proyecto ojizyrjgutnvqjbbyons (no VINOS). No se hizo ningun cambio.';
  end if;
end $$;

lock table public.inventory_transactions, public.credit_notes in share row exclusive mode;

create temporary table jm_historical_folio_repair on commit drop as
select tx.id as sale_id, tx.reference as current_folio, hs.folio as original_folio,
       note.id as note_id
from public.historical_sales hs
join public.inventory_transactions tx
  on tx.branch_id = 2 and tx.business_unit = 'materiales'
 and tx.type = 'SALE' and coalesce(tx.is_deleted, false) = false
 and tx.notes = 'Venta recuperada de nota historica ' || hs.folio
join public.credit_notes note
  on note.inventory_transaction_id = tx.id
 and note.branch_id = 2 and note.business_unit = 'materiales'
where hs.branch_id = 2 and hs.business_unit = 'materiales'
  and hs.folio in ('2892','2943','2948','2961','2891','2906','2907','2908',
                   '2911','2912','2923','2926','2925','2937','2940','2933','2895');

do $$
begin
  if (select count(*) from jm_historical_folio_repair) <> 17
    or (select count(distinct sale_id) from jm_historical_folio_repair) <> 17
    or (select count(distinct note_id) from jm_historical_folio_repair) <> 17
    or (select count(distinct original_folio) from jm_historical_folio_repair) <> 17
  then
    raise exception 'Se esperaban 17 ventas historicas con una nota de credito cada una.';
  end if;

  if exists (
    select 1 from public.inventory_transactions tx
    join jm_historical_folio_repair fix on tx.reference = fix.original_folio
    where tx.branch_id = 2 and tx.business_unit = 'materiales'
      and tx.type = 'SALE' and coalesce(tx.is_deleted, false) = false
      and tx.id <> fix.sale_id
  ) or exists (
    select 1 from public.credit_notes note
    join jm_historical_folio_repair fix on note.folio = fix.original_folio
    where note.branch_id = 2 and note.business_unit = 'materiales'
      and note.id <> fix.note_id
  ) then
    raise exception 'Un folio historico original ya esta ocupado; no se hizo ningun cambio.';
  end if;
end $$;

update public.inventory_transactions tx
set reference = fix.original_folio
from jm_historical_folio_repair fix
where tx.id = fix.sale_id;

update public.credit_notes note
set folio = fix.original_folio,
    sale_reference = fix.original_folio
from jm_historical_folio_repair fix
where note.id = fix.note_id;

do $$
begin
  if exists (
    select 1 from public.inventory_transactions
    where branch_id = 2 and business_unit = 'materiales' and type = 'SALE'
      and coalesce(is_deleted, false) = false and reference is not null
    group by reference having count(*) > 1
  ) then
    raise exception 'Aun hay folios de venta duplicados en Jesus Maria.';
  end if;
end $$;

create unique index if not exists uq_jm_materiales_active_sale_reference
  on public.inventory_transactions (branch_id, business_unit, reference)
  where branch_id = 2 and business_unit = 'materiales' and type = 'SALE'
    and coalesce(is_deleted, false) = false and reference is not null;

create or replace function public.assign_jm_materiales_sale_reference()
returns trigger language plpgsql as $$
declare next_reference bigint;
begin
  if new.branch_id = 2 and coalesce(new.business_unit, 'materiales') = 'materiales'
     and new.type = 'SALE' and coalesce(new.is_deleted, false) = false then
    perform pg_advisory_xact_lock(20024310);
    select coalesce(max(tx.reference::bigint), 0) + 1 into next_reference
    from public.inventory_transactions tx
    where tx.branch_id = 2 and tx.business_unit = 'materiales'
      and tx.type = 'SALE' and coalesce(tx.is_deleted, false) = false
      and tx.reference ~ '^[0-9]+$';
    new.business_unit = 'materiales';
    new.reference = next_reference::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_jm_materiales_sale_reference on public.inventory_transactions;
create trigger trg_assign_jm_materiales_sale_reference
before insert on public.inventory_transactions
for each row execute function public.assign_jm_materiales_sale_reference();

select sale_id, current_folio, original_folio, note_id
from jm_historical_folio_repair order by current_folio::bigint;

commit;

-- Reconcile these against receipts and payments before creating credit notes.
-- A missing credit note does not prove that the full amount is still unpaid.
select tx.id, tx.reference as folio, tx.nombre_cliente, tx.created_at,
       tx.credit_amount
from public.inventory_transactions tx
where tx.branch_id = 2 and tx.business_unit = 'materiales'
  and tx.type = 'SALE' and coalesce(tx.is_deleted, false) = false
  and tx.created_at >= timestamp '2026-11-12'
  and tx.credit_amount > 0
  and not exists (
    select 1 from public.credit_notes note
    where note.inventory_transaction_id = tx.id
  )
order by tx.id;
