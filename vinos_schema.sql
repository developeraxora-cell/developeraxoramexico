-- ============================================================
-- GRUPO LOPAR — MÓDULO VINOS
-- Script completo de base de datos (sin auth — usuarios en DB principal)
-- Proyecto Supabase independiente
-- Generado: 2026-05-15
-- ============================================================
-- NOTA: created_by en todas las tablas almacena el UUID del usuario
--       del proyecto principal. Sin FK porque son DBs distintas.
-- ============================================================


-- ============================================================
-- 0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. SUCURSALES
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id         SERIAL PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  address    TEXT,
  phone      TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 2. CATÁLOGO
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brands (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  rfc        TEXT,
  notes      TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         TEXT UNIQUE NOT NULL,
  barcode     TEXT,
  name        TEXT NOT NULL,
  brand_id    UUID REFERENCES brands(id),
  category_id UUID REFERENCES categories(id),

  -- Características del producto
  origin_country TEXT,
  volume_ml      INTEGER,
  alcohol_pct    NUMERIC(5,2),
  vintage_year   INTEGER,

  -- 3 niveles de precio
  price_retail        NUMERIC(10,2) NOT NULL DEFAULT 0,   -- menudeo
  price_mid_wholesale NUMERIC(10,2) NOT NULL DEFAULT 0,   -- medio mayoreo
  price_wholesale     NUMERIC(10,2) NOT NULL DEFAULT 0,   -- mayoreo

  cost      NUMERIC(10,2) DEFAULT 0,
  min_stock NUMERIC DEFAULT 0,
  max_stock NUMERIC DEFAULT 9999,

  -- Perfil de sabor para recomendaciones
  -- Ejemplo: {"dulce":true,"seco":false,"afrutado":true,"añejado":false,"artesanal":false,"importado":true,"cuerpo":"medio"}
  taste_profile JSONB DEFAULT '{}',

  image_url  TEXT,
  notes      TEXT,
  is_active  BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_stocks (
  product_id UUID    REFERENCES products(id) ON DELETE CASCADE,
  branch_id  INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  qty        NUMERIC DEFAULT 0,
  PRIMARY KEY (product_id, branch_id)
);


-- ============================================================
-- 3. CLIENTES — CRM completo
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id INTEGER REFERENCES branches(id) NOT NULL,

  -- Datos personales
  name     TEXT NOT NULL,
  phone    TEXT,
  whatsapp TEXT,
  email    TEXT,
  birthday DATE,
  gender   TEXT CHECK (gender IN ('M','F','OTRO')),

  -- Clasificación CRM
  customer_type TEXT DEFAULT 'vino'
    CHECK (customer_type IN ('vino','whisky','cerveza_artesanal','tequila','premium','fiesta_eventos')),

  -- Etiquetas automáticas
  -- Valores: frecuente | VIP | cazador_promo | alto_gasto | compra_social | compra_urgente | fin_de_semana
  tags TEXT[] DEFAULT '{}',

  status TEXT DEFAULT 'ACTIVO'
    CHECK (status IN ('ACTIVO','DORMIDO','EN_RIESGO','PERDIDO')),

  -- Perfil de gusto para recomendaciones tipo Netflix
  -- Ejemplo: {"dulce":true,"seco":false,"afrutado":true,"añejado":false,"artesanal":false,"importado":true}
  taste_profile JSONB DEFAULT '{}',

  preferred_payment_method TEXT,
  preferred_branch_id      INTEGER REFERENCES branches(id),

  -- Métricas CRM (recalculadas por RPC tras cada compra)
  avg_ticket                 NUMERIC(10,2) DEFAULT 0,
  avg_days_between_purchases NUMERIC(6,2)  DEFAULT 0,
  last_purchase_date         DATE,
  total_purchase_count       INTEGER       DEFAULT 0,
  total_spent                NUMERIC(12,2) DEFAULT 0,
  ltv                        NUMERIC(12,2) DEFAULT 0,

  -- Lealtad
  loyalty_level  TEXT DEFAULT 'BRONCE'
    CHECK (loyalty_level IN ('BRONCE','PLATA','ORO','BLACK')),
  loyalty_points INTEGER DEFAULT 0,

  -- Seguimiento de riesgo
  risk_flagged_at TIMESTAMPTZ,

  notes      TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_by UUID,              -- UUID del usuario en DB principal (sin FK cross-DB)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historial de productos por cliente (base para recomendaciones)
CREATE TABLE IF NOT EXISTS customer_product_history (
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id)  ON DELETE CASCADE,
  purchase_count  INTEGER       DEFAULT 1,
  total_qty       NUMERIC       DEFAULT 0,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  first_purchased DATE,
  last_purchased  DATE,
  PRIMARY KEY (customer_id, product_id)
);


