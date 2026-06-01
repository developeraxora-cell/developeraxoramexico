// Edge Function: asistente IA (GPT) con acceso real a la base de datos.
// GPT decide qué consultar → llama a la tool `ejecutar_sql` → la función la ejecuta
// (solo lectura, vía RPC exec_readonly_sql con service role) → GPT redacta la respuesta.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatRole = 'system' | 'user' | 'assistant';
interface ChatMessage { role: ChatRole; content: string; }
interface ChatPayload {
  messages?: ChatMessage[];
  context?: {
    branchName?: string;
    branchId?: string | number | null;
    businessUnit?: string;
    userName?: string;
    lastSql?: string;
  };
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini';
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TZ_OFFSET_HOURS = Number(Deno.env.get('AI_TZ_OFFSET') ?? '-5'); // Perú/CDMX

// Defaults SIEMPRE: sucursal Degollado + módulo materiales.
const DEFAULT_BRANCH_ID = Number(Deno.env.get('AI_DEFAULT_BRANCH_ID') ?? '1');
const DEFAULT_BRANCH_NAME = Deno.env.get('AI_DEFAULT_BRANCH_NAME') ?? 'DEGOLLADO LOPAR';
const DEFAULT_BUSINESS_UNIT = 'materiales';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------------------
// Contexto de fechas (zona local) para que GPT no calcule días ni TZ.
// ---------------------------------------------------------------------------
function dateContext(): string {
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const nowLocal = new Date(Date.now() + TZ_OFFSET_HOURS * 3600_000);
  const y = nowLocal.getUTCFullYear(), mo = nowLocal.getUTCMonth(), d = nowLocal.getUTCDate();
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const today = iso(y, mo, d);
  const dow = (nowLocal.getUTCDay() + 6) % 7; // 0 = lunes
  // UTC start de una fecha local: medianoche local convertida a UTC.
  const utcStart = (yy: number, mm: number, dd: number) =>
    new Date(Date.UTC(yy, mm, dd, 0, 0, 0) - TZ_OFFSET_HOURS * 3600_000).toISOString().slice(0, 19);
  const dayPlus = (n: number) => { const t = new Date(Date.UTC(y, mo, d) + n * 86400_000); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()] as [number, number, number]; };
  const range = (a: [number, number, number], b: [number, number, number]) =>
    `created_at >= '${utcStart(...a)}' AND created_at < '${utcStart(...b)}'`;
  const monday = dayPlus(-dow);
  const month1: [number, number, number] = [y, mo, 1];

  const semana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
    .map((nom, i) => {
      const a = dayPlus(-dow + i); const b = dayPlus(-dow + i + 1);
      return `${nom} (${iso(...a)}): ${range(a, b)}`;
    }).join('\n  ');

  return [
    `Hoy es ${DIAS[nowLocal.getUTCDay()]} ${today}. Zona local UTC${TZ_OFFSET_HOURS}.`,
    'created_at está en UTC. COPIA TAL CUAL el rango del período pedido (no calcules fechas):',
    `  HOY: ${range([y, mo, d], dayPlus(1))}`,
    `  AYER: ${range(dayPlus(-1), [y, mo, d])}`,
    `  ESTA SEMANA (lunes a hoy): ${range(monday, dayPlus(1))}`,
    `  ESTE MES: ${range(month1, dayPlus(1))}`,
    'Para un día concreto usa EXACTAMENTE el rango de ese día:',
    `  ${semana}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Instrucciones: persona + esquema + reglas SQL + defaults.
// ---------------------------------------------------------------------------
// Resuelve la sucursal: acepta id numérico o code; si no, Degollado por defecto.
async function resolveBranch(ctx: ChatPayload['context']): Promise<{ branchId: number; branchName: string; businessUnit: string }> {
  const businessUnit = ctx?.businessUnit || DEFAULT_BUSINESS_UNIT;
  const raw = ctx?.branchId;
  let branchId = DEFAULT_BRANCH_ID;
  let branchName = ctx?.branchName || DEFAULT_BRANCH_NAME;

  try {
    if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw))) {
      branchId = Number(raw);
    } else if (typeof raw === 'string' && raw.trim() && raw !== 'n/d') {
      // Es un código de sucursal: resuélvelo a id.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/branches?code=eq.${encodeURIComponent(raw)}&select=id,name`, {
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      const data = await res.json().catch(() => []);
      if (Array.isArray(data) && data[0]?.id) { branchId = data[0].id; branchName = data[0].name || branchName; }
    }
  } catch { /* usa defaults */ }

