-- ============================================================
-- VINOS — Campañas y Promociones (envíos masivos WhatsApp)
-- Ejecutar en la base de datos de VINOS (no en la principal).
-- ============================================================

-- ── 1. Campañas ──────────────────────────────────────────────
-- Una campaña agrupa un segmento de clientes, genera una promoción
-- por cliente y envía un mensaje personalizado por WhatsApp.
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,

  -- Cómo se arma el segmento de destinatarios
  segment_type     TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (segment_type IN ('AT_RISK','INFREQUENT','LOYALTY','CUSTOMER_TYPE','STATUS','ALL','MANUAL')),
  -- Configuración del segmento según el tipo:
  --   LOYALTY:        {"levels": ["ORO","BLACK"]}
  --   CUSTOMER_TYPE:  {"types": ["vino","whisky"]}
  --   STATUS:         {"statuses": ["EN_RIESGO","DORMIDO"]}
  --   INFREQUENT:     {"days": 30}   (sin comprar en >= N días)
  --   AT_RISK:        {}             (status EN_RIESGO o PERDIDO)
  --   MANUAL:         {"customer_ids": ["<uuid>", ...]}
  --   ALL:            {}
  segment_config   JSONB NOT NULL DEFAULT '{}',

  discount_percent NUMERIC(5,2) NOT NULL
    CHECK (discount_percent > 0 AND discount_percent <= 100),

  valid_from       DATE NOT NULL,
  valid_to         DATE NOT NULL,

  -- Variables soportadas: {{nombre_cliente}} {{promocion}}
  --   {{fecha_inicio_promocion}} {{fecha_fin_promocion}} {{descuento}}
  message_template TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'BORRADOR'
    CHECK (status IN ('BORRADOR','ENVIADA','FINALIZADA','CANCELADA')),

  total_recipients INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,

  branch_id        INTEGER REFERENCES branches(id),
  created_by       UUID,            -- UUID del usuario en DB principal
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  delete_note      TEXT
);

-- ── 2. Promociones ───────────────────────────────────────────
-- Cada promoción pertenece a un cliente y nace de una campaña.
-- Canjeable por cualquier cliente en POS (no se valida propiedad),
-- pero queda registrada a quién se le asignó originalmente.
CREATE TABLE IF NOT EXISTS promotions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE CASCADE,

  discount_percent NUMERIC(5,2) NOT NULL
    CHECK (discount_percent > 0 AND discount_percent <= 100),

  valid_from       DATE NOT NULL,
  valid_to         DATE NOT NULL,

  status           TEXT NOT NULL DEFAULT 'ACTIVA'
    CHECK (status IN ('ACTIVA','USADA','VENCIDA','CANCELADA')),

  used_at          TIMESTAMPTZ,
  sale_id          UUID REFERENCES sales(id),
  redeemed_by      UUID REFERENCES customers(id),  -- cliente que la canjeó (puede diferir del dueño)

  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_code     ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_customer ON promotions(customer_id);
CREATE INDEX IF NOT EXISTS idx_promotions_campaign ON promotions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status   ON promotions(status);

-- ── 3. campaign_sends: enlazar con campaigns + promotions ────
ALTER TABLE campaign_sends ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS campaign_id  UUID REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sends_campaign ON campaign_sends(campaign_id);

-- ── 4. sales: registrar promoción canjeada ──────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS promotion_id   UUID REFERENCES promotions(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS promotion_code TEXT;

-- ── 5. RLS desactivado (control de acceso solo en frontend) ──
ALTER TABLE campaigns  DISABLE ROW LEVEL SECURITY;
ALTER TABLE promotions DISABLE ROW LEVEL SECURITY;