-- ============================================================
-- 4. VENTAS
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   INTEGER REFERENCES branches(id)  NOT NULL,
  customer_id UUID    REFERENCES customers(id),    -- NULL = mostrador / público general

  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('EFECTIVO','TARJETA','TRANSFERENCIA','MIXTO','CREDITO','PUNTOS')),

  -- Tier de precio aplicado al ticket
  price_type TEXT NOT NULL DEFAULT 'MENUDEO'
    CHECK (price_type IN ('MENUDEO','MEDIO_MAYOREO','MAYOREO')),

  subtotal        NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL,

  delivery_address TEXT,
  notes            TEXT,
  created_by       UUID NOT NULL,   -- UUID del usuario en DB principal
  created_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  delete_note      TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID    REFERENCES sales(id)    ON DELETE CASCADE NOT NULL,
  product_id UUID    REFERENCES products(id) NOT NULL,
  qty        NUMERIC NOT NULL,

  price_type TEXT NOT NULL
    CHECK (price_type IN ('MENUDEO','MEDIO_MAYOREO','MAYOREO')),

  unit_price NUMERIC(10,2) NOT NULL,
  line_total NUMERIC(10,2) NOT NULL   -- fuente de verdad; no reconstruir con qty * unit_price
);


-- ============================================================
-- 5. COMPRAS / ENTRADAS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchases (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     INTEGER REFERENCES branches(id)  NOT NULL,
  supplier_id   UUID    REFERENCES suppliers(id),
  reference     TEXT,
  purchase_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  total         NUMERIC(10,2) DEFAULT 0,
  notes         TEXT,
  created_by    UUID NOT NULL,   -- UUID del usuario en DB principal
  created_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  delete_note   TEXT
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id   UUID    REFERENCES purchases(id) ON DELETE CASCADE NOT NULL,
  product_id    UUID    REFERENCES products(id)  NOT NULL,
  qty           NUMERIC NOT NULL,
  cost_per_unit NUMERIC(10,2) NOT NULL,
  subtotal      NUMERIC(10,2) NOT NULL
);


