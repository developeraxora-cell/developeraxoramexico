// Cliente para el modelo local de Ollama (llama3.1) con soporte de herramientas.
// El modelo decide qué tool ejecutar; la app corre la consulta en Supabase
// (solo lectura, acotada a la sucursal/unidad activa) y le devuelve los datos.

import { AI_SYSTEM_PROMPT } from './systemPrompt';
import { AI_TOOLS, executeTool, resolveBranchId, ToolContext } from './aiTools.service';
import { addLesson, lessonsContext } from './sqlMemory.service';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
}

const OLLAMA_URL = (import.meta.env.VITE_OLLAMA_URL as string | undefined)?.replace(/\/$/, '')
  || 'http://localhost:11434';
const OLLAMA_MODEL = (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) || 'llama3.1';
// Ventana de contexto: el default de Ollama (4096) es muy chico para nuestro prompt
// (esquema + plantillas + lecciones). Si se trunca, el modelo responde vacío.
const NUM_CTX = Number(import.meta.env.VITE_OLLAMA_NUM_CTX) || 16384;
const OLLAMA_OPTIONS = { num_ctx: NUM_CTX, temperature: 0.2 };

export const isOllamaConfigured = Boolean(OLLAMA_URL);

const TOOL_LABELS: Record<string, string> = {
  ejecutar_sql: 'Consultando la base de datos…',
  generar_reporte_ejecutivo: 'Recopilando datos del reporte…',
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Borde UTC (sin Z) que corresponde a la medianoche local de un día. */
function utcStart(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toISOString().slice(0, 19); // UTC
}

/** Nota de contexto: unidad, sucursal, branch_id y bordes UTC exactos por período. */
function buildContextNote(ctx: ToolContext): string {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(d.getDate() + n); return r; };

  const today = iso(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const month1 = iso(new Date(now.getFullYear(), now.getMonth(), 1));

  // Rango UTC completo y listo para pegar: created_at >= X AND created_at < Y
  const rango = (fromLocal: string, toLocalExclusiveStart: string) =>
    `created_at >= '${utcStart(fromLocal)}' AND created_at < '${utcStart(toLocalExclusiveStart)}'`;

  // Cada día de la semana con su RANGO COMPLETO (un solo día), listo para copiar.
  const semana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
    .map((nombre, i) => {
      const d = iso(addDays(monday, i));
      const next = iso(addDays(monday, i + 1));
      return `${nombre} (${d}): ${rango(d, next)}`;
    })
    .join('\n  ');

  return (
    `Contexto → unidad activa: ${ctx.businessUnit || 'materiales'}; ` +
    `sucursal: ${ctx.branchName || ctx.branchCode || 'n/d'} ` +
    `(branch_id = ${ctx.branchId ?? 'n/d'}).\n` +
    `NO preguntes qué sucursal o qué módulo usar: ya estás dentro de esta sucursal y ` +
    `esta unidad. Si el usuario no especifica otra cosa, usa SIEMPRE estos valores. ` +
    `En cada respuesta de negocio menciona explícitamente: "Sucursal: ${ctx.branchName || ctx.branchCode || 'n/d'}" ` +
    `y "Módulo: ${ctx.businessUnit || 'materiales'}".\n` +
    `Mantén continuidad conversacional: si el usuario dice "eso", "dámelo", "la lista", ` +
    `"completo", "ahora en CSV" o expresiones similares, interpreta que se refiere al ` +
    `último tema y a la última consulta/respuesta útil de esta conversación, salvo que ` +
    `mencione explícitamente otro tema, sucursal o unidad.\n` +
    `FILTRO OBLIGATORIO en TODA consulta de ventas/compras/inventario/clientes (salvo que ` +
    `el usuario pida explícitamente otra sucursal/unidad): incluye SIEMPRE las DOS condiciones\n` +
    `    i.branch_id = ${ctx.branchId ?? 'NULL'}  AND  i.business_unit = '${ctx.businessUnit || 'materiales'}'\n` +
    `  NUNCA omitas business_unit: esa sucursal mezcla varias unidades y olvidarlo da totales inflados.\n` +
    `Hoy es ${DIAS[now.getDay()]} ${today}.\n` +
    `created_at está en UTC. COPIA TAL CUAL el rango del período pedido (no los mezcles ni los calcules):\n` +
    `  HOY: ${rango(today, iso(addDays(now, 1)))}\n` +
    `  AYER: ${rango(iso(addDays(now, -1)), today)}\n` +
    `  ESTA SEMANA (lunes a hoy): ${rango(iso(monday), iso(addDays(now, 1)))}\n` +
    `  ESTE MES: ${rango(month1, iso(addDays(now, 1)))}\n` +
    `Si piden UN día concreto de la semana, usa EXACTAMENTE el rango de ESE día (es de un solo día, NO el de la semana):\n  ${semana}\n` +
    `Ejemplo: "ventas del lunes" → usa el rango de la línea "lunes", NO el de "ESTA SEMANA".`
  );
}

export interface QueryDebug {
  sql: string;
  rows?: number;
  error?: string;
  data?: any[];       // filas devueltas (para exportar a CSV)
  label?: string;     // descripción/propósito de la consulta
}

interface RunOptions {
  onToken: (chunk: string, full: string) => void;
  onStatus?: (label: string) => void;
  onQuery?: (info: QueryDebug) => void;
  ctx: ToolContext;
  signal?: AbortSignal;
}

/** Llamada NO streaming (para la fase de decisión de herramientas). */
async function chatOnce(messages: OllamaMessage[], useTools: boolean, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: OLLAMA_OPTIONS,
      ...(useTools ? { tools: AI_TOOLS } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json?.message ?? {};
}

/** Llamada streaming: emite tokens y devuelve el texto completo. */
async function chatStream(
  messages: OllamaMessage[],
  onToken: (chunk: string, full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true, options: OLLAMA_OPTIONS }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama respondió ${res.status} ${res.statusText}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        const token = json?.message?.content ?? '';
        if (token) {
          full += token;
          onToken(token, full);
        }
      } catch {
        /* línea parcial */
      }
    }
  }
  return full.trim();
}

