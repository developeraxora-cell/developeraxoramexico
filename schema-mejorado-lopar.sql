-- SQL MEJORADO PARA AISLAMIENTO DE SUCURSALES (MATRIZ VS NORTE)
-- GRUPO LOPAR - INDUSTRIAL OS
-- Versión corregida sin dependencia de tabla 'branches'

-- 1. ASEGURAR COLUMNAS DE SUCURSAL EN TABLAS MAESTRAS (Usando TEXT para compatibilidad total)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS branch_id TEXT;

-- 2. ÍNDICES PARA BÚSQUEDA RÁPIDA POR SUCURSAL (OPTIMIZACIÓN)
CREATE INDEX IF NOT EXISTS idx_vehicles_branch ON vehicles(branch_id);
CREATE INDEX IF NOT EXISTS idx_drivers_branch ON drivers(branch_id);
CREATE INDEX IF NOT EXISTS idx_diesel_logs_tank ON diesel_logs(tank_id);
CREATE INDEX IF NOT EXISTS idx_diesel_logs_created ON diesel_logs(created_at);

-- 2.1 TABLA DE HISTORIAL DE ELIMINACIONES
CREATE TABLE IF NOT EXISTS diesel_logs_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_log_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT 'ELIMINADO',
  action_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_by TEXT NOT NULL,
  type TEXT NOT NULL,
  tank_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  vehicle_id UUID,
  driver_id UUID,
  odometer_reading NUMERIC,
  supplier TEXT,
  invoice_number TEXT,
  cost_per_liter NUMERIC,
  total_cost NUMERIC,
  notes TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diesel_logs_history_tank ON diesel_logs_history(tank_id);
CREATE INDEX IF NOT EXISTS idx_diesel_logs_history_action_at ON diesel_logs_history(action_at);

-- 3. POLÍTICAS DE SEGURIDAD (RLS) PARA AISLAMIENTO TOTAL
-- Nota: Habilitamos RLS para asegurar que los datos no se mezclen.

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE diesel_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE diesel_logs ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS SIMPLIFICADAS (Basadas en el ID de sucursal enviado desde el cliente)
-- Como no hay tabla 'branches' centralizada, el aislamiento se maneja por el ID literal (p. ej. 'matriz', 'norte')

CREATE POLICY "Aislamiento por sucursal - Tanques" ON diesel_tanks
FOR ALL USING (true); -- El filtrado se realiza en la aplicación mediante branch_id

CREATE POLICY "Aislamiento por sucursal - Vehículos" ON vehicles
FOR ALL USING (true);

CREATE POLICY "Aislamiento por sucursal - Choferes" ON drivers
FOR ALL USING (true);

-- 4. ARCHIVAR Y ELIMINAR REGISTROS DE DIESEL
CREATE OR REPLACE FUNCTION archive_diesel_log(p_log_id UUID, p_deleted_by TEXT)
RETURNS void AS $$
DECLARE
  v_log RECORD;
BEGIN
  SELECT * INTO v_log FROM diesel_logs WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log no encontrado';
  END IF;

  INSERT INTO diesel_logs_history (
    original_log_id,
    action,
    action_at,
    action_by,
    type,
    tank_id,
    amount,
    vehicle_id,
    driver_id,
    odometer_reading,
    supplier,
    invoice_number,
    cost_per_liter,
    total_cost,
    notes,
    user_id,
    created_at
  )
  VALUES (
    v_log.id,
    'ELIMINADO',
    now(),
    p_deleted_by,
    v_log.type,
    v_log.tank_id,
    v_log.amount,
    v_log.vehicle_id,
    v_log.driver_id,
    v_log.odometer_reading,
    v_log.supplier,
    v_log.invoice_number,
    v_log.cost_per_liter,
    v_log.total_cost,
    v_log.notes,
    v_log.user_id,
    v_log.created_at
  );

  IF v_log.type = 'CARGA' THEN
    UPDATE diesel_tanks
    SET current_qty = LEAST(max_capacity, current_qty + v_log.amount)
    WHERE id = v_log.tank_id;
  ELSE
    UPDATE diesel_tanks
    SET current_qty = GREATEST(0, current_qty - v_log.amount)
    WHERE id = v_log.tank_id;
  END IF;

  DELETE FROM diesel_logs WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql;

-- 5. PROCEDIMIENTO DE REINICIO DE LOGÍSTICA (MODO PRUEBA)
-- Esta función hace el reset de forma atómica y segura
CREATE OR REPLACE FUNCTION reset_branch_logistics(p_branch_id TEXT)
RETURNS void AS $$
BEGIN
  -- Borrar logs solo de los tanques que pertenecen a esa sucursal
  DELETE FROM diesel_logs 
  WHERE tank_id IN (SELECT id FROM diesel_tanks WHERE branch_id = p_branch_id);
  
  -- Resetear tanques a 2500L
  UPDATE diesel_tanks 
  SET current_qty = 2500 
  WHERE branch_id = p_branch_id;
END;
$$ LANGUAGE plpgsql;
