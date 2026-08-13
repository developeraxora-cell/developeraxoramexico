-- Normaliza folios migrados de JESUS MARIA LOPAR.
--
-- Antes:
--   inventory_transactions.reference = MIG-JM-VENTA-2801
--   credit_notes.folio = MIG-JM-CRED-2801
--   credit_notes.sale_reference = MIG-JM-VENTA-2801
--
-- Despues:
--   inventory_transactions.reference = 2801
--   credit_notes.folio = 2801
--   credit_notes.sale_reference = 2801
--
-- Alcance:
--   branch_id = 2
--   business_unit = 'materiales'

begin;

create temporary table migration_jm_sales_to_normalize on commit drop as
select
  id,
  reference as old_reference,
  substring(reference from '^MIG-JM-VENTA-([0-9]+)$') as new_reference
from public.inventory_transactions
where branch_id = 2
  and business_unit = 'materiales'
  and type = 'SALE'
  and coalesce(is_deleted, false) = false
  and reference ~ '^MIG-JM-VENTA-[0-9]+$';

create temporary table migration_jm_credit_notes_to_normalize on commit drop as
select
  id,
  folio as old_folio,
  sale_reference as old_sale_reference,
  coalesce(
    substring(sale_reference from '^MIG-JM-VENTA-([0-9]+)$'),
    substring(folio from '^MIG-JM-CRED-([0-9]+)$')
  ) as new_folio
from public.credit_notes
where branch_id = 2
  and business_unit = 'materiales'
  and (
    sale_reference ~ '^MIG-JM-VENTA-[0-9]+$'
    or folio ~ '^MIG-JM-CRED-[0-9]+$'
  );

do $$
begin
  if exists (
    select 1
    from (
      select new_folio, count(*) as count_rows
      from migration_jm_credit_notes_to_normalize
      where new_folio is not null
      group by new_folio
      having count(*) > 1
    ) duplicated
  ) then
    raise exception 'La normalizacion crearia folios duplicados en credit_notes.';
  end if;
end $$;

update public.inventory_transactions tx
set reference = fix.new_reference
from migration_jm_sales_to_normalize fix
where tx.id = fix.id;

update public.credit_notes note
set
  folio = fix.new_folio,
  sale_reference = fix.new_folio
from migration_jm_credit_notes_to_normalize fix
where note.id = fix.id
  and fix.new_folio is not null;

select
  'ventas_normalizadas' as action,
  count(*) as row_count
from migration_jm_sales_to_normalize
union all
select
  'notas_credito_normalizadas' as action,
  count(*) as row_count
from migration_jm_credit_notes_to_normalize;

select
  tx.id as internal_id,
  fix.old_reference,
  tx.reference as visible_sale_number,
  tx.created_at,
  tx.nombre_cliente,
  tx.payment_type
from public.inventory_transactions tx
join migration_jm_sales_to_normalize fix on fix.id = tx.id
where tx.id in (7167, 7170, 7171)
order by tx.id;

commit;
