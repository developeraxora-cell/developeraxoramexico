-- ============================================================================
-- TRANSPORTERÍA — Schema de base de datos para Supabase
-- Ejecutar en el SQL Editor de Supabase en este orden.
-- Las tablas de inventario (products, inventory_transactions, etc.) ya existen
-- y se comparten vía branch_id. Solo se agregan lo que falta.
-- ============================================================================


-- ============================================================================
-- 1. AGREGAR CAMPO business_unit A LA TABLA branches
--    Permite identificar qué unidad de negocio usa cada sucursal.
-- ============================================================================

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'materiales';

-- Agregar constraint para valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'branches' AND constraint_name = 'branches_business_unit_check'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_business_unit_check
      CHECK (business_unit IN ('materiales', 'concretera', 'logistica', 'transporteria', 'global'));
  END IF;
END $$;

-- Actualizar sucursales existentes según su prefijo de código (ajustar si aplica)
UPDATE public.branches SET business_unit = 'concretera'   WHERE code LIKE 'CON%';
UPDATE public.branches SET business_unit = 'logistica'    WHERE code LIKE 'LOG%';
UPDATE public.branches SET business_unit = 'transporteria' WHERE code LIKE 'TRANS%';
-- El resto quedan como 'materiales' por el DEFAULT


-- ============================================================================
-- 2. SUCURSALES DE TRANSPORTERÍA
--    Insertar las sucursales que usará el módulo de Transportería.
--    Ajusta el código, nombre y dirección según tu negocio.
-- ============================================================================

-- Solo UNA sucursal para Transportería (no habrá más)
INSERT INTO public.branches (code, name, address, is_active, business_unit)
VALUES
  ('TRANS-01', 'Transportería', 'Dirección de Transportería', TRUE, 'transporteria')
ON CONFLICT (code) DO UPDATE
  SET business_unit = 'transporteria',
      is_active = TRUE;


-- ============================================================================
-- 3. ROL TRANSPORT_USER en la tabla app_users
--    Adaptar a tu schema real de usuarios. Ejemplo genérico:
-- ============================================================================

-- Si el rol se guarda como texto en app_users:
-- INSERT INTO public.app_users (username, full_name, role_key, business_units, permissions, is_active)
-- VALUES
--   ('transport_admin', 'Jefe Transportería', 'TRANSPORT_USER',
--    ARRAY['transporteria'],
--    ARRAY[
--      'transporteria.sales.view',
--      'transporteria.sales.create',
--      'transporteria.purchases.view',
--      'transporteria.purchases.create',
--      'transporteria.products.view',
--      'transporteria.customers.view',
--      'transporteria.reports.view'
--    ],
--    TRUE);

-- Si usa enum, primero agregar el valor:
-- ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'TRANSPORT_USER';

-- ============================================================================
-- 4. PERMISOS DISPONIBLES PARA TRANSPORT_USER
--    Referencia completa de todos los permisos del módulo de Transportería.
--    Asignar según las responsabilidades del usuario.
-- ============================================================================

-- VENTAS (Caja / POS)
--   transporteria.sales.view      → Ver historial de ventas
--   transporteria.sales.create    → Registrar nueva venta
--   transporteria.sales.delete    → Eliminar/anular venta

-- COMPRAS (Entradas de inventario)
--   transporteria.purchases.view    → Ver historial de compras
--   transporteria.purchases.create  → Registrar nueva entrada
--   transporteria.purchases.delete  → Anular entrada

-- INVENTARIO (Catálogo de productos)
--   transporteria.products.view    → Ver inventario y stock
--   transporteria.products.create  → Dar de alta productos (próximamente)
--   transporteria.products.edit    → Editar productos (próximamente)
--   transporteria.products.delete  → Eliminar productos (próximamente)

-- CLIENTES / CRÉDITO
--   transporteria.customers.view   → Ver clientes y saldo
--   transporteria.customers.create → Crear cliente
--   transporteria.customers.edit   → Editar cliente
--   transporteria.customers.delete → Eliminar cliente

-- ALERTAS DE CLIENTES
--   transporteria.alerts.view      → Ver alertas de crédito

-- AUDITORÍAS
--   transporteria.audit.view       → Ver historial de auditorías

-- REPORTES
--   transporteria.reports.view     → Ver reportes


-- ============================================================================
-- 5. EJEMPLO: FUNCIÓN RPC PARA VALIDAR SESIÓN CON NUEVO ROL
--    Si tu función app_validate_session tiene validación de roles,
--    asegúrate de que 'TRANSPORT_USER' esté permitido.
--    Esto depende de la implementación de tu RPC existente.
-- ============================================================================

-- Verificar que la función app_validate_session retorna business_units
-- y que puede incluir 'transporteria'. Normalmente no requiere cambios
-- porque retorna el array de business_units del registro del usuario.


-- ============================================================================
-- 6. RLS POLICIES PARA TRANSPORT_USER
--    Políticas de seguridad a nivel fila para que TRANSPORT_USER
--    solo vea datos de sus sucursales asignadas.
--
--    NOTA: Adaptadas para usar el claim de Supabase Auth.
--    Si tu app usa session tokens propios, valida en el RPC en su lugar.
-- ============================================================================

-- Ejemplo de política en inventory_transactions para TRANSPORT_USER:
-- (Ajustar según cómo tu app expone el user_id al RLS)

-- CREATE POLICY "transport_user_sees_own_branches_sales" ON public.inventory_transactions
--   FOR SELECT
--   USING (
--     branch_id IN (
--       SELECT b.code FROM public.branches b
--       JOIN public.user_branch_access uba ON uba.branch_code = b.code
--       WHERE uba.user_id = auth.uid()
--         AND b.business_unit = 'transporteria'
--     )
--   );

-- Lo más simple si ya tienes RLS por branch_id:
-- Asegúrate de que los allowed_branch_ids del TRANSPORT_USER solo contengan
-- códigos de sucursales TRANS-XX. La app ya filtra por selectedBranchId
-- a nivel de UI y servicio, por lo que RLS es una capa adicional de seguridad.


-- ============================================================================
-- 7. TABLA DE SUCURSALES PERMITIDAS POR USUARIO (opcional)
--    Si usas la columna allowed_branch_ids en tu app_users,
--    actualizar al crear el usuario:
-- ============================================================================

-- UPDATE public.app_users
-- SET allowed_branch_ids = ARRAY['TRANS-01', 'TRANS-02']
-- WHERE role_key = 'TRANSPORT_USER' AND username = 'transport_admin';


-- ============================================================================
-- 8. ÍNDICES RECOMENDADOS para rendimiento en sucursales de Transportería
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_branch_type
  ON public.inventory_transactions (branch_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_branch
  ON public.inventory_stock (branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_products_branch_active
  ON public.products (branch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_branches_business_unit
  ON public.branches (business_unit, is_active);


-- ============================================================================
-- RESUMEN DE CAMBIOS
-- ============================================================================
-- ✅ branches.business_unit → identifica unidad de negocio de cada sucursal
-- ✅ Sucursal única TRANS-01 insertada
-- ✅ Permisos documentados para asignar a TRANSPORT_USER
-- ✅ Índices de rendimiento creados
-- ⚠️  INSERT en app_users → descomentar y adaptar a tu schema real
-- ⚠️  RLS policies → descomentar y adaptar si usas Supabase Auth RLS
-- ============================================================================
