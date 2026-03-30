-- Extraccion para migracion completa de clientes con deuda, ventas a credito,
-- detalle de venta y abonos desde la base legacy MySQL/MariaDB `estribad_pventa`.
--
-- Uso recomendado:
-- 1) Ejecutar cada SELECT por separado en la base legacy.
-- 2) Exportar cada resultado a CSV.
-- 3) Usar esos CSV como fuente para la migracion a Supabase.
--
-- Archivos sugeridos a exportar:
-- - clientes_con_deuda.csv
-- - ventas_con_deuda.csv
-- - detalle_ventas_con_deuda.csv
-- - abonos_ventas_con_deuda.csv
-- - productos_para_equivalencia.csv
-- - productos_duplicados_por_nombre.csv

USE estribad_pventa;

-- ============================================================
-- 1. CLIENTES CON DEUDA
-- ============================================================
-- Este archivo sirve para levantar:
-- - credit_customers
-- y para relacionar las ventas legacy con el cliente correcto.

WITH abonos_por_venta AS (
  SELECT
    a.idventa,
    SUM(a.monto) AS total_abonado
  FROM abonos a
  GROUP BY a.idventa
),
ventas_credito AS (
  SELECT
    v.idventa,
    v.cliente AS legacy_customer_id,
    v.total,
    v.fecha,
    v.fecha_limite,
    v.direccion,
    v.usuario,
    v.vendedor,
    v.credito,
    v.creditoabonado,
    COALESCE(apv.total_abonado, 0) AS abonos_sumados,
    GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) AS saldo_pendiente
  FROM ventas v
  LEFT JOIN abonos_por_venta apv
    ON apv.idventa = v.idventa
  WHERE v.credito = 1
)
SELECT
  c.idcliente AS legacy_customer_id,
  TRIM(c.nombre) AS customer_name,
  NULLIF(TRIM(c.telefono), '') AS phone,
  NULLIF(TRIM(c.direccion), '') AS address,
  c.credito AS credit_limit,
  CASE
    WHEN c.diascredito IN (15, 30) THEN c.diascredito
    WHEN c.diascredito <= 15 THEN 15
    ELSE 30
  END AS default_credit_days,
  CASE WHEN c.status = 1 THEN 1 ELSE 0 END AS is_active,
  COALESCE(SUM(vc.saldo_pendiente), 0) AS current_debt,
  COUNT(CASE WHEN vc.saldo_pendiente > 0 THEN 1 END) AS open_notes
FROM clientes c
JOIN ventas_credito vc
  ON vc.legacy_customer_id = c.idcliente
WHERE vc.saldo_pendiente > 0
GROUP BY
  c.idcliente,
  c.nombre,
  c.telefono,
  c.direccion,
  c.credito,
  c.diascredito,
  c.status
ORDER BY TRIM(c.nombre);

-- ============================================================
-- 2. VENTAS CON DEUDA
-- ============================================================
-- Este archivo sirve para levantar:
-- - credit_notes
-- y para relacionar cada venta legacy con sus items y sus abonos.

WITH abonos_por_venta AS (
  SELECT
    a.idventa,
    SUM(a.monto) AS total_abonado
  FROM abonos a
  GROUP BY a.idventa
)
SELECT
  v.idventa AS legacy_sale_id,
  v.cliente AS legacy_customer_id,
  CONCAT('LEG-', v.idventa) AS legacy_folio,
  DATE(v.fecha) AS issue_date,
  CASE
    WHEN v.fecha_limite IS NOT NULL AND v.fecha_limite <> '0000-00-00'
      THEN v.fecha_limite
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
  COALESCE(apv.total_abonado, 0) AS paid_amount_from_payments,
  v.creditoabonado AS paid_amount_legacy_field,
  GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) AS balance,
  v.direccion,
  v.usuario,
  v.vendedor,
  CASE WHEN v.liquidado = 1 THEN 'LIQUIDADO' ELSE 'CREDITO' END AS legacy_payment_state,
  CASE WHEN v.status = 1 THEN 'ACTIVA' ELSE 'LEGACY_STATUS_0' END AS legacy_status
FROM ventas v
JOIN clientes c
  ON c.idcliente = v.cliente
LEFT JOIN abonos_por_venta apv
  ON apv.idventa = v.idventa
WHERE v.credito = 1
  AND GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) > 0
ORDER BY v.fecha, v.idventa;

-- ============================================================
-- 3. DETALLE DE LAS VENTAS CON DEUDA
-- ============================================================
-- Este archivo es el critico para migrar el detalle real de la venta.
-- Se basa en:
-- ventas -> listaventas -> presentaciones -> productos
--
-- Importante:
-- como los ids legacy no coinciden con Supabase, la migracion debera mapear
-- cada item por nombre normalizado del producto.

