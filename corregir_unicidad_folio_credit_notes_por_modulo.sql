-- Ejecutar en Supabase SQL Editor.
--
-- Problema:
-- Materiales y Transporteria comparten branch_id = 1.
-- La restriccion vieja uq_credit_notes_branch_folio obliga que el folio sea unico
-- solo por (branch_id, folio), entonces una nota de Transporteria choca contra
-- un folio existente de Materiales.
--
-- Solucion:
-- La unicidad correcta es por (branch_id, business_unit, folio).

-- 1) Diagnostico: verifica si hay duplicados dentro del mismo modulo.
select
  branch_id,
  business_unit,
  folio,
  count(*) as total
from public.credit_notes
group by branch_id, business_unit, folio
having count(*) > 1
order by branch_id, business_unit, folio;

-- Si la consulta anterior devuelve filas, primero hay que resolver esos duplicados.
-- Si no devuelve filas, ejecuta el bloque siguiente.

do $$
begin
  if exists (
    select 1
    from public.credit_notes
    group by branch_id, business_unit, folio
    having count(*) > 1
  ) then
    raise exception 'No se puede crear la nueva unicidad: hay folios duplicados dentro del mismo business_unit. Revisa el diagnostico.';
  end if;

  alter table public.credit_notes
    drop constraint if exists uq_credit_notes_branch_folio;

  alter table public.credit_notes
    add constraint uq_credit_notes_branch_business_unit_folio
    unique (branch_id, business_unit, folio);
end;
$$;

-- 2) Confirmacion de constraints activas.
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.credit_notes'::regclass
  and contype = 'u'
order by conname;
