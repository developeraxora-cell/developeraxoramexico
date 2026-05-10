-- ============================================================================
-- MIGRACIÓN: Transportería como módulo dentro de Degollado
--
-- Nuevo modelo:
--   - No existe sucursal independiente para Transportería.
--   - Degollado es la única sucursal. Transportería es un módulo dentro de ella.
--   - Se agrega columna `business_unit` a las tablas clave para separar datos.
--   - Los datos actuales de la sucursal TRANS-01 se mueven a Degollado
--     con business_unit = 'transporteria'.
--
-- INSTRUCCIONES:
--   1. Ejecutar el PASO 0 primero (solo SELECT) para verificar los IDs.
--   2. Confirmar que los branch_id encontrados son correctos.
--   3. Ejecutar el resto del script.
-- ============================================================================


-- ============================================================================
-- PASO 0 — VERIFICAR IDs DE LAS SUCURSALES (solo lectura, correr primero)
-- ============================================================================
-- Corre esto y anota los valores de id para:
--   • La sucursal de Degollado  (será el destino)
--   • La sucursal de Transportería / TRANS-01  (será eliminada)
SELECT id, code, name, business_unit, is_active
FROM public.branches
ORDER BY name;


-- ============================================================================
-- PASO 1 — AGREGAR COLUMNA business_unit A LAS TABLAS CLAVE
-- ============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

ALTER TABLE public.credit_customers
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

ALTER TABLE public.customer_wallets
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';


-- Constraint en products (opcional pero recomendado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products'
      AND constraint_name = 'products_business_unit_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_business_unit_check
      CHECK (business_unit IN ('materiales', 'concretera', 'transporteria'));
  END IF;
END $$;

-- Constraint en credit_customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'credit_customers'
      AND constraint_name = 'credit_customers_business_unit_check'
  ) THEN
    ALTER TABLE public.credit_customers
      ADD CONSTRAINT credit_customers_business_unit_check
      CHECK (business_unit IN ('materiales', 'concretera', 'transporteria'));
  END IF;
END $$;


-- ============================================================================
-- PASO 2 — MIGRAR DATOS DE TRANS-01 → DEGOLLADO
--
-- Reemplaza los valores de las variables según el PASO 0:
--   v_trans_id   = id de la sucursal TRANS-01 / Transportería
--   v_deg_id     = id de la sucursal Degollado
--
-- IMPORTANTE: branch_id en estas tablas es el id numérico (integer),
-- NO el code string ('TRANS-01'). Usa los valores del SELECT del PASO 0.
-- ============================================================================

DO $$
DECLARE
  v_trans_id BIGINT := 6; -- Transportería (TRANS-01)
  v_deg_id   BIGINT := 1; -- Degollado
BEGIN

  -- ── Productos ────────────────────────────────────────────────────────────
  UPDATE public.products
  SET branch_id    = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'products migrados: %', (
    SELECT count(*) FROM public.products
    WHERE branch_id = v_deg_id AND business_unit = 'transporteria'
  );

  -- ── Stock de inventario ───────────────────────────────────────────────────
  -- Si ya existe una fila para (v_deg_id, product_id), sumar el qty;
  -- si no, mover la fila directamente.
  INSERT INTO public.inventory_stock (branch_id, product_id, qty_base, updated_at)
  SELECT v_deg_id, product_id, qty_base, now()
  FROM public.inventory_stock
  WHERE branch_id = v_trans_id
  ON CONFLICT (branch_id, product_id)
  DO UPDATE SET
    qty_base   = inventory_stock.qty_base + EXCLUDED.qty_base,
    updated_at = now();

  DELETE FROM public.inventory_stock WHERE branch_id = v_trans_id;

  RAISE NOTICE 'inventory_stock migrado';

  -- ── Clientes de crédito ───────────────────────────────────────────────────
  UPDATE public.credit_customers
  SET branch_id     = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'credit_customers migrados: %', (
    SELECT count(*) FROM public.credit_customers
    WHERE branch_id = v_deg_id AND business_unit = 'transporteria'
  );

  -- ── Transacciones de venta ────────────────────────────────────────────────
  UPDATE public.inventory_transactions
  SET branch_id     = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'inventory_transactions migradas: %', (
    SELECT count(*) FROM public.inventory_transactions
    WHERE branch_id = v_deg_id AND business_unit = 'transporteria'
  );

  -- ── Notas de crédito ──────────────────────────────────────────────────────
  UPDATE public.credit_notes
  SET branch_id     = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'credit_notes migradas';

  -- ── Carteras (saldo a favor) ──────────────────────────────────────────────
  UPDATE public.customer_wallets
  SET branch_id     = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'customer_wallets migradas';

  -- ── Proveedores ───────────────────────────────────────────────────────────
  UPDATE public.suppliers
  SET branch_id     = v_deg_id,
      business_unit = 'transporteria'
  WHERE branch_id = v_trans_id;

  RAISE NOTICE 'suppliers migrados';

