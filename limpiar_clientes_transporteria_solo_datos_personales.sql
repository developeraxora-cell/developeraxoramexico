-- Ejecutar en Supabase SQL Editor.
--
-- Objetivo:
-- Para estos clientes en Transporteria, conservar solo datos personales:
-- - public.credit_customers
-- - public.credit_customer_addresses
--
-- Se eliminan relaciones financieras de TRANSPORTERIA:
-- - credit_payment_evidences
-- - credit_payments
-- - credit_notes
-- - customer_wallet_movements
-- - customer_wallets
--
-- No toca Materiales, Concretera, ventas de inventario ni productos.
-- Revisa primero el PASO 1 antes de ejecutar el PASO 2.

-- PASO 1: Diagnostico de lo que existe asociado en Transporteria.
with requested_customers(requested_name) as (
  values
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
target_customers as (
  select
    c.id,
    c.name,
    c.phone,
    c.address,
    c.credit_limit,
    c.business_unit
  from public.credit_customers c
  join normalized_requested nr
    on regexp_replace(
      translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) = nr.normalized_name
  where c.branch_id = 1
    and c.business_unit = 'transporteria'
),
note_totals as (
  select
    cn.customer_id,
    count(*) as credit_notes_count,
    coalesce(sum(cn.balance), 0) as credit_notes_balance
  from public.credit_notes cn
  join target_customers tc on tc.id = cn.customer_id
  where cn.branch_id = 1
    and cn.business_unit = 'transporteria'
  group by cn.customer_id
),
wallet_totals as (
  select
    cw.customer_id,
    count(*) as wallets_count,
    coalesce(sum(cw.current_balance), 0) as wallet_balance
  from public.customer_wallets cw
  join target_customers tc on tc.id = cw.customer_id
  where cw.branch_id = 1
    and cw.business_unit = 'transporteria'
  group by cw.customer_id
)
select
  tc.id,
  tc.name,
  tc.phone,
  tc.address,
  tc.credit_limit,
  coalesce(nt.credit_notes_count, 0) as credit_notes_count,
  coalesce(nt.credit_notes_balance, 0) as credit_notes_balance,
  coalesce(wt.wallets_count, 0) as wallets_count,
  coalesce(wt.wallet_balance, 0) as wallet_balance
from target_customers tc
left join note_totals nt on nt.customer_id = tc.id
left join wallet_totals wt on wt.customer_id = tc.id
order by tc.name;


-- PASO 2: Limpieza financiera en Transporteria.
-- Ejecuta este bloque solo si el PASO 1 muestra deudas/saldos que no deben existir.

do $$
declare
  v_deleted_rows integer;
begin
  with requested_customers(requested_name) as (
    values
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
  target_customers as (
    select c.id
    from public.credit_customers c
    join normalized_requested nr
      on regexp_replace(
        translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+',
        ' ',
        'g'
      ) = nr.normalized_name
    where c.branch_id = 1
      and c.business_unit = 'transporteria'
  ),
  target_notes as (
    select cn.id
    from public.credit_notes cn
    join target_customers tc on tc.id = cn.customer_id
    where cn.branch_id = 1
      and cn.business_unit = 'transporteria'
  ),
  target_payments as (
    select cp.id
    from public.credit_payments cp
    join target_notes tn on tn.id = cp.note_id
  ),
  deleted_payment_evidence as (
    delete from public.credit_payment_evidences cpe
    using target_payments tp
    where cpe.payment_id = tp.id
    returning cpe.id
  ),
  deleted_payments as (
    delete from public.credit_payments cp
    using target_notes tn
    where cp.note_id = tn.id
    returning cp.id
  ),
  deleted_notes as (
    delete from public.credit_notes cn
    using target_customers tc
    where cn.customer_id = tc.id
      and cn.branch_id = 1
      and cn.business_unit = 'transporteria'
    returning cn.id
  ),
  target_wallets as (
    select cw.id
    from public.customer_wallets cw
    join target_customers tc on tc.id = cw.customer_id
    where cw.branch_id = 1
      and cw.business_unit = 'transporteria'
  ),
  deleted_wallet_movements as (
    delete from public.customer_wallet_movements cwm
    using target_wallets tw
    where cwm.wallet_id = tw.id
    returning cwm.id
  ),
  deleted_wallets as (
    delete from public.customer_wallets cw
    using target_customers tc
    where cw.customer_id = tc.id
      and cw.branch_id = 1
      and cw.business_unit = 'transporteria'
    returning cw.id
  )
  select
    (select count(*) from deleted_payment_evidence)
    + (select count(*) from deleted_payments)
    + (select count(*) from deleted_notes)
    + (select count(*) from deleted_wallet_movements)
    + (select count(*) from deleted_wallets)
  into v_deleted_rows;

  update public.credit_customers c
  set
    credit_limit = 0,
    default_credit_days = 30,
    policy = 'CERO_TOLERANCIA',
    allow_cash_if_blocked = true,
    late_tolerance_days = 0,
    is_active = true,
    updated_at = now()
  from (
    select c2.id
    from public.credit_customers c2
    join (
      values
        ('ruben castillo'),
        ('omar ochoa'),
        ('cemad'),
        ('jose elias lopez herrera'),
        ('ramon lopez herrera'),
        ('servicasa'),
        ('agustin maya'),
        ('cladimaco'),
        ('arriaga jimenez y asociados'),
        ('alejandro arriaga'),
        ('concretos anic'),
        ('lopar jesus maria'),
        ('concretos lopar'),
        ('casa de materiales')
    ) as nr(normalized_name)
      on regexp_replace(
        translate(lower(trim(c2.name)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+',
        ' ',
        'g'
      ) = nr.normalized_name
    where c2.branch_id = 1
      and c2.business_unit = 'transporteria'
  ) target
  where c.id = target.id;
end;
$$;


-- PASO 3: Revision final.
with requested_customers(requested_name) as (
  values
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
    regexp_replace(
      translate(lower(trim(requested_name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_name
  from requested_customers
),
target_customers as (
  select c.*
  from public.credit_customers c
  join normalized_requested nr
    on regexp_replace(
      translate(lower(trim(c.name)), 'áéíóúüñ', 'aeiouun'),
      '[[:space:]]+',
      ' ',
      'g'
    ) = nr.normalized_name
  where c.branch_id = 1
    and c.business_unit = 'transporteria'
)
select
  tc.id,
  tc.name,
  tc.phone,
  tc.address,
  tc.credit_limit,
  (select count(*) from public.credit_notes cn where cn.customer_id = tc.id and cn.business_unit = 'transporteria') as credit_notes_count,
  (select count(*) from public.customer_wallets cw where cw.customer_id = tc.id and cw.business_unit = 'transporteria') as wallets_count
from target_customers tc
order by tc.name;