/**
 * Agente principal: decide herramientas, las ejecuta y transmite la respuesta final.
 * - Fase 1 (no stream, con tools): el modelo puede pedir consultas.
 * - Si pide tools: se ejecutan en Supabase y se le devuelven los resultados.
 * - Fase final (stream): redacta la respuesta con los datos reales.
 */
const MAX_ROUNDS = 6;
const TABULAR_EXPORT_RE = /\b(csv|excel|xlsx|lista|listado|tabla|filas|registros)\b/i;
const DOWNLOAD_RE = /\b(exportar|descargar|descarga|archivo|documento)\b/i;
const TOOL_AVOIDANCE_RE = /\b(ejecutar_sql|consulta sql|select\s|no hay un archivo|puedes descargar|haz clic|formato csv)\b/i;
const SPECIFIC_REPORT_RE = /\b(reporte|informe|an[aá]lisis)\b[\s\S]{0,80}\b(ventas?|compras?|productos?|clientes?|inventario|stock|cartera|cr[eé]dito|proveedores?|di[eé]sel|flota|producci[oó]n)\b|\b(ventas?|compras?|productos?|clientes?|inventario|stock|cartera|cr[eé]dito|proveedores?|di[eé]sel|flota|producci[oó]n)\b[\s\S]{0,80}\b(reporte|informe|an[aá]lisis)\b/i;
const RAW_LIST_REPORT_RE = /\b(venta id|compra id|producto id|cliente id|#\d+)\b/i;

function latestUserContent(history: OllamaMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content ?? '';
  }
  return '';
}