END $$;


-- ============================================================================
-- PASO 3 — ETIQUETAR DATOS EXISTENTES DE MATERIALES
-- (por si quedaron filas con business_unit NULL tras el DEFAULT)
-- ============================================================================

UPDATE public.products
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';

UPDATE public.credit_customers
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';

UPDATE public.inventory_transactions
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';

UPDATE public.credit_notes
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';

UPDATE public.customer_wallets
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';

UPDATE public.suppliers
SET business_unit = 'materiales'
WHERE business_unit IS NULL OR business_unit = '';


-- ============================================================================
-- PASO 4 — DESACTIVAR SUCURSAL TRANS-01
-- (no eliminar: conservar integridad referencial por si hay FKs)
-- ============================================================================

UPDATE public.branches
SET is_active = FALSE
WHERE code LIKE 'TRANS%';


-- ============================================================================
-- PASO 5 — CONFIGURAR TRANSPORT_USER
-- Asignar allowed_branch_ids = Degollado y business_units = transporteria.
-- Ajusta el WHERE según tu tabla y columnas reales de usuarios.
-- ============================================================================

-- UPDATE public.app_users
-- SET allowed_branch_ids = ARRAY['<<CODE_DEGOLLADO>>'],  -- ej. 'DEG-01'
--     business_units     = ARRAY['transporteria', 'logistica']
-- WHERE role = 'TRANSPORT_USER';


-- ============================================================================
-- PASO 6 — ÍNDICES para rendimiento con el nuevo filtro business_unit
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_branch_bu
  ON public.products (branch_id, business_unit, is_active);

CREATE INDEX IF NOT EXISTS idx_credit_customers_branch_bu
  ON public.credit_customers (branch_id, business_unit, is_active);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_branch_bu
  ON public.inventory_transactions (branch_id, business_unit, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_notes_branch_bu
  ON public.credit_notes (branch_id, business_unit);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_branch_bu
  ON public.customer_wallets (branch_id, business_unit);

CREATE INDEX IF NOT EXISTS idx_suppliers_branch_bu
  ON public.suppliers (branch_id, business_unit, is_active);


-- ============================================================================
-- PASO 7 — VERIFICACIÓN FINAL (correr después de la migración)
-- ============================================================================

SELECT
  business_unit,
  count(*) AS productos
FROM public.products
WHERE is_active = TRUE
GROUP BY business_unit
ORDER BY business_unit;

SELECT
  business_unit,
  count(*) AS clientes
FROM public.credit_customers
GROUP BY business_unit
ORDER BY business_unit;

SELECT
  business_unit,
  count(*) AS ventas
FROM public.inventory_transactions
GROUP BY business_unit
ORDER BY business_unit;


-- ============================================================================
-- RESUMEN
-- ============================================================================
-- ✅ business_unit agregado a: products, credit_customers,
--    inventory_transactions, credit_notes, customer_wallets
-- ✅ Datos TRANS-01 migrados a Degollado con business_unit = 'transporteria'
-- ✅ inventory_stock migrado (branch_id actualizado)
-- ✅ Sucursal TRANS-01 desactivada
-- ✅ Índices creados para filtros por branch_id + business_unit
-- ⚠️  PASO 5 (app_users): descomentar y ajustar según tu schema de usuarios
-- ============================================================================