-- ============================================================
-- 6. LEALTAD Y GAMIFICACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_levels_config (
  level            TEXT PRIMARY KEY
    CHECK (level IN ('BRONCE','PLATA','ORO','BLACK')),
  min_points       INTEGER NOT NULL DEFAULT 0,
  min_annual_spend NUMERIC DEFAULT 0,
  points_per_peso  NUMERIC DEFAULT 1,
  benefits         JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS loyalty_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL
    CHECK (type IN ('COMPRA','CANJE','BONUS_CUMPLE','BONUS_RETO','AJUSTE','EXPIRACION')),
  points      INTEGER NOT NULL,    -- positivo = ganó, negativo = gastó/canjeó
  description TEXT,
  sale_id     UUID REFERENCES sales(id),
  created_by  UUID,                -- UUID del usuario en DB principal
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS badges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  icon               TEXT,
  requirement_type   TEXT NOT NULL
    CHECK (requirement_type IN ('PURCHASE_COUNT','TOTAL_SPEND','CATEGORY_COUNT','STREAK','SPECIAL')),
  requirement_value  NUMERIC,
  requirement_config JSONB DEFAULT '{}',
  is_active          BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS customer_badges (
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  badge_id    UUID REFERENCES badges(id)    ON DELETE CASCADE,
  earned_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (customer_id, badge_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  description        TEXT,
  challenge_type     TEXT NOT NULL
    CHECK (challenge_type IN ('PURCHASE_COUNT','CATEGORY_COUNT','SPEND_AMOUNT','PRODUCT_SPECIFIC')),
  requirement        JSONB NOT NULL DEFAULT '{}',
  reward_points      INTEGER DEFAULT 0,
  reward_description TEXT,
  valid_from         DATE,
  valid_until        DATE,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_challenges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES customers(id)  ON DELETE CASCADE NOT NULL,
  challenge_id   UUID REFERENCES challenges(id) ON DELETE CASCADE NOT NULL,
  progress       NUMERIC DEFAULT 0,
  completed      BOOLEAN DEFAULT false,
  completed_at   TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT false,
  UNIQUE (customer_id, challenge_id)
);


-- ============================================================
-- 7. CAMPAÑAS Y WHATSAPP
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,

  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('INACTIVITY','BIRTHDAY','LEVEL_UP','CALENDAR_EVENT','SEGMENT','MANUAL')),

  -- Configuración del trigger según tipo:
  -- INACTIVITY:     {"days": 15}
  -- BIRTHDAY:       {"days_before": 1}
  -- LEVEL_UP:       {"to_level": "ORO"}
  -- CALENDAR_EVENT: {"calendar_id": "<uuid>"}
  -- SEGMENT:        {"customer_types": ["vino"], "min_spent": 5000, "tags": ["VIP"]}
  trigger_config JSONB DEFAULT '{}',

  -- Filtros de segmento adicionales
  segment_filters JSONB DEFAULT '{}',

  channel TEXT DEFAULT 'WHATSAPP'
    CHECK (channel IN ('WHATSAPP','SMS','IN_APP')),

  -- Variables disponibles en el mensaje:
  -- {nombre}, {dias_sin_comprar}, {nivel}, {puntos}, {producto_favorito}, {descuento}
  message_template TEXT NOT NULL,

  cooldown_days INTEGER DEFAULT 7,   -- no reenviar al mismo cliente en X días
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID,                -- UUID del usuario en DB principal
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Registro de cada mensaje enviado
CREATE TABLE IF NOT EXISTS campaign_sends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID REFERENCES campaign_templates(id) NOT NULL,
  customer_id         UUID REFERENCES customers(id)          NOT NULL,
  channel             TEXT NOT NULL,
  message_sent        TEXT NOT NULL,      -- mensaje ya renderizado con variables
  whatsapp_number     TEXT,
  status              TEXT DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENT','DELIVERED','READ','FAILED','RESPONDED')),
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  response_text       TEXT,
  responded_at        TIMESTAMPTZ,
  error_message       TEXT,
  provider_message_id TEXT,              -- ID de Twilio / Meta API
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Calendario comercial — base para campañas automáticas por fecha
CREATE TABLE IF NOT EXISTS commercial_calendar (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  event_type           TEXT NOT NULL
    CHECK (event_type IN ('HOLIDAY','SPORTING','COMMERCIAL','LOCAL','RECURRING')),
  event_date           DATE,            -- para eventos únicos
  recurring_pattern    TEXT,
  -- Patrones soportados: 'BIMONTHLY_1' | 'BIMONTHLY_15' | 'WEEKLY_FRI' | 'MONTHLY_LAST_FRI'
  days_before_trigger  INTEGER DEFAULT 3,
  campaign_template_id UUID REFERENCES campaign_templates(id),
  is_active            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 8. RECOMENDACIONES — Afinidad de productos
-- Se actualiza via RPC después de cada venta
-- ============================================================

CREATE TABLE IF NOT EXISTS product_affinity (
  product_a_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  product_b_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  co_purchase_count INTEGER DEFAULT 0,
  affinity_score    NUMERIC DEFAULT 0,   -- lift: P(A∩B) / (P(A)*P(B))
  last_updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_a_id, product_b_id),
  CHECK (product_a_id < product_b_id)   -- evita duplicados (A,B) y (B,A)
);


-- ============================================================
-- 9. AUDITORÍA
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     INTEGER REFERENCES branches(id),
  user_id       UUID,           -- UUID del usuario en DB principal (sin FK cross-DB)
  action_type   TEXT NOT NULL
    CHECK (action_type IN ('CREAR','ACTUALIZAR','ELIMINAR','VENTA','COMPRA','LOGIN','LOGOUT')),
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  description   TEXT NOT NULL,
  justification TEXT,
  previous_data JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 10. ÍNDICES
-- ============================================================

-- Productos
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand     ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active    ON products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stocks_branch      ON product_stocks(branch_id);

-- Clientes
CREATE INDEX IF NOT EXISTS idx_customers_branch        ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_status        ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_loyalty       ON customers(loyalty_level);
CREATE INDEX IF NOT EXISTS idx_customers_last_purchase ON customers(last_purchase_date);
CREATE INDEX IF NOT EXISTS idx_customers_type          ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_phone         ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp      ON customers(whatsapp);

-- Ventas
CREATE INDEX IF NOT EXISTS idx_sales_branch   ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created  ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_active   ON sales(branch_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_sale     ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_items_product  ON sale_items(product_id);

-- Compras
CREATE INDEX IF NOT EXISTS idx_purchases_branch  ON purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_pitems_purchase   ON purchase_items(purchase_id);

-- Lealtad
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_created  ON loyalty_log(created_at);

-- Campañas
CREATE INDEX IF NOT EXISTS idx_sends_customer ON campaign_sends(customer_id);
CREATE INDEX IF NOT EXISTS idx_sends_status   ON campaign_sends(status);
CREATE INDEX IF NOT EXISTS idx_sends_created  ON campaign_sends(created_at);

-- Auditoría
CREATE INDEX IF NOT EXISTS idx_audit_branch  ON audit_log(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);


-- ============================================================
-- 11. TRIGGERS
-- ============================================================

-- 11.1 Sumar stock al confirmar purchase_item
CREATE OR REPLACE FUNCTION fn_stock_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_stocks (product_id, branch_id, qty)
  SELECT NEW.product_id, p.branch_id, NEW.qty
  FROM purchases p WHERE p.id = NEW.purchase_id
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET qty = product_stocks.qty + EXCLUDED.qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_on_purchase
AFTER INSERT ON purchase_items
FOR EACH ROW EXECUTE FUNCTION fn_stock_on_purchase();


-- 11.2 Restar stock al registrar sale_item
CREATE OR REPLACE FUNCTION fn_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE product_stocks
  SET qty = qty - NEW.qty
  FROM sales s
  WHERE s.id = NEW.sale_id
    AND product_stocks.product_id = NEW.product_id
    AND product_stocks.branch_id  = s.branch_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_on_sale
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION fn_stock_on_sale();


-- 11.3 Restaurar stock en soft-delete de venta
CREATE OR REPLACE FUNCTION fn_restore_stock_on_sale_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE product_stocks ps
    SET qty = ps.qty + si.qty
    FROM sale_items si
    WHERE si.sale_id        = NEW.id
      AND ps.product_id     = si.product_id
      AND ps.branch_id      = NEW.branch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restore_stock_on_delete
AFTER UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION fn_restore_stock_on_sale_delete();


-- 11.4 Mantener updated_at en customers
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
-- 12. RPCs — OPERACIONES
-- ============================================================

-- Recalcula métricas CRM de un cliente (llamar tras cada venta confirmada)
CREATE OR REPLACE FUNCTION recalculate_customer_metrics(p_customer_id UUID)
RETURNS void AS $$
DECLARE
  v_dates    DATE[];
  v_avg_days NUMERIC;
  v_count    INTEGER;
BEGIN
  UPDATE customers SET
    total_purchase_count = (
      SELECT COUNT(*) FROM sales
      WHERE customer_id = p_customer_id AND deleted_at IS NULL
    ),
    total_spent = (
      SELECT COALESCE(SUM(total), 0) FROM sales
      WHERE customer_id = p_customer_id AND deleted_at IS NULL
    ),
    last_purchase_date = (
      SELECT MAX(created_at::DATE) FROM sales
      WHERE customer_id = p_customer_id AND deleted_at IS NULL
    ),
    avg_ticket = (
      SELECT COALESCE(AVG(total), 0) FROM sales
      WHERE customer_id = p_customer_id AND deleted_at IS NULL
    ),
    ltv = (
      SELECT COALESCE(SUM(total), 0) FROM sales
      WHERE customer_id = p_customer_id AND deleted_at IS NULL
    )
  WHERE id = p_customer_id;

  -- Frecuencia promedio entre compras
  SELECT ARRAY_AGG(created_at::DATE ORDER BY created_at)
  INTO v_dates
  FROM sales
  WHERE customer_id = p_customer_id AND deleted_at IS NULL;

  v_count := COALESCE(array_length(v_dates, 1), 0);

  IF v_count >= 2 THEN
    SELECT AVG(diff) INTO v_avg_days
    FROM (
      SELECT (v_dates[i+1] - v_dates[i]) AS diff
      FROM generate_series(1, v_count - 1) AS i
    ) diffs;

    UPDATE customers
    SET avg_days_between_purchases = v_avg_days
    WHERE id = p_customer_id;
  END IF;

  -- Clasificar status por inactividad relativa a la frecuencia del cliente
  UPDATE customers SET
    status = CASE
      WHEN avg_days_between_purchases > 0
           AND last_purchase_date < CURRENT_DATE - (avg_days_between_purchases * 3)::INTEGER
        THEN 'PERDIDO'
      WHEN avg_days_between_purchases > 0
           AND last_purchase_date < CURRENT_DATE - (avg_days_between_purchases * 1.5)::INTEGER
        THEN 'EN_RIESGO'
      WHEN last_purchase_date >= CURRENT_DATE - INTERVAL '90 days'
        THEN 'ACTIVO'
      WHEN last_purchase_date IS NOT NULL
        THEN 'DORMIDO'
      ELSE status
    END,
    risk_flagged_at = CASE
      WHEN avg_days_between_purchases > 0
           AND last_purchase_date < CURRENT_DATE - (avg_days_between_purchases * 1.5)::INTEGER
           AND risk_flagged_at IS NULL
        THEN now()
      ELSE risk_flagged_at
    END,
    updated_at = now()
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Actualiza nivel de lealtad según puntos acumulados
CREATE OR REPLACE FUNCTION update_loyalty_level(p_customer_id UUID)
RETURNS void AS $$
DECLARE
  v_points INTEGER;
  v_level  TEXT;
BEGIN
  SELECT loyalty_points INTO v_points
  FROM customers WHERE id = p_customer_id;

  SELECT level INTO v_level
  FROM loyalty_levels_config
  WHERE min_points <= v_points
  ORDER BY min_points DESC
  LIMIT 1;

  IF v_level IS NOT NULL THEN
    UPDATE customers
    SET loyalty_level = v_level, updated_at = now()
    WHERE id = p_customer_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Actualiza afinidad de productos tras cada venta (para recomendaciones)
CREATE OR REPLACE FUNCTION update_product_affinity(p_sale_id UUID)
RETURNS void AS $$
DECLARE
  v_products UUID[];
  v_i        INTEGER;
  v_j        INTEGER;
  v_a        UUID;
  v_b        UUID;
BEGIN
  SELECT ARRAY_AGG(product_id) INTO v_products
  FROM sale_items WHERE sale_id = p_sale_id;

  IF array_length(v_products, 1) < 2 THEN
    RETURN;
  END IF;

  FOR v_i IN 1..array_length(v_products, 1) LOOP
    FOR v_j IN (v_i + 1)..array_length(v_products, 1) LOOP
      -- Garantizar orden para CHECK (product_a_id < product_b_id)
      IF v_products[v_i] < v_products[v_j] THEN
        v_a := v_products[v_i]; v_b := v_products[v_j];
      ELSE
        v_a := v_products[v_j]; v_b := v_products[v_i];
      END IF;

      INSERT INTO product_affinity (product_a_id, product_b_id, co_purchase_count, last_updated_at)
      VALUES (v_a, v_b, 1, now())
      ON CONFLICT (product_a_id, product_b_id)
      DO UPDATE SET
        co_purchase_count = product_affinity.co_purchase_count + 1,
        last_updated_at   = now();
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Ajuste manual de stock con auditoría
CREATE OR REPLACE FUNCTION adjust_product_stock(
  p_product_id UUID,
  p_branch_id  INTEGER,
  p_new_qty    NUMERIC,
  p_reason     TEXT,
  p_notes      TEXT DEFAULT NULL,
  p_user_id    UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_old_qty NUMERIC;
BEGIN
  SELECT qty INTO v_old_qty
  FROM product_stocks
  WHERE product_id = p_product_id AND branch_id = p_branch_id;

  INSERT INTO product_stocks (product_id, branch_id, qty)
  VALUES (p_product_id, p_branch_id, p_new_qty)
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET qty = p_new_qty;

  INSERT INTO audit_log (branch_id, user_id, action_type, entity_type, entity_id, description, justification)
  VALUES (
    p_branch_id,
    p_user_id,
    'ACTUALIZAR',
    'stock',
    p_product_id::text,
    'Ajuste manual: ' || COALESCE(v_old_qty, 0) || ' → ' || p_new_qty,
    p_reason || CASE WHEN p_notes IS NOT NULL THEN ' | ' || p_notes ELSE '' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 13. SEED DATA
-- ============================================================

-- Niveles de lealtad
INSERT INTO loyalty_levels_config (level, min_points, min_annual_spend, points_per_peso, benefits) VALUES
  ('BRONCE', 0,    0,      1.0, '{"discount_pct":0,  "early_access":false,"tasting_events":false,"label":"Nivel inicial"}'),
  ('PLATA',  500,  3000,   1.2, '{"discount_pct":3,  "early_access":false,"tasting_events":false,"label":"3% descuento en compras"}'),
  ('ORO',    2000, 10000,  1.5, '{"discount_pct":5,  "early_access":true, "tasting_events":true, "label":"5% descuento + acceso anticipado"}'),
  ('BLACK',  5000, 30000,  2.0, '{"discount_pct":10, "early_access":true, "tasting_events":true, "label":"10% + degustaciones + preventas exclusivas"}')
ON CONFLICT (level) DO NOTHING;

-- Categorías de productos
INSERT INTO categories (name, sort_order) VALUES
  ('Vino Tinto',         1),
  ('Vino Blanco',        2),
  ('Vino Rosado',        3),
  ('Vino Espumoso',      4),
  ('Whisky',             5),
  ('Tequila',            6),
  ('Mezcal',             7),
  ('Ron',                8),
  ('Vodka',              9),
  ('Gin',               10),
  ('Cerveza Artesanal', 11),
  ('Cerveza Importada', 12),
  ('Cognac / Brandy',   13),
  ('Otro',              14)
ON CONFLICT (name) DO NOTHING;

-- Sucursal inicial
INSERT INTO branches (code, name) VALUES
  ('VIN-01', 'VINOS - Principal')
ON CONFLICT (code) DO NOTHING;

-- Calendario comercial México
INSERT INTO commercial_calendar (name, event_type, event_date, recurring_pattern, days_before_trigger) VALUES
  ('Año Nuevo',              'HOLIDAY',    '2027-01-01', NULL,           3),
  ('San Valentín',           'COMMERCIAL', '2027-02-14', NULL,           5),
  ('Día del Padre',          'HOLIDAY',    '2027-06-20', NULL,           7),
  ('Día de Muertos',         'HOLIDAY',    '2027-11-02', NULL,           5),
  ('Navidad',                'HOLIDAY',    '2026-12-25', NULL,           7),
  ('Fin de Año',             'HOLIDAY',    '2026-12-31', NULL,           3),
  ('SuperBowl 2027',         'SPORTING',   '2027-02-07', NULL,           5),
  ('Puente Constitución',    'HOLIDAY',    '2027-02-01', NULL,           3),
  ('Puente Benito Juárez',   'HOLIDAY',    '2027-03-15', NULL,           3),
  ('Puente Independencia',   'HOLIDAY',    '2027-09-13', NULL,           3),
  ('Puente Revolución',      'HOLIDAY',    '2027-11-15', NULL,           3),
  ('Quincena día 1',         'RECURRING',  NULL,         'BIMONTHLY_1',  1),
  ('Quincena día 15',        'RECURRING',  NULL,         'BIMONTHLY_15', 1),
  ('Fin de Semana (viernes)','RECURRING',  NULL,         'WEEKLY_FRI',   0)
ON CONFLICT DO NOTHING;

-- Badges iniciales
INSERT INTO badges (code, name, description, icon, requirement_type, requirement_value) VALUES
  ('PRIMERA_COMPRA',   'Primera Botella',      'Realizaste tu primera compra',          '🍾', 'PURCHASE_COUNT', 1),
  ('CINCO_COMPRAS',    'Sommelier Novato',      'Completaste 5 compras',                 '🍷', 'PURCHASE_COUNT', 5),
  ('VEINTE_COMPRAS',   'Sommelier Experto',     'Completaste 20 compras',                '🏆', 'PURCHASE_COUNT', 20),
  ('CINCUENTA_COMPRAS','Maestro del Vino',      'Completaste 50 compras',                '👑', 'PURCHASE_COUNT', 50),
  ('GASTO_1K',         'Coleccionista',         'Gastaste más de $1,000 MXN',            '💰', 'TOTAL_SPEND',    1000),
  ('GASTO_5K',         'Gran Coleccionista',    'Gastaste más de $5,000 MXN',            '💎', 'TOTAL_SPEND',    5000),
  ('GASTO_20K',        'Embajador Premium',     'Gastaste más de $20,000 MXN',           '🌟', 'TOTAL_SPEND',    20000),
  ('EXPLORADOR',       'Explorador de Sabores', 'Compraste productos de 5 categorías',   '🌍', 'CATEGORY_COUNT', 5)
ON CONFLICT (code) DO NOTHING;
