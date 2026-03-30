-- Consultas legacy solo para notas abiertas 2025-2026 sin venta vinculada
-- Base: estribad_pventa
-- Scope: Materiales / branch_id = 1
-- IDs normalizados desde Supabase

USE estribad_pventa;

-- ============================================================
-- IDS OBJETIVO
-- ============================================================
-- 34840, 36029, 35905, 35807, 35630, 35525, 35529, 35516, 35449,
-- 35398, 35325, 35309, 35184, 35016, 34855, 34661, 33849, 28959

-- ============================================================
-- 1) CLIENTES DE ESAS VENTAS
-- ============================================================
SELECT DISTINCT
  c.idcliente AS legacy_customer_id,
  TRIM(c.nombre) AS customer_name,
  NULLIF(TRIM(c.telefono), '') AS phone,
  NULLIF(TRIM(c.direccion), '') AS address,
  c.credito AS credit_limit,
  c.creditousado AS legacy_credit_used,
  CASE
    WHEN c.diascredito IN (15, 30) THEN c.diascredito
    WHEN c.diascredito <= 15 THEN 15
    ELSE 30
  END AS default_credit_days,
  c.status AS legacy_status
FROM ventas v
JOIN clientes c ON c.idcliente = v.cliente
WHERE v.idventa IN (
  28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
  35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
)
ORDER BY customer_name;

-- ============================================================
-- 2) ENCABEZADO DE LAS VENTAS
-- ============================================================
SELECT
  v.idventa AS legacy_sale_id,
  v.cliente AS legacy_customer_id,
  CAST(v.idventa AS CHAR) AS legacy_folio_raw,
  CONCAT('LEG-', v.idventa) AS legacy_folio_prefixed,
  DATE(v.fecha) AS issue_date,
  CASE
    WHEN v.fecha_limite IS NOT NULL AND v.fecha_limite <> '0000-00-00' THEN v.fecha_limite
    ELSE DATE_ADD(DATE(v.fecha), INTERVAL CASE
      WHEN c.diascredito IN (15, 30) THEN c.diascredito
      WHEN c.diascredito <= 15 THEN 15
      ELSE 30
    END DAY)
  END AS due_date,
  CASE
    WHEN c.diascredito IN (15, 30) THEN c.diascredito
    WHEN c.diascredito <= 15 THEN 15
    ELSE 30
  END AS credit_days_applied,
  v.total,
  v.credito,
  v.liquidado,
  v.creditoabonado AS paid_amount_legacy_field,
  v.direccion,
  v.usuario,
  v.vendedor,
  v.status AS legacy_status,
  c.nombre AS customer_name
FROM ventas v
JOIN clientes c ON c.idcliente = v.cliente
WHERE v.idventa IN (
  28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
  35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
)
ORDER BY v.fecha, v.idventa;

-- ============================================================
-- 3) DETALLE DE VENTA
-- ============================================================
SELECT
  lv.idventa AS legacy_sale_id,
  lv.idlistaventas AS legacy_sale_item_id,
  p.idproducto AS legacy_product_id,
  pr.idpresentacion AS legacy_presentation_id,
  TRIM(p.producto) AS product_name,
  UPPER(TRIM(p.producto)) AS product_name_normalized,
  NULLIF(TRIM(p.codigo_barras), '') AS legacy_barcode,
  TRIM(pr.presentacion) AS presentation_name,
  UPPER(TRIM(pr.presentacion)) AS presentation_name_normalized,
  lv.tipoventa,
  lv.cantidad,
  pr.factor_a_base,
  (lv.cantidad * COALESCE(NULLIF(pr.factor_a_base, 0), 1)) AS qty_base_calculated,
  pr.mayoreo AS catalog_wholesale_price,
  pr.menudeo AS catalog_retail_price,
  lv.pespecial,
  lv.unitarioespecial,
  CASE
    WHEN lv.pespecial = 1 AND lv.unitarioespecial > 0 THEN lv.unitarioespecial
    WHEN UPPER(TRIM(lv.tipoventa)) = 'MAYOREO' THEN pr.mayoreo
    WHEN UPPER(TRIM(lv.tipoventa)) = 'MENUDEO' THEN pr.menudeo
    ELSE ROUND(lv.subtotal / NULLIF(lv.cantidad, 0), 2)
  END AS unit_price_used,
  lv.subtotal
FROM listaventas lv
JOIN presentaciones pr ON pr.idpresentacion = lv.presentacion
JOIN productos p ON p.idproducto = pr.idproducto
WHERE lv.status = 0
  AND lv.idventa IN (
    28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
    35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
  )
ORDER BY lv.idventa, lv.idlistaventas;

-- ============================================================
-- 4) ABONOS DE ESAS VENTAS
-- ============================================================
SELECT
  a.idabono AS legacy_payment_id,
  a.idventa AS legacy_sale_id,
  a.fecha AS paid_at,
  a.monto AS amount,
  CASE a.forma_pago
    WHEN 'e' THEN 'EFECTIVO'
    WHEN 't' THEN 'TARJETA'
    ELSE 'OTRO'
  END AS payment_method,
  a.forma_pago AS legacy_payment_method_raw
FROM abonos a
WHERE a.idventa IN (
  28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
  35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
)
ORDER BY a.idventa, a.fecha, a.idabono;

-- ============================================================
-- 5) PRODUCTOS NECESARIOS PARA EQUIVALENCIA CON SUPABASE
-- ============================================================
SELECT DISTINCT
  p.idproducto AS legacy_product_id,
  TRIM(p.producto) AS product_name,
  UPPER(TRIM(p.producto)) AS product_name_normalized,
  NULLIF(TRIM(p.codigo_barras), '') AS legacy_barcode,
  p.status AS legacy_status,
  pr.idpresentacion AS legacy_presentation_id,
  TRIM(pr.presentacion) AS presentation_name,
  UPPER(TRIM(pr.presentacion)) AS presentation_name_normalized,
  pr.factor_a_base,
  pr.mayoreo,
  pr.menudeo
FROM listaventas lv
JOIN presentaciones pr ON pr.idpresentacion = lv.presentacion
JOIN productos p ON p.idproducto = pr.idproducto
WHERE lv.status = 0
  AND lv.idventa IN (
    28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
    35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
  )
ORDER BY product_name_normalized, legacy_product_id, legacy_presentation_id;

-- ============================================================
-- 6) VENTAS CON DESCUADRE ENTRE ENCABEZADO Y DETALLE
-- ============================================================
SELECT *
FROM (
  SELECT
    v.idventa AS legacy_sale_id,
    v.total AS sale_total,
    ROUND(COALESCE(SUM(lv.subtotal), 0), 2) AS detail_total,
    ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) AS difference
  FROM ventas v
  LEFT JOIN listaventas lv
    ON lv.idventa = v.idventa
   AND lv.status = 0
  WHERE v.idventa IN (
    28959, 33849, 34661, 34840, 34855, 35016, 35184, 35309, 35325,
    35398, 35449, 35516, 35525, 35529, 35630, 35807, 35905, 36029
  )
  GROUP BY v.idventa, v.total
  HAVING ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) <> 0
) q
ORDER BY ABS(q.difference) DESC, q.legacy_sale_id;