  return { branchId, branchName, businessUnit };
}

function buildInstructions(resolved: { branchId: number; branchName: string; businessUnit: string }, lastSql?: string): string {
  const { branchId, branchName, businessUnit } = resolved;

  return `
Eres el DIRECTOR GENERAL VIRTUAL de GRUPO LOPAR (materiales de construcción, concretera,
transportería, vinos). Respondes en español, ejecutivo, directo y con criterio de negocio.
Piensas como un consejo de administración (McKinsey/Bain/BCG). Detecta riesgos, fugas,
oportunidades y prioriza acciones (🔴ALTA/🟡MEDIA/🟢BAJA) cuando aporte valor.

# ACCESO A DATOS
Tienes la herramienta 'ejecutar_sql' que corre un SELECT de PostgreSQL y te devuelve filas.
Para CUALQUIER pregunta sobre datos reales (ventas, compras, clientes, deudas, inventario,
proveedores, diésel, etc.) DEBES llamar a 'ejecutar_sql'. No inventes cifras. No pidas
permiso. No muestres el SQL como respuesta; ejecútalo y responde con los números reales.
Puedes llamar la herramienta varias veces (corrige y reintenta si una falla).

# DEFAULTS (si el usuario no especifica)
- Sucursal: ${branchName} → branch_id = ${branchId}.
- Módulo/unidad: ${businessUnit} → business_unit = '${businessUnit}'.
- Filtra SIEMPRE por estos dos salvo que el usuario pida explícitamente otra sucursal/unidad.

# ESQUEMA (PostgreSQL) — tablas y columnas reales
branches(id, code, name, business_unit, is_active)  -- Degollado = id 1
products(id, branch_id, sku, name, category_id, brand_id, base_uom_id, purchase_price,
  retail_price, wholesale_price, precio, min_stock, stock, business_unit, is_active)
categories(id,name) · brands(id,name) · uoms(id,code,name)
inventory_stock(branch_id, product_id, qty_base)  -- existencias actuales
inventory_transactions(id, type['SALE','PURCHASE','ADJUST','TRANSFER'], branch_id,
  business_unit, nombre_cliente, supplier_id, is_credit, payment_type, created_at, is_deleted)
inventory_transaction_items(id, transaction_id, product_id, product_uom_id, qty, unit_price, line_total)
credit_customers(id, name, credit_limit, default_credit_days, business_unit, branch_id, is_active)
credit_notes(id, branch_id, customer_id, folio, issue_date, due_date, total, paid_amount,
  balance, business_unit)  -- cuentas por cobrar
credit_payments(id, note_id, amount, method, paid_at)
customer_wallets(id, branch_id, customer_id, current_balance, business_unit) · customer_wallet_movements(...)
suppliers(id, name, phone, business_unit, branch_id, is_active)
diesel_tanks(id, branch_id, name, current_qty, max_capacity) · diesel_logs(type['CARGA','RECEPCION'], tank_id, amount, ...)
production_orders(...) · production_items(movement['ENTRADA','SALIDA'], qty, peso)
Concretera: usa tablas con prefijo concrete_ (concrete_inventory_transactions SIN columna
business_unit; concrete_credit_notes/_customers, concrete_inventory_stock, concrete_products).

# REGLAS SQL (evita errores)
- Una sola sentencia SELECT, sin punto y coma final. CALIFICA columnas con alias.
- Ventas: inventory_transactions i (type='SALE', is_deleted=false) JOIN
  inventory_transaction_items it ON it.transaction_id = i.id. Importe =
  SUM(COALESCE(it.line_total, it.qty*it.unit_price)). Filtra i.business_unit y i.branch_id.
  line_total/qty/unit_price/product_id están en la tabla de ÍTEMS (it), NO en i.
- Compras: igual con type='PURCHASE'.
- Clientes con más deuda / cartera vencida: credit_notes (balance>0; vencida si due_date<CURRENT_DATE)
  JOIN credit_customers c ON c.id=customer_id. Filtra business_unit y branch_id. NO uses productos aquí.
  Ej: SELECT c.name, SUM(cn.balance) AS deuda FROM credit_notes cn JOIN credit_customers c
  ON c.id=cn.customer_id WHERE cn.balance>0 AND cn.business_unit='${businessUnit}' AND cn.branch_id=${branchId}
  GROUP BY c.name ORDER BY deuda DESC LIMIT 10
- Inventario bajo: inventory_stock s JOIN products p ON p.id=s.product_id
  WHERE s.branch_id=${branchId} AND p.business_unit='${businessUnit}' AND p.min_stock>0 AND s.qty_base<p.min_stock.
- Pon LIMIT razonable. Agrupa/SUMA en SQL (no traigas miles de filas para sumarlas tú).

# FECHAS
${dateContext()}

# CONTINUIDAD
Si el usuario dice "eso", "dámelo", "la lista", "complétalo", se refiere al último tema útil.
${lastSql ? `Última SQL exitosa de referencia:\n${lastSql}` : ''}

# REPORTES / EXPORTAR
Si piden un "reporte/informe ejecutivo", consulta los datos necesarios y estructura:
RESUMEN EJECUTIVO / INDICADORES CLAVE / RIESGOS / OPORTUNIDADES / ACCIONES (priorizadas) / IMPACTO.
Si piden "exportar/descargar/CSV/lista", ejecuta un SELECT con columnas claras; el sistema
mostrará un botón de descarga con esas filas.
`.trim();
}

