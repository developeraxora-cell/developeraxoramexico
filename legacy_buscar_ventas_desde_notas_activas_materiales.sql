-- Busca en la base legacy solo las ventas que siguen activas en Supabase.
-- Uso: ejecutar en MySQL / MariaDB sobre la base legacy `estribad_pventa`.
--
-- PASO PREVIO:
-- 1) Ejecuta `supabase_notas_activas_para_migracion_materiales.sql` en Supabase.
-- 2) Copia la lista de `legacy_sale_id`.
-- 3) Pega esos IDs en la tabla temporal `tmp_sales_to_migrate`.

USE estribad_pventa;

DROP TEMPORARY TABLE IF EXISTS tmp_sales_to_migrate;
CREATE TEMPORARY TABLE tmp_sales_to_migrate (
  legacy_sale_id INT PRIMARY KEY
);

-- ============================================================
-- PEGA AQUI LOS IDS LEGACY DE SUPABASE
-- ============================================================
-- Ejemplo:
-- INSERT INTO tmp_sales_to_migrate (legacy_sale_id) VALUES
-- (19000),
-- (19022),
-- (19173);

INSERT INTO tmp_sales_to_migrate (legacy_sale_id) VALUES
(0);

-- Quita el registro dummy si ya pegaste valores reales.
DELETE FROM tmp_sales_to_migrate WHERE legacy_sale_id = 0;

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
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = v.idventa
JOIN clientes c
  ON c.idcliente = v.cliente
ORDER BY customer_name;

-- ============================================================
-- 2) ENCABEZADO DE LAS VENTAS
-- ============================================================
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
  v.credito,
  v.liquidado,
  v.creditoabonado AS paid_amount_legacy_field,
  v.direccion,
  v.usuario,
  v.vendedor,
  v.status AS legacy_status,
  c.nombre AS customer_name
FROM ventas v
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = v.idventa
JOIN clientes c
  ON c.idcliente = v.cliente
ORDER BY v.fecha, v.idventa;

-- ============================================================
-- 3) DETALLE DE VENTA
-- ============================================================
-- Esta es la consulta clave para mostrar el detalle real de la venta.
-- Se apoya en nombres de producto y presentaciones legacy.

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
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = lv.idventa
JOIN presentaciones pr
  ON pr.idpresentacion = lv.presentacion
JOIN productos p
  ON p.idproducto = pr.idproducto
WHERE lv.status = 0
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
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = a.idventa
ORDER BY a.idventa, a.fecha, a.idabono;

-- ============================================================
-- 5) PRODUCTOS NECESARIOS PARA LA EQUIVALENCIA CON SUPABASE
-- ============================================================
-- Si IDs no coinciden, esta salida se usa para mapear por nombre.

SELECT DISTINCT
  p.idproducto AS legacy_product_id,
  TRIM(p.producto) AS product_name,
  UPPER(TRIM(p.producto)) AS product_name_normalized,
  NULLIF(TRIM(p.codigo_barras), '') AS legacy_barcode,
  p.stock AS legacy_current_stock,
  p.minimo AS legacy_min_stock,
  p.status AS legacy_status
FROM listaventas lv
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = lv.idventa
JOIN presentaciones pr
  ON pr.idpresentacion = lv.presentacion
JOIN productos p
  ON p.idproducto = pr.idproducto
ORDER BY product_name_normalized;

-- ============================================================
-- 6) DUPLICADOS POR NOMBRE SOLO DE LOS PRODUCTOS INVOLUCRADOS
-- ============================================================
-- Si devuelve filas, el mapeo por nombre no es 100% seguro.
-- En ese caso hay que crear una equivalencia manual:
-- legacy_product_id -> product_id nuevo en Supabase.

SELECT
  x.product_name_normalized,
  COUNT(*) AS duplicated_rows,
  GROUP_CONCAT(x.legacy_product_id ORDER BY x.legacy_product_id SEPARATOR ', ') AS legacy_product_ids
FROM (
  SELECT DISTINCT
    p.idproducto AS legacy_product_id,
    UPPER(TRIM(p.producto)) AS product_name_normalized
  FROM listaventas lv
  JOIN tmp_sales_to_migrate t
    ON t.legacy_sale_id = lv.idventa
  JOIN presentaciones pr
    ON pr.idpresentacion = lv.presentacion
  JOIN productos p
    ON p.idproducto = pr.idproducto
) x
GROUP BY x.product_name_normalized
HAVING COUNT(*) > 1
ORDER BY duplicated_rows DESC, x.product_name_normalized;

-- ============================================================
-- 7) VALIDACION DE CUADRE POR VENTA
-- ============================================================
-- Si una venta no cuadra contra su detalle, no deberia importarse
-- como venta historica hasta revisarla.

SELECT
  v.idventa AS legacy_sale_id,
  v.total AS sale_total,
  ROUND(COALESCE(SUM(lv.subtotal), 0), 2) AS detail_total,
  ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) AS difference
FROM ventas v
JOIN tmp_sales_to_migrate t
  ON t.legacy_sale_id = v.idventa
JOIN listaventas lv
  ON lv.idventa = v.idventa
GROUP BY v.idventa, v.total
HAVING ROUND(v.total - COALESCE(SUM(lv.subtotal), 0), 2) <> 0
ORDER BY ABS(difference) DESC, legacy_sale_id;
