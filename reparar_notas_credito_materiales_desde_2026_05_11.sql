-- ============================================================================
-- DIAGNÓSTICO Y REPARACIÓN DE NOTAS DE CRÉDITO FALTANTES
-- Módulo: Materiales
-- Sucursal: Degollado (branch_id = 1)
-- Rango: 2026-05-11 hasta hoy
--
-- Qué hace:
--   1) Detecta ventas a crédito del periodo que no tienen nota de crédito.
--   2) Detecta ventas cuya nota existe pero quedó ligada a un cliente incorrecto.
--   3) Inserta notas faltantes cuando el nombre del cliente permite una única
--      coincidencia en credit_customers.
--   4) Reasigna la nota al cliente correcto cuando la venta ya tenía nota pero
--      el customer_id quedó mal.
--
-- No toca:
--   - ventas ya registradas
--   - pagos ya aplicados
--   - notas de crédito de otros módulos
-- ============================================================================

begin;

create temporary table tmp_credit_sales_diagnosis on commit drop as
with sale_candidates as (
  select
    tx.id as sale_id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.created_at::date as issue_date,
    tx.nombre_cliente,
    tx.direccion_cliente,
    upper(trim(coalesce(tx.payment_type, ''))) as payment_type,
    coalesce(
      nullif(abs(tx.credit_amount), 0),
      round(coalesce(sum(iti.line_total), 0)::numeric, 2)
    ) as note_total,
    regexp_replace(
      translate(lower(trim(coalesce(tx.nombre_cliente, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.inventory_transactions tx
  left join public.inventory_transaction_items iti
    on iti.transaction_id = tx.id
  where tx.type = 'SALE'
    and tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.created_at >= timestamp '2026-05-11 00:00:00'
    and tx.created_at <= now()
    and upper(trim(coalesce(tx.payment_type, ''))) = 'CREDITO'
  group by
    tx.id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.nombre_cliente,
    tx.direccion_cliente,
    tx.payment_type,
    tx.credit_amount
),
customer_candidates as (
  select
    c.id as customer_id,
    c.name as customer_name,
    coalesce(c.default_credit_days, 30) as default_credit_days,
    regexp_replace(
      translate(lower(trim(coalesce(c.name, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.credit_customers c
  where c.branch_id = 1
    and c.business_unit = 'materiales'
),
existing_notes as (
  select
    cn.id as note_id,
    cn.customer_id,
    cn.branch_id,
    cn.business_unit,
    cn.inventory_transaction_id,
    cn.sale_reference,
    cn.folio,
    cn.total,
    cn.paid_amount,
    cn.balance,
    cn.issue_date,
    cn.due_date,
    cn.credit_days_applied
  from public.credit_notes cn
  where cn.branch_id = 1
    and cn.business_unit = 'materiales'
),
sale_resolution as (
  select
    sc.sale_id,
    sc.branch_id,
    sc.business_unit,
    sc.created_at,
    sc.issue_date,
    sc.nombre_cliente,
    sc.direccion_cliente,
    sc.payment_type,
    sc.note_total,
    sc.normalized_customer_name,
    count(distinct cc.customer_id) as customer_match_count,
    (max(cc.customer_id::text) filter (where cc.customer_id is not null))::uuid as matched_customer_id,
    max(cc.customer_name) filter (where cc.customer_name is not null) as matched_customer_name,
    max(cc.default_credit_days) filter (where cc.default_credit_days is not null) as matched_default_credit_days,
    (max(en.note_id::text))::uuid as note_id,
    (max(en.customer_id::text))::uuid as note_customer_id,
    max(en.inventory_transaction_id) as note_inventory_transaction_id,
    max(en.sale_reference) as note_sale_reference,
    max(en.folio) as note_folio
  from sale_candidates sc
  left join customer_candidates cc
    on cc.normalized_customer_name = sc.normalized_customer_name
  left join existing_notes en
    on en.inventory_transaction_id = sc.sale_id
       or en.sale_reference = sc.sale_id::text
       or en.folio = sc.sale_id::text
  group by
    sc.sale_id,
    sc.branch_id,
    sc.business_unit,
    sc.created_at,
    sc.issue_date,
    sc.nombre_cliente,
    sc.direccion_cliente,
    sc.payment_type,
    sc.note_total,
    sc.normalized_customer_name
),
diagnosis as (
  select
    sale_id,
    created_at,
    nombre_cliente,
    note_total,
    customer_match_count,
    matched_customer_name,
    note_id,
    note_customer_id,
    case
      when customer_match_count = 0 then 'SIN_CLIENTE_MATCH'
      when customer_match_count > 1 then 'CLIENTE_AMBIGUO'
      when note_id is null then 'NOTA_FALTANTE'
      when note_customer_id is distinct from matched_customer_id then 'NOTA_LIGADA_A_CLIENTE_EQUIVOCADO'
      else 'OK'
    end as status
  from sale_resolution
)
select *
from diagnosis
;

create temporary table tmp_credit_sale_resolution on commit drop as
with sale_candidates as (
  select
    tx.id as sale_id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.created_at::date as issue_date,
    tx.nombre_cliente,
    tx.direccion_cliente,
    upper(trim(coalesce(tx.payment_type, ''))) as payment_type,
    coalesce(
      nullif(abs(tx.credit_amount), 0),
      round(coalesce(sum(iti.line_total), 0)::numeric, 2)
    ) as note_total,
    regexp_replace(
      translate(lower(trim(coalesce(tx.nombre_cliente, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.inventory_transactions tx
  left join public.inventory_transaction_items iti
    on iti.transaction_id = tx.id
  where tx.type = 'SALE'
    and tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.created_at >= timestamp '2026-05-11 00:00:00'
    and tx.created_at <= now()
    and upper(trim(coalesce(tx.payment_type, ''))) = 'CREDITO'
  group by
    tx.id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.nombre_cliente,
    tx.direccion_cliente,
    tx.payment_type,
    tx.credit_amount
),
customer_candidates as (
  select
    c.id as customer_id,
    c.name as customer_name,
    coalesce(c.default_credit_days, 30) as default_credit_days,
    regexp_replace(
      translate(lower(trim(coalesce(c.name, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.credit_customers c
  where c.branch_id = 1
    and c.business_unit = 'materiales'
),
existing_notes as (
  select
    cn.id as note_id,
    cn.customer_id,
    cn.branch_id,
    cn.business_unit,
    cn.inventory_transaction_id,
    cn.sale_reference,
    cn.folio
  from public.credit_notes cn
  where cn.branch_id = 1
    and cn.business_unit = 'materiales'
)
select
  sc.sale_id,
  sc.branch_id,
  sc.business_unit,
  sc.created_at,
  sc.issue_date,
  sc.nombre_cliente,
  sc.direccion_cliente,
  sc.payment_type,
  sc.note_total,
  sc.normalized_customer_name,
  count(distinct cc.customer_id) as customer_match_count,
  (max(cc.customer_id::text) filter (where cc.customer_id is not null))::uuid as matched_customer_id,
  max(cc.customer_name) filter (where cc.customer_name is not null) as matched_customer_name,
  max(cc.default_credit_days) filter (where cc.default_credit_days is not null) as matched_default_credit_days,
  (max(en.note_id::text))::uuid as note_id,
  (max(en.customer_id::text))::uuid as note_customer_id,
  max(en.inventory_transaction_id) as note_inventory_transaction_id,
  max(en.sale_reference) as note_sale_reference,
  max(en.folio) as note_folio,
  case
    when count(distinct cc.customer_id) = 0 then 'SIN_CLIENTE_MATCH'
    when count(distinct cc.customer_id) > 1 then 'CLIENTE_AMBIGUO'
    when max(en.note_id::text) is null then 'NOTA_FALTANTE'
    when (max(en.customer_id::text))::uuid is distinct from (max(cc.customer_id::text) filter (where cc.customer_id is not null))::uuid then 'NOTA_LIGADA_A_CLIENTE_EQUIVOCADO'
    else 'OK'
  end as status
from sale_candidates sc
left join customer_candidates cc
  on cc.normalized_customer_name = sc.normalized_customer_name
left join existing_notes en
  on en.inventory_transaction_id = sc.sale_id
     or en.sale_reference = sc.sale_id::text
     or en.folio = sc.sale_id::text
group by
  sc.sale_id,
  sc.branch_id,
  sc.business_unit,
  sc.created_at,
  sc.issue_date,
  sc.nombre_cliente,
  sc.direccion_cliente,
  sc.payment_type,
  sc.note_total,
  sc.normalized_customer_name
;

select *
from tmp_credit_sales_diagnosis
order by created_at, sale_id;

-- ============================================================================
-- RESUMEN DE ESTADO
-- ============================================================================
select
  status,
  count(*) as total
from tmp_credit_sales_diagnosis
group by status
order by status;

-- ============================================================================
-- INSERTAR NOTAS QUE FALTAN
-- ============================================================================
with sale_candidates as (
  select
    tx.id as sale_id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at::date as issue_date,
    tx.nombre_cliente,
    tx.direccion_cliente,
    upper(trim(coalesce(tx.payment_type, ''))) as payment_type,
    coalesce(
      nullif(abs(tx.credit_amount), 0),
      round(coalesce(sum(iti.line_total), 0)::numeric, 2)
    ) as note_total,
    regexp_replace(
      translate(lower(trim(coalesce(tx.nombre_cliente, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.inventory_transactions tx
  left join public.inventory_transaction_items iti
    on iti.transaction_id = tx.id
  where tx.type = 'SALE'
    and tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.created_at >= timestamp '2026-05-11 00:00:00'
    and tx.created_at <= now()
    and upper(trim(coalesce(tx.payment_type, ''))) = 'CREDITO'
  group by
    tx.id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.nombre_cliente,
    tx.direccion_cliente,
    tx.payment_type,
    tx.credit_amount
),
customer_candidates as (
  select
    c.id as customer_id,
    c.name as customer_name,
    coalesce(c.default_credit_days, 30) as default_credit_days,
    regexp_replace(
      translate(lower(trim(coalesce(c.name, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.credit_customers c
  where c.branch_id = 1
    and c.business_unit = 'materiales'
),
existing_notes as (
  select
    cn.id as note_id,
    cn.customer_id,
    cn.inventory_transaction_id,
    cn.sale_reference,
    cn.folio
  from public.credit_notes cn
  where cn.branch_id = 1
    and cn.business_unit = 'materiales'
),
sale_resolution as (
  select
    sc.*,
    count(distinct cc.customer_id) as customer_match_count,
    (max(cc.customer_id::text) filter (where cc.customer_id is not null))::uuid as matched_customer_id,
    max(cc.default_credit_days) filter (where cc.default_credit_days is not null) as matched_default_credit_days,
    (max(en.note_id::text))::uuid as note_id
  from sale_candidates sc
  left join customer_candidates cc
    on cc.normalized_customer_name = sc.normalized_customer_name
  left join existing_notes en
    on en.inventory_transaction_id = sc.sale_id
       or en.sale_reference = sc.sale_id::text
       or en.folio = sc.sale_id::text
  group by
    sc.sale_id,
    sc.branch_id,
    sc.business_unit,
    sc.issue_date,
    sc.nombre_cliente,
    sc.direccion_cliente,
    sc.payment_type,
    sc.note_total,
    sc.normalized_customer_name
),
inserted_notes as (
  insert into public.credit_notes (
    branch_id,
    business_unit,
    customer_id,
    folio,
    sale_reference,
    issue_date,
    credit_days_applied,
    due_date,
    total,
    paid_amount,
    balance,
    notes,
    inventory_transaction_id,
    created_at,
    updated_at
  )
  select
    sr.branch_id,
    sr.business_unit,
    sr.matched_customer_id,
    concat(
      'REP-',
      sr.sale_id::text,
      '-',
      substr(md5(sr.sale_id::text || '|' || coalesce(sr.nombre_cliente, '') || '|' || sr.issue_date::text), 1, 8)
    ),
    sr.sale_id::text,
    sr.issue_date,
    coalesce(sr.matched_default_credit_days, 30),
    sr.issue_date + coalesce(sr.matched_default_credit_days, 30),
    sr.note_total,
    0,
    sr.note_total,
    concat('Reparación automática | sale_id=', sr.sale_id, ' | cliente=', coalesce(sr.nombre_cliente, '')),
    sr.sale_id,
    now(),
    now()
from tmp_credit_sale_resolution sr
  where sr.customer_match_count = 1
    and sr.note_id is null
  returning id, customer_id, inventory_transaction_id, folio
)
select * from inserted_notes;

-- ============================================================================
-- CORREGIR NOTAS YA EXISTENTES PERO LIGADAS A CLIENTE EQUIVOCADO
-- ============================================================================
with sale_candidates as (
  select
    tx.id as sale_id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at::date as issue_date,
    tx.nombre_cliente,
    tx.direccion_cliente,
    upper(trim(coalesce(tx.payment_type, ''))) as payment_type,
    coalesce(
      nullif(abs(tx.credit_amount), 0),
      round(coalesce(sum(iti.line_total), 0)::numeric, 2)
    ) as note_total,
    regexp_replace(
      translate(lower(trim(coalesce(tx.nombre_cliente, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.inventory_transactions tx
  left join public.inventory_transaction_items iti
    on iti.transaction_id = tx.id
  where tx.type = 'SALE'
    and tx.branch_id = 1
    and tx.business_unit = 'materiales'
    and tx.created_at >= timestamp '2026-05-11 00:00:00'
    and tx.created_at <= now()
    and upper(trim(coalesce(tx.payment_type, ''))) = 'CREDITO'
  group by
    tx.id,
    tx.branch_id,
    tx.business_unit,
    tx.created_at,
    tx.nombre_cliente,
    tx.direccion_cliente,
    tx.payment_type,
    tx.credit_amount
),
customer_candidates as (
  select
    c.id as customer_id,
    c.name as customer_name,
    coalesce(c.default_credit_days, 30) as default_credit_days,
    regexp_replace(
      translate(lower(trim(coalesce(c.name, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_customer_name
  from public.credit_customers c
  where c.branch_id = 1
    and c.business_unit = 'materiales'
),
existing_notes as (
  select
    cn.id as note_id,
    cn.customer_id,
    cn.inventory_transaction_id,
    cn.sale_reference,
    cn.folio
  from public.credit_notes cn
  where cn.branch_id = 1
    and cn.business_unit = 'materiales'
),
sale_resolution as (
  select
    sc.sale_id,
    sc.branch_id,
    sc.business_unit,
    sc.issue_date,
    sc.nombre_cliente,
    sc.direccion_cliente,
    sc.note_total,
    count(distinct cc.customer_id) as customer_match_count,
    (max(cc.customer_id::text) filter (where cc.customer_id is not null))::uuid as matched_customer_id,
    max(cc.default_credit_days) filter (where cc.default_credit_days is not null) as matched_default_credit_days,
    (max(en.note_id::text))::uuid as note_id,
    (max(en.customer_id::text))::uuid as note_customer_id,
    max(en.inventory_transaction_id) as note_inventory_transaction_id,
    max(en.sale_reference) as note_sale_reference,
    max(en.folio) as note_folio
  from sale_candidates sc
  left join customer_candidates cc
    on cc.normalized_customer_name = sc.normalized_customer_name
  left join existing_notes en
    on en.inventory_transaction_id = sc.sale_id
       or en.sale_reference = sc.sale_id::text
       or en.folio = sc.sale_id::text
  group by
    sc.sale_id,
    sc.branch_id,
    sc.business_unit,
    sc.issue_date,
    sc.nombre_cliente,
    sc.direccion_cliente,
    sc.note_total
)
update public.credit_notes cn
set
  customer_id = sr.matched_customer_id,
  branch_id = sr.branch_id,
  business_unit = sr.business_unit,
  inventory_transaction_id = coalesce(cn.inventory_transaction_id, sr.sale_id),
  sale_reference = coalesce(nullif(trim(cn.sale_reference), ''), sr.sale_id::text),
  folio = coalesce(
    nullif(trim(cn.folio), ''),
    concat(
      'REP-',
      sr.sale_id::text,
      '-',
      substr(md5(sr.sale_id::text || '|' || coalesce(sr.nombre_cliente, '') || '|' || sr.issue_date::text), 1, 8)
    )
  ),
  updated_at = now()
from tmp_credit_sale_resolution sr
where cn.id = sr.note_id
  and sr.customer_match_count = 1
  and sr.note_customer_id is distinct from sr.matched_customer_id;

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
select
  sr.sale_id,
  sr.created_at,
  sr.nombre_cliente,
  sr.note_total,
  sr.customer_match_count,
  sr.matched_customer_id,
  sr.note_id,
  case
    when sr.customer_match_count = 0 then 'SIN_CLIENTE_MATCH'
    when sr.customer_match_count > 1 then 'CLIENTE_AMBIGUO'
    when sr.note_id is null then 'NOTA_FALTANTE'
    when sr.note_customer_id is distinct from sr.matched_customer_id then 'NOTA_LIGADA_A_CLIENTE_EQUIVOCADO'
    else 'OK'
  end as status
from tmp_credit_sale_resolution sr
order by sr.created_at, sr.sale_id;

commit;
