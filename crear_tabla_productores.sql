-- Tabla de productores (responsables de produccion).
-- No son usuarios del sistema, son una lista propia gestionada en el modulo
-- de Produccion.
CREATE TABLE IF NOT EXISTS productores (
  id         bigserial PRIMARY KEY,
  branch_id  integer NOT NULL,
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productores_branch ON productores(branch_id, active);

-- El proyecto no usa RLS.
ALTER TABLE productores DISABLE ROW LEVEL SECURITY;
