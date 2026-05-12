-- Ejecutar en Supabase SQL Editor.
--
-- Alcance:
-- - Origen: credit_customers de Materiales, sucursal Degollado branch_id = 1.
-- - Destino: credit_customers de Transporteria, misma sucursal branch_id = 1.
-- - Solo se trasladan datos personales: nombre, telefono y direccion.
-- - NO se copian ventas, notas de credito, pagos, saldo a favor ni historial.
-- - El nuevo cliente queda con credito inicial en cero.
--
-- PASO 1:
-- Ejecuta solamente esta primera consulta para validar la lista.
-- Debe salir source_matches = 1 para cada cliente antes de correr el PASO 2.

with requested_customers(requested_name) as (
  values
    ('Abastecedora Tepic'),
    ('Ruben Castillo'),
    ('Omar Ochoa'),
    ('Cemad'),
    ('JOSE ELIAS LOPEZ HERRERA'),
    ('Ramon Lopez Herrera'),
    ('Servicasa'),
    ('Agustin Maya'),
    ('Cladimaco'),
    ('ARRIAGA JIMENEZ Y ASOCIADOS'),
    ('Alejandro Arriaga'),
    ('Concretos Anic'),
    ('Lopar Jesus Maria'),
    ('Concretos Lopar'),
    ('Casa de Materiales')
),
normalized_requested as (
  select
    requested_name,
    regexp_replace(
      translate(lower(trim(requested_name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_name
  from requested_customers
),
source_matches as (
  select
    nr.requested_name,
    nr.normalized_name,
    c.id,
    c.name,
    c.phone,
    c.address
  from normalized_requested nr
  left join public.credit_customers c
    on c.branch_id = 1
   and c.business_unit = 'materiales'
   and regexp_replace(
      translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) = nr.normalized_name
),
target_matches as (
  select
    nr.requested_name,
    count(t.id) as transporteria_matches
  from normalized_requested nr
  left join public.credit_customers t
    on t.branch_id = 1
   and t.business_unit = 'transporteria'
   and regexp_replace(
      translate(lower(trim(t.name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) = nr.normalized_name
  group by nr.requested_name
)
select
  sm.requested_name,
  count(sm.id) as source_matches,
  string_agg(sm.name, ' | ' order by sm.name) filter (where sm.id is not null) as material_customer_found,
  max(tm.transporteria_matches) as already_in_transporteria
from source_matches sm
join target_matches tm on tm.requested_name = sm.requested_name
group by sm.requested_name
order by sm.requested_name;


-- PASO 2:
-- Ejecuta este bloque completo solo cuando el PASO 1 confirme:
-- - source_matches = 1 en todos
-- - ya revisaste los que tengan already_in_transporteria > 0
--
-- El bloque es idempotente:
-- - Si el cliente ya existe en Transporteria con el mismo nombre normalizado, no lo duplica.
-- - Si falta o sobra una coincidencia en Materiales, aborta.

do $$
declare
  v_invalid_count integer;
begin
  with requested_customers(requested_name) as (
    values
      ('Abastecedora Tepic'),
      ('Ruben Castillo'),
      ('Omar Ochoa'),
      ('Cemad'),
      ('JOSE ELIAS LOPEZ HERRERA'),
      ('Ramon Lopez Herrera'),
      ('Servicasa'),
      ('Agustin Maya'),
      ('Cladimaco'),
      ('ARRIAGA JIMENEZ Y ASOCIADOS'),
      ('Alejandro Arriaga'),
      ('Concretos Anic'),
      ('Lopar Jesus Maria'),
      ('Concretos Lopar'),
      ('Casa de Materiales')
  ),
  normalized_requested as (
    select
      requested_name,
      regexp_replace(
        translate(lower(trim(requested_name)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+',
        ' ',
        'g'
      ) as normalized_name
    from requested_customers
  ),
  validation as (
    select
      nr.requested_name,
      count(c.id) as source_matches
    from normalized_requested nr
    left join public.credit_customers c
      on c.branch_id = 1
     and c.business_unit = 'materiales'
     and regexp_replace(
        translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+',
        ' ',
        'g'
      ) = nr.normalized_name
    group by nr.requested_name
  )
  select count(*)
  into v_invalid_count
  from validation
  where source_matches <> 1;

  if v_invalid_count > 0 then
    raise exception 'Clonacion cancelada: hay clientes inexistentes o ambiguos en Materiales. Ejecuta y revisa el PASO 1.';
  end if;
end;
$$;

with requested_customers(requested_name) as (
  values
    ('Abastecedora Tepic'),
    ('Ruben Castillo'),
    ('Omar Ochoa'),
    ('Cemad'),
    ('JOSE ELIAS LOPEZ HERRERA'),
    ('Ramon Lopez Herrera'),
    ('Servicasa'),
    ('Agustin Maya'),
    ('Cladimaco'),
    ('ARRIAGA JIMENEZ Y ASOCIADOS'),
    ('Alejandro Arriaga'),
    ('Concretos Anic'),
    ('Lopar Jesus Maria'),
    ('Concretos Lopar'),
    ('Casa de Materiales')
),
normalized_requested as (
  select
    requested_name,
    regexp_replace(
      translate(lower(trim(requested_name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_name
  from requested_customers
),
source_customers as (
  select distinct on (nr.normalized_name)
    nr.normalized_name,
    c.name,
    c.phone,
    c.address
  from normalized_requested nr
  join public.credit_customers c
    on c.branch_id = 1
   and c.business_unit = 'materiales'
   and regexp_replace(
      translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
      '\s+',
      ' ',
      'g'
    ) = nr.normalized_name
  order by nr.normalized_name, c.created_at asc nulls last, c.id
),
inserted_customers as (
  insert into public.credit_customers (
    branch_id,
    business_unit,
    name,
    phone,
    address,
    credit_limit,
    default_credit_days,
    policy,
    allow_cash_if_blocked,
    late_tolerance_days,
    is_active
  )
  select
    1 as branch_id,
    'transporteria' as business_unit,
    sc.name,
    sc.phone,
    sc.address,
    0 as credit_limit,
    30 as default_credit_days,
    'CERO_TOLERANCIA' as policy,
    true as allow_cash_if_blocked,
    0 as late_tolerance_days,
    true as is_active
  from source_customers sc
  where not exists (
    select 1
    from public.credit_customers t
    where t.branch_id = 1
      and t.business_unit = 'transporteria'
      and regexp_replace(
        translate(lower(trim(t.name)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+',
        ' ',
        'g'
      ) = sc.normalized_name
  )
  returning id, name, phone, address
),
inserted_addresses as (
  insert into public.credit_customer_addresses (
    customer_id,
    label,
    address,
    is_default
  )
  select
    ic.id,
    'Principal',
    trim(ic.address),
    true
  from inserted_customers ic
  where nullif(trim(coalesce(ic.address, '')), '') is not null
  returning customer_id
)
select
  ic.id as new_transport_customer_id,
  ic.name,
  ic.phone,
  ic.address,
  case when ia.customer_id is null then false else true end as default_address_created
from inserted_customers ic
left join inserted_addresses ia on ia.customer_id = ic.id
order by ic.name;


-- PASO 3:
-- Consulta final de revision del destino.

select
  id,
  branch_id,
  business_unit,
  name,
  phone,
  address,
  credit_limit,
  default_credit_days,
  policy,
  is_active
from public.credit_customers
where branch_id = 1
  and business_unit = 'transporteria'
  and regexp_replace(
    translate(lower(trim(name)), 'áéíóúüñ', 'aeiouun'),
    '[[:space:]]+',
    ' ',
    'g'
  ) in (
    'abastecedora tepic',
    'ruben castillo',
    'omar ochoa',
    'cemad',
    'jose elias lopez herrera',
    'ramon lopez herrera',
    'servicasa',
    'agustin maya',
    'cladimaco',
    'arriaga jimenez y asociados',
    'alejandro arriaga',
    'concretos anic',
    'lopar jesus maria',
    'concretos lopar',
    'casa de materiales'
  )
order by name;