// ---------------------------------------------------------------------------
// Ejecutar SQL (solo lectura) vía RPC exec_readonly_sql (service role).
// ---------------------------------------------------------------------------
const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|call|do|merge|vacuum|reindex|refresh|lock|begin|commit|rollback)\b/i;

async function runSql(consulta: string): Promise<{ rows: any[]; error?: string }> {
  const q = String(consulta ?? '').trim().replace(/;+\s*$/, '');
  if (!q) return { rows: [], error: 'Consulta vacía.' };
  const noStrings = q.replace(/'(?:[^']|'')*'/g, "''");
  if (!/^(select|with)\s/i.test(q)) return { rows: [], error: 'Solo se permiten SELECT.' };
  if (noStrings.includes(';')) return { rows: [], error: 'Una sola sentencia.' };
  if (FORBIDDEN.test(noStrings)) return { rows: [], error: 'Operación de escritura no permitida.' };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_readonly_sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ query: q }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { rows: [], error: data?.message || `Error SQL (${res.status}).` };
  return { rows: Array.isArray(data) ? data : [] };
}

const TOOLS = [{
  type: 'function',
  name: 'ejecutar_sql',
  description: 'Ejecuta un SELECT de PostgreSQL (solo lectura) y devuelve las filas. Úsalo para cualquier dato real.',
  parameters: {
    type: 'object',
    properties: {
      consulta: { type: 'string', description: 'Sentencia SELECT de PostgreSQL.' },
      proposito: { type: 'string', description: 'Qué busca la consulta (breve, en español).' },
    },
    required: ['consulta'],
  },
}];

// Extrae el texto final de una respuesta del Responses API (output_text o message items).
function extractText(data: any): string {
  const direct = String(data?.output_text ?? '').trim();
  if (direct) return direct;
  const out: any[] = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of out) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (typeof c?.text === 'string') parts.push(c.text);
      }
    }
  }
  return parts.join('').trim();
}

async function callOpenAI(instructions: string, input: any[]): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, instructions, input, tools: TOOLS }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI respondió ${res.status}`);
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY no configurada.' }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'Faltan SUPABASE_URL / SERVICE_ROLE_KEY.' }, 500);

  let payload: ChatPayload;
  try { payload = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) return json({ error: 'Sin mensajes para procesar.' }, 400);

  const queries: Array<{ sql: string; rows: number; error?: string; data: any[]; label?: string }> = [];

  try {
    const resolved = await resolveBranch(payload.context);
    const instructions = buildInstructions(resolved, payload.context?.lastSql);
    const input: any[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }));

    let finalText = '';
    for (let round = 0; round < 6; round++) {
      const data = await callOpenAI(instructions, input);
      const output: any[] = Array.isArray(data?.output) ? data.output : [];
      const calls = output.filter((o) => o?.type === 'function_call');

      if (calls.length === 0) {
        finalText = extractText(data);
        break;
      }

      // Conservar los items de la respuesta y responder cada función.
      for (const item of output) input.push(item);
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments ?? '{}'); } catch { args = {}; }
        const { rows, error } = await runSql(args?.consulta ?? '');
        queries.push({ sql: args?.consulta ?? '', rows: rows.length, error, data: rows, label: args?.proposito });
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(error ? { error } : { filas: rows.length, datos: rows.slice(0, 500) }),
        });
      }
    }

    return json({ text: finalText, model: OPENAI_MODEL, queries });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado', queries }, 502);
  }
});
