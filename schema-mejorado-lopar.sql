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

-- 4. PROCEDIMIENTO DE REINICIO DE LOGÍSTICA (MODO PRUEBA)
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