WITH ventas_con_deuda AS (
  SELECT
    v.idventa
  FROM ventas v
  LEFT JOIN (
    SELECT idventa, SUM(monto) AS total_abonado
    FROM abonos
    GROUP BY idventa
  ) apv
    ON apv.idventa = v.idventa
  WHERE v.credito = 1
    AND GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) > 0
)
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
  lv.subtotal,
  p.stock AS legacy_current_stock,
  p.minimo AS legacy_min_stock
FROM listaventas lv
JOIN ventas_con_deuda vd
  ON vd.idventa = lv.idventa
JOIN presentaciones pr
  ON pr.idpresentacion = lv.presentacion
JOIN productos p
  ON p.idproducto = pr.idproducto
WHERE lv.status = 0
ORDER BY lv.idventa, lv.idlistaventas;

-- ============================================================
-- 4. ABONOS DE LAS VENTAS CON DEUDA
-- ============================================================
-- Este archivo sirve para levantar:
-- - credit_payments

WITH ventas_con_deuda AS (
  SELECT
    v.idventa
  FROM ventas v
  LEFT JOIN (
    SELECT idventa, SUM(monto) AS total_abonado
    FROM abonos
    GROUP BY idventa
  ) apv
    ON apv.idventa = v.idventa
  WHERE v.credito = 1
    AND GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) > 0
)
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
JOIN ventas_con_deuda vd
  ON vd.idventa = a.idventa
ORDER BY a.idventa, a.fecha, a.idabono;

-- ============================================================
-- 5. CATALOGO DE PRODUCTOS IMPLICADOS EN LAS VENTAS CON DEUDA
-- ============================================================
-- Este archivo sirve para construir la equivalencia con Supabase por nombre.

WITH ventas_con_deuda AS (
  SELECT
    v.idventa
  FROM ventas v
  LEFT JOIN (
    SELECT idventa, SUM(monto) AS total_abonado
    FROM abonos
    GROUP BY idventa
  ) apv
    ON apv.idventa = v.idventa
  WHERE v.credito = 1
    AND GREATEST(v.total - COALESCE(apv.total_abonado, 0), 0) > 0
)
SELECT DISTINCT
  p.idproducto AS legacy_product_id,
  TRIM(p.producto) AS product_name,
  UPPER(TRIM(p.producto)) AS product_name_normalized,
  NULLIF(TRIM(p.codigo_barras), '') AS legacy_barcode,
  p.medida AS legacy_base_measure_id,
  p.stock AS legacy_current_stock,
  p.minimo AS legacy_min_stock,
  p.status AS legacy_status
FROM listaventas lv
JOIN ventas_con_deuda vd
  ON vd.idventa = lv.idventa
JOIN presentaciones pr
  ON pr.idpresentacion = lv.presentacion
JOIN productos p
  ON p.idproducto = pr.idproducto
ORDER BY product_name_normalized;

-- ============================================================
-- 6. PRODUCTOS DUPLICADOS POR NOMBRE
-- ============================================================
-- Si este resultado devuelve filas, migrar "solo por nombre" no es seguro.
-- En ese caso hara falta una tabla manual de equivalencias:
-- legacy_product_id -> product_id nuevo en Supabase.

SELECT
  UPPER(TRIM(producto)) AS product_name_normalized,
  COUNT(*) AS duplicated_rows,
  GROUP_CONCAT(idproducto ORDER BY idproducto SEPARATOR ', ') AS legacy_product_ids
FROM productos
GROUP BY UPPER(TRIM(producto))
HAVING COUNT(*) > 1
ORDER BY duplicated_rows DESC, product_name_normalized;

-- ============================================================
-- 7. VALIDACION DE CUADRE ENTRE VENTA Y DETALLE
-- ============================================================
-- Esta salida permite detectar ventas cuyo total no coincide con la suma
-- de sus renglones. Si aparecen filas aqui, esas ventas requieren revision
-- antes de migrarlas como ventas reales del POS.

SELECT
  v.idventa AS legacy_sale_id,
  v.total AS sale_total,
  ROUND(COALESCE(SUM(lv.subtotal), 0), 2) AS detail_total,
  ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) AS difference
FROM ventas v
JOIN listaventas lv
  ON lv.idventa = v.idventa
WHERE v.credito = 1
GROUP BY v.idventa, v.total
HAVING ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) <> 0
ORDER BY ABS(difference) DESC, legacy_sale_id;