export async function runOllamaAgent({ onToken, onStatus, onQuery, ctx, signal }: RunOptions, history: OllamaMessage[]): Promise<string> {
  // Resolver el branch_id numérico una vez para inyectarlo al contexto y a las tools.
  const branchId = ctx.branchId ?? (await resolveBranchId(ctx.branchCode));
  const fullCtx: ToolContext = { ...ctx, branchId };
  ctx = fullCtx;

  const lessons = lessonsContext();
  const continuity = ctx.lastSql
    ? `Continuidad: la última consulta SQL que ejecutaste con éxito en esta conversación fue:\n${ctx.lastSql}\n` +
      `Si el usuario pide AJUSTARLA (filtrar por una unidad, cambiar fecha, agregar una columna, etc.), ` +
      `TOMA ESA consulta como base y modifícala mínimamente. NO cambies de tabla ni empieces de cero. ` +
      `Si pide exportar/lista completa/CSV, usa el mismo tema y los mismos filtros salvo que pida otro alcance.`
    : '';
  const messages: OllamaMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'system', content: buildContextNote(fullCtx) },
    ...(lessons ? [{ role: 'system' as const, content: lessons }] : []),
    ...(continuity ? [{ role: 'system' as const, content: continuity }] : []),
    ...history,
  ];

  // Estado para auto-corrección y "conciencia".
  let firstError = '';     // primer error de SQL en esta consulta (para la lección)
  let lastError = '';      // error más reciente (para el nudge de reintento)
  let lastWasError = false;
  const latestUser = latestUserContent(history);
  const mustUseSqlForExport = DOWNLOAD_RE.test(latestUser) && TABULAR_EXPORT_RE.test(latestUser);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await chatOnce(messages, true, signal);
    const toolCalls = msg?.tool_calls ?? [];

    if (!toolCalls.length) {
      // El modelo no pidió herramienta. Si la última consulta falló, NO lo dejes
      // explicar el error: oblígalo a corregir y reintentar (mientras queden rondas).
      if (lastWasError && round < MAX_ROUNDS - 1) {
        messages.push({
          role: 'system',
          content:
            `La última consulta SQL falló con: "${lastError}". NO expliques el error como ` +
            'respuesta final. Corrígelo y vuelve a llamar a ejecutar_sql. Pistas: ' +
            'CALIFICA cada columna con su alias (it.line_total, it.qty, it.unit_price están ' +
            'en la tabla de ítems; i.branch_id, i.business_unit, i.created_at en la de ' +
            'transacciones). El JOIN va dentro del FROM, antes del WHERE. Una sola sentencia SELECT.',
        });
        continue;
      }
      if (mustUseSqlForExport && TOOL_AVOIDANCE_RE.test(msg?.content ?? '') && round < MAX_ROUNDS - 1) {
        messages.push({ role: 'assistant', content: msg.content ?? '' });
        messages.push({
          role: 'system',
          content:
            'El usuario pidió un archivo CSV/lista descargable. Tu respuesta anterior no es válida ' +
            'porque explicaste SQL o instrucciones en vez de ejecutar datos. Ahora DEBES llamar a ' +
            'la herramienta ejecutar_sql con un SELECT real que devuelva las filas solicitadas. ' +
            'No respondas texto final todavía. No digas que no hay archivo. La aplicación creará el CSV automáticamente.',
        });
        onStatus?.('Preparando datos para CSV…');
        continue;
      }
      if (SPECIFIC_REPORT_RE.test(latestUser) && RAW_LIST_REPORT_RE.test(msg?.content ?? '') && round < MAX_ROUNDS - 1) {
        messages.push({ role: 'assistant', content: msg.content ?? '' });
        messages.push({
          role: 'system',
          content:
            'El usuario pidió un REPORTE, no un listado de registros. Reescribe la respuesta ' +
            'con formato ejecutivo: RESUMEN DEL REPORTE, INDICADORES CLAVE, HALLAZGOS RELEVANTES, ' +
            'RIESGOS / PUNTOS DE ATENCIÓN y ACCIONES RECOMENDADAS. No enumeres cada venta/registro ' +
            'salvo que el usuario haya pedido lista, detalle, desglose, tabla o CSV.',
        });
        continue;
      }
      if (msg?.content?.trim()) {
        onToken(msg.content, msg.content);
        return msg.content.trim();
      }
      return chatStream(messages, onToken, signal);
    }

    if (
      SPECIFIC_REPORT_RE.test(latestUser) &&
      toolCalls.some((call: any) => call?.function?.name === 'generar_reporte_ejecutivo') &&
      round < MAX_ROUNDS - 1
    ) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });
      messages.push({
        role: 'system',
        content:
          'El usuario pidió un reporte ESPECÍFICO, no un reporte ejecutivo general. ' +
          'No uses generar_reporte_ejecutivo. Debes usar ejecutar_sql con consultas enfocadas ' +
          'solo al tema pedido y al rango exacto solicitado. Si es reporte de ventas de un día, ' +
          'consulta únicamente las ventas de ese día y valida el conteo con COUNT(DISTINCT i.id).',
      });
      onStatus?.('Ajustando el reporte al tema solicitado…');
      continue;
    }

    // Ejecutar cada herramienta pedida.
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });
    lastWasError = false;
    for (const call of toolCalls) {
      const name = call?.function?.name;
      let args = call?.function?.arguments ?? {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      onStatus?.(TOOL_LABELS[name] || 'Consultando datos…');
      const result = await executeTool(name, args, ctx);
      messages.push({ role: 'tool', content: result });

      // Analizar resultado para auto-corrección + aprendizaje.
      let parsed: any = {};
      try { parsed = JSON.parse(result); } catch { /* ignore */ }
      const sql: string = args?.consulta ?? '';
      if (sql) {
        onQuery?.({ sql, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: args?.proposito });
      }
      if (parsed?.error) {
        lastWasError = true;
        lastError = String(parsed.error);
        if (!firstError) firstError = lastError;
        onStatus?.('Corrigiendo la consulta…');
      } else if (sql && firstError) {
        // Éxito tras un error previo → registrar la lección para no repetirlo.
        addLesson(firstError, sql);
        firstError = '';
      }
    }
  }

  // Agotadas las rondas: redacta con lo que se tenga.
  return chatStream(messages, onToken, signal);
}
