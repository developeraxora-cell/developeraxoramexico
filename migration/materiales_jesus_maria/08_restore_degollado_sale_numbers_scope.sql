-- Rollback/correccion de alcance para folios visibles de DEGOLLADO LOPAR.
--
-- Problema que corrige:
--   una version anterior de 06_repair_degollado_sale_numbers.sql detecto un
--   salto historico viejo y puso referencias visibles a ventas anteriores al
--   7175.
--
-- Resultado esperado:
--   - Las ventas anteriores a 7175 vuelven a mostrarse por su id normal.
--   - Solo las ventas desde 7175 usan referencia visible 3808, 3809, 3810...
--
-- Alcance:
--   branch_id = 1
--   business_unit = 'materiales'
--   type = 'SALE'

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

create temporary table migration_degollado_pre7175_restore on commit drop as
select
  tx.id,
  tx.reference
from public.inventory_transactions tx
where tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE'
  and coalesce(tx.is_deleted, false) = false
  and tx.id < 7175
  and tx.reference ~ '^[0-9]+$'
  and tx.reference::bigint between 29812 and 31516;

update public.inventory_transactions tx
set reference = null
from migration_degollado_pre7175_restore restore
where tx.id = restore.id
  and tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE';

update public.credit_notes note
set
  folio = note.inventory_transaction_id::text,
  sale_reference = note.inventory_transaction_id::text
from migration_degollado_pre7175_restore restore
where note.inventory_transaction_id = restore.id
  and note.branch_id = 1
  and note.business_unit = 'materiales'
  and (
    (
      note.folio ~ '^[0-9]+$'
      and note.folio::bigint between 29812 and 31516
    )
    or (
      note.sale_reference ~ '^[0-9]+$'
      and note.sale_reference::bigint between 29812 and 31516
    )
  );

create temporary table migration_degollado_7175_fix on commit drop as
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
from migration_degollado_7175_fix fix
where tx.id = fix.id
  and tx.branch_id = 1
  and tx.business_unit = 'materiales'
  and tx.type = 'SALE'
  and coalesce(tx.is_deleted, false) = false;

update public.credit_notes note
set
  folio = fix.new_reference,
  sale_reference = fix.new_reference
from migration_degollado_7175_fix fix
where note.inventory_transaction_id = fix.id
  and note.branch_id = 1
  and note.business_unit = 'materiales';

select
  'ventas_antes_7175_restauradas' as action,
  count(*) as row_count
from migration_degollado_pre7175_restore
union all
select
  'ventas_desde_7175_renumeradas' as action,
  count(*) as row_count
from migration_degollado_7175_fix;

select
  id as internal_id,
  old_reference,
  new_reference as visible_sale_number,
  created_at,
  nombre_cliente,
  payment_type
from migration_degollado_7175_fix
order by created_at, id;

commit;
