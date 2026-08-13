-- Repara el folio visible de ventas de DEGOLLADO LOPAR despues del salto
-- provocado por la migracion de Jesus Maria.
--
-- Alcance intencional:
--   branch_id = 1
--   business_unit = 'materiales'
--   type = 'SALE'
--   inventory_transactions.id >= 7175
--
-- Importante: no usa deteccion automatica de saltos. El primer folio afectado
-- confirmado por operacion es 7175 y debe verse como 3808.

begin;

update public.credit_notes
set business_unit = 'materiales'
where business_unit is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'uq_credit_notes_branch_folio'
      and conrelid = 'public.credit_notes'::regclass
  ) then
    alter table public.credit_notes drop constraint uq_credit_notes_branch_folio;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'uq_credit_notes_branch_business_unit_folio'
      and conrelid = 'public.credit_notes'::regclass
  ) then
    alter table public.credit_notes
      add constraint uq_credit_notes_branch_business_unit_folio
      unique (branch_id, business_unit, folio);
  end if;
end $$;

create temporary table migration_degollado_sale_reference_fix on commit drop as
select
  tx.id,
  tx.reference as old_reference,
  (3807 + row_number() over (order by tx.created_at, tx.id))::text as new_reference,
  tx.created_at,
  tx.nombre_cliente,
  tx.payment_type
from public.inventory_transactions tx
where tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE'
  and coalesce(tx.is_deleted, false) = false
  and tx.id >= 7175
order by tx.created_at, tx.id;

update public.inventory_transactions tx
set reference = fix.new_reference
from migration_degollado_sale_reference_fix fix
where tx.id = fix.id
  and tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE'
  and coalesce(tx.is_deleted, false) = false;

update public.credit_notes note
set
  folio = fix.new_reference,
  sale_reference = fix.new_reference
from migration_degollado_sale_reference_fix fix
where note.inventory_transaction_id = fix.id
  and note.branch_id = 1
  and note.business_unit = 'materiales';

select
  id as internal_id,
  old_reference,
  new_reference as visible_sale_number,
  created_at,
  nombre_cliente,
  payment_type
from migration_degollado_sale_reference_fix
order by created_at, id;

commit;
