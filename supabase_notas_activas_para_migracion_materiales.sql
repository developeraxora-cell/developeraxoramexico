-- Extrae solo las notas activas que hoy siguen vivas en Supabase.
-- Uso: ejecutar en Supabase SQL Editor.
--
-- Ajusta branch_id si necesitas otra sucursal.
-- Para Degollado Lopar / Materiales normalmente es branch_id = 1.

-- ============================================================
-- 1) NOTAS ACTIVAS CON REFERENCIA LEGACY
-- ============================================================
-- Esto es la base de la migracion.
-- Solo saca notas que siguen abiertas en tu sistema actual.

SELECT
  cn.id AS credit_note_id,
  cn.branch_id,
  cc.id AS customer_id,
  cc.name AS customer_name,
  cc.phone,
  cc.address,
  cn.folio,
  CASE
    WHEN cn.folio ~ '^LEG-[0-9]+$' THEN replace(cn.folio, 'LEG-', '')::bigint
    ELSE NULL
  END AS legacy_sale_id,
  cn.issue_date,
  cn.due_date,
  cn.total,
  cn.paid_amount,
  cn.balance,
  cn.notes,
  cn.created_at,
  cn.updated_at
FROM public.credit_notes cn
JOIN public.credit_customers cc
  ON cc.id = cn.customer_id
WHERE cn.branch_id = 1
  AND cn.balance > 0
ORDER BY cc.name, cn.issue_date, cn.folio;

-- ============================================================
-- 2) SOLO IDS LEGACY
-- ============================================================
-- Este resultado lo vas a copiar y pegar dentro del script MySQL.

SELECT DISTINCT
  replace(cn.folio, 'LEG-', '')::bigint AS legacy_sale_id
FROM public.credit_notes cn
WHERE cn.branch_id = 1
  AND cn.balance > 0
  AND cn.folio ~ '^LEG-[0-9]+$'
ORDER BY legacy_sale_id;

-- ============================================================
-- 3) NOTAS ACTIVAS SIN REFERENCIA LEGACY VALIDA
-- ============================================================
-- Si aqui salen filas, esas notas no se pueden rastrear automaticamente
-- en la base legacy usando el folio.

SELECT
  cn.id AS credit_note_id,
  cn.folio,
  cn.issue_date,
  cn.total,
  cn.balance,
  cc.name AS customer_name
FROM public.credit_notes cn
JOIN public.credit_customers cc
  ON cc.id = cn.customer_id
WHERE cn.branch_id = 1
  AND cn.balance > 0
  AND NOT (cn.folio ~ '^LEG-[0-9]+$')
ORDER BY cc.name, cn.issue_date, cn.folio;
