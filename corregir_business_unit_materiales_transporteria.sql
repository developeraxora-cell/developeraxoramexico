-- Ejecutar en Supabase SQL Editor.
--
-- Problema actual:
-- El frontend de Materiales y Transporteria lee public.credit_customers filtrando por:
--   branch_id = 1
--   business_unit = 'materiales' o 'transporteria'
--
-- Si los clientes quedaron con business_unit NULL, vacio, mal escrito o con espacios,
-- el frontend no los puede visualizar.

-- 1) Diagnostico real de CLIENTES.
select
  branch_id,
  coalesce(nullif(trim(business_unit), ''), '[SIN BUSINESS_UNIT]') as business_unit,
  count(*) as total_clientes
from public.credit_customers
group by branch_id, coalesce(nullif(trim(business_unit), ''), '[SIN BUSINESS_UNIT]')
order by branch_id, business_unit;

-- 2) Muestra ejemplos de clientes que el frontend NO va a encontrar.
select
  id,
  branch_id,
  name,
  business_unit,
  is_active
from public.credit_customers
where branch_id = 1
  and (
    business_unit is null
    or trim(business_unit) = ''
    or trim(business_unit) not in ('materiales', 'transporteria')
  )
order by name
limit 100;

-- 3) Correccion conservadora:
--    Todo cliente de branch 1 sin business_unit valido vuelve a Materiales.
--    No toca los que ya son transporteria.
update public.credit_customers
set
  business_unit = 'materiales',
  updated_at = now()
where branch_id = 1
  and (
    business_unit is null
    or trim(business_unit) = ''
    or trim(business_unit) not in ('materiales', 'transporteria')
  );

-- 4) Limpieza de espacios por si business_unit quedo como 'materiales ' o ' transporteria'.
update public.credit_customers
set
  business_unit = trim(business_unit),
  updated_at = now()
where branch_id = 1
  and business_unit is not null
  and business_unit <> trim(business_unit);

-- 5) Revision final esperada:
--    Para branch_id = 1 debe aparecer al menos:
--    materiales      -> clientes de Materiales
--    transporteria   -> clientes clonados o propios de Transporteria
select
  branch_id,
  business_unit,
  count(*) as total_clientes
from public.credit_customers
where branch_id = 1
group by branch_id, business_unit
order by business_unit;

-- 6) Pruebas exactas que replica el frontend.
select
  id,
  name,
  phone,
  address,
  credit_limit,
  business_unit
from public.credit_customers
where branch_id = 1
  and business_unit = 'materiales'
order by name
limit 10;

select
  id,
  name,
  phone,
  address,
  credit_limit,
  business_unit
from public.credit_customers
where branch_id = 1
  and business_unit = 'transporteria'
order by name
limit 10;
