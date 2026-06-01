import React, { useCallback, useEffect, useRef, useState } from 'react';
import { runOllamaAgent, OllamaMessage, QueryDebug } from '../../services/ai/ollama.service';
import { isOpenAIProviderEnabled, runOpenAIAgent } from '../../services/ai/openai.service';
import { executeTool, resolveBranchId } from '../../services/ai/aiTools.service';
import {
  ChatMessage,
  ConversationMeta,
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation,
  saveDraft,
  clearDraft,
} from '../../services/ai/chatHistory.service';

interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  userName?: string;
  userId?: string;
  businessUnit?: string;
  branchId?: string;
}

const SparkIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" fill="currentColor" />
    <path d="M19 14l.9 2.7L22 17.5l-2.1.8L19 21l-.9-2.7L16 17.5l2.1-.8L19 14z" fill="currentColor" opacity="0.7" />
  </svg>
);

const QUICK_PROMPTS = [
  {
    label: 'Ventas de hoy',
    prompt: '¿Cuánto vendí hoy en la sucursal y módulo activos? Dame el total, número de ventas y ticket promedio.',
  },
  {
    label: 'Reporte semanal de ventas',
    prompt: 'Quiero el reporte de ventas de la semana pasada para la sucursal y módulo activo, con formato ejecutivo.',
  },
  {
    label: 'Clientes recurrentes',
    prompt: '¿Cuáles son los clientes más recurrentes de la sucursal y módulo activos? Considera frecuencia de compra y monto acumulado.',
  },
  {
    label: 'Productos más vendidos',
    prompt: '¿Cuáles son los productos más vendidos de la sucursal y módulo activos? Muéstrame ranking por cantidad e importe.',
  },
  {
    label: 'Reporte semanal de compras',
    prompt: 'Quiero el reporte de compras de la semana pasada para la sucursal y módulo activo, con formato ejecutivo.',
  },
];

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const EXPORT_INTENT_RE = /\b(exportar|descargar|descarga|archivo|documento|doc|word|csv|excel|xlsx)\b/i;
const TABULAR_EXPORT_RE = /\b(csv|excel|xlsx|lista|listado|tabla|filas|registros)\b/i;
const TEXT_REPORT_RE = /\b(word|doc|documento|informe ejecutivo|resumen ejecutivo|analisis|análisis)\b/i;
const DOWNLOAD_ONLY_RE = /^(?:me\s+lo\s+)?(?:puedes\s+)?(?:dar|dame|darlo|d[aá]rmelo|darmelo|entregar|entr[eé]ga|pasar|p[aá]same|generar|genera|hacer|haz|crear|crea|descargar|descarga).{0,100}\b(archivo|documento|word|doc|csv|excel|descargarlo)\b/i;
const GIVE_ME_IT_RE = /\b(?:dar|dame|d[aá]melo|damelo|d[aá]rmelo|darmelo|p[aá]samelo|pasamelo|entr[eé]gamelo|entregamelo)\b/i;
const DOWNLOAD_INSTRUCTION_RE = /\b(puedes descargar|haz clic|haciendo clic|bot[oó]n|aparece debajo|descargar csv|descargar word|bot[oó]n de descarga|se ha generado y est[aá] disponible|descargar informe)\b/i;
const FAILED_DOWNLOAD_RE = /\b(lo siento|no logr[eé]|no hay un archivo|te sugiero ejecutar|ejecutar_sql|consulta sql|select\s)\b/i;

const wantsDownload = (text: string) => EXPORT_INTENT_RE.test(text);
const wantsTabularDownload = (text: string) => TABULAR_EXPORT_RE.test(text);
const wantsTextReport = (text: string) => TEXT_REPORT_RE.test(text);
const isDownloadOnlyRequest = (text: string) => DOWNLOAD_ONLY_RE.test(text) || GIVE_ME_IT_RE.test(text);
const isDownloadInstruction = (text: string) => DOWNLOAD_INSTRUCTION_RE.test(text) || FAILED_DOWNLOAD_RE.test(text);
const isLowStockProductsRequest = (text: string) =>
  /\b(productos?|inventario)\b/i.test(text) && /\b(stock\s+(bajo|minimo|mínimo)|bajo\s+stock|m[ií]nimo(?:\s+de)?\s+stock)\b/i.test(text);
const impliesCsvFromPrevious = (text: string) =>
  /\b(csv|consulta sql|select\s|ejecutar_sql|json|productos?|stock|m[ií]nimo|unidades|lista)\b/i.test(text);
const wantsExactSqlExport = (text: string) =>
  /\b(sentencia\s+sql|consulta\s+sql|sql)\b/i.test(text);
const isSalesReportRequest = (text: string) => /\b(reporte|informe|an[aá]lisis)\b/i.test(text) && /\bventas?\b/i.test(text);
const isSalesSummaryRequest = (text: string) =>
  /\b(cu[aá]nto|total|ticket\s+promedio|n[uú]mero\s+de\s+ventas|vend[ií]|vendimos|vendido|factur[eé]|facturamos|ingresos?)\b/i.test(text) &&
  /\b(hoy|ayer|semana|mes|ventas?|vend[ií]|vendimos|factur[eé]|facturamos|ingresos?)\b/i.test(text);
const isPurchasesReportRequest = (text: string) => /\b(reporte|informe|an[aá]lisis)\b/i.test(text) && /\b(compras?|entradas?)\b/i.test(text);
const isRecurringCustomersRequest = (text: string) =>
  /\bclientes?\b/i.test(text) && /\b(recurrentes?|frecuentes?|frecuencia|compran\s+m[aá]s|m[aá]s\s+compran)\b/i.test(text);

const safeFileToken = (value: string, fallback: string) => {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return cleaned || fallback;
};

// --- Exportación a CSV ---
function rowsToCsv(rows: any[]): string {
  if (!rows.length) return '';
  const keys: string[] = Array.from(rows.reduce((s: Set<string>, r) => { Object.keys(r ?? {}).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(typeof v === 'object' ? JSON.stringify(v) : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = keys.join(',');
  const body = rows.map((r) => keys.map((k) => esc(r?.[k])).join(',')).join('\n');
  return `${head}\n${body}`;
}

function normalizeCsvRows(rows: any[]): any[] {
  if (rows.length === 1) {
    const only = rows[0];
    if (Array.isArray(only?.data)) return only.data;
    if (Array.isArray(only?.datos)) return only.datos;
    if (Array.isArray(only?.rows)) return only.rows;
    if (Array.isArray(only?.items)) return only.items;
  }
  return rows;
}

const formatMoney = (value: number) =>
  value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

function resolveSalesReportRange(text: string): { from: string; to: string; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const lower = text.toLowerCase();
  const weekdays: Array<[RegExp, number, string]> = [
    [/\blunes\b/, 0, 'lunes'],
    [/\bmartes\b/, 1, 'martes'],
    [/\bmi[eé]rcoles\b/, 2, 'miércoles'],
    [/\bjueves\b/, 3, 'jueves'],
    [/\bviernes\b/, 4, 'viernes'],
    [/\bs[aá]bado\b/, 5, 'sábado'],
    [/\bdomingo\b/, 6, 'domingo'],
  ];

  if (lower.includes('semana pasada')) {
    const previousMonday = addDays(monday, -7);
    const weekday = weekdays.find(([pattern]) => pattern.test(lower));
    if (weekday) {
      const day = addDays(previousMonday, weekday[1]);
      return { from: isoDate(day), to: isoDate(addDays(day, 1)), label: `${weekday[2]} de la semana pasada` };
    }
    return { from: isoDate(previousMonday), to: isoDate(monday), label: 'la semana pasada' };
  }

  if (lower.includes('esta semana')) {
    return { from: isoDate(monday), to: isoDate(addDays(today, 1)), label: 'esta semana' };
  }

  if (lower.includes('ayer')) {
    const yesterday = addDays(today, -1);
    return { from: isoDate(yesterday), to: isoDate(today), label: 'ayer' };
  }

  return { from: isoDate(today), to: isoDate(addDays(today, 1)), label: 'hoy' };
}

function buildSalesReportFallback(rows: any[], input: { branchName?: string; businessUnit?: string; requestText: string }): string {
  const normalized = normalizeCsvRows(rows);
  const total = normalized.reduce((sum, row) => sum + Number(row.total ?? row.importe ?? 0), 0);
  const tickets = normalized.length;
  const avg = tickets > 0 ? total / tickets : 0;
  const byPayment = normalized.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
    const key = String(row.tipo_pago ?? row.payment_type ?? 'Sin especificar');
    acc[key] = acc[key] ?? { count: 0, total: 0 };
    acc[key].count += 1;
    acc[key].total += Number(row.total ?? row.importe ?? 0);
    return acc;
  }, {});
  const topSales = [...normalized]
    .sort((a, b) => Number(b.total ?? b.importe ?? 0) - Number(a.total ?? a.importe ?? 0))
    .slice(0, 5);

  const paymentLines = Object.entries(byPayment)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([method, info]) => `- ${method}: ${info.count} venta${info.count !== 1 ? 's' : ''}, ${formatMoney(info.total)}`)
    .join('\n');

  const topLines = topSales
    .map((row) => `- Venta #${row.venta_id ?? row.id ?? 'N/D'}: ${formatMoney(Number(row.total ?? row.importe ?? 0))} (${row.cliente ?? 'Cliente no especificado'})`)
    .join('\n');

  return [
    `Sucursal: ${input.branchName || 'Sucursal activa'}`,
    `Módulo: ${input.businessUnit || 'materiales'}`,
    '',
    '📊 RESUMEN DEL REPORTE',
    `El reporte de ventas para ${input.requestText} incluye ${tickets} venta${tickets !== 1 ? 's' : ''}, con un total vendido de ${formatMoney(total)} y un ticket promedio de ${formatMoney(avg)}.`,
    '',
    '📈 INDICADORES CLAVE',
    `- Ventas registradas: ${tickets}`,
    `- Total vendido: ${formatMoney(total)}`,
    `- Ticket promedio: ${formatMoney(avg)}`,
    '',
    '🔎 HALLAZGOS RELEVANTES',
    paymentLines || '- No se encontraron métodos de pago clasificados.',
    '',
    'Ventas más altas del periodo:',
    topLines || '- Sin ventas para destacar.',
    '',
    '⚠️ RIESGOS / PUNTOS DE ATENCIÓN',
    tickets === 0
      ? '- No hay ventas en el periodo solicitado; conviene validar si fue un día sin operación o si falta captura.'
      : '- Revisa las ventas con importes bajos o en cero, porque pueden representar cortesías, ajustes o capturas incompletas.',
    '',
    '✅ ACCIONES RECOMENDADAS',
    '- 🔴 ALTA PRIORIDAD: validar ventas en cero o sin tipo de pago para evitar distorsiones del reporte.',
    '- 🟡 MEDIA PRIORIDAD: revisar los clientes de mayor importe y confirmar seguimiento comercial.',
    '- 🟢 BAJA PRIORIDAD: comparar este periodo contra el mismo día de la semana anterior para medir tendencia.',
  ].join('\n');
}

function buildRecurringCustomersReport(rows: any[], input: { branchName?: string; businessUnit?: string }): string {
  const normalized = normalizeCsvRows(rows);
  const totalClientes = normalized.length;
  const totalVentas = normalized.reduce((sum, row) => sum + Number(row.frecuencia ?? 0), 0);
  const totalImporte = normalized.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const topLines = normalized.slice(0, 10)
    .map((row, index) => {
      const frecuencia = Number(row.frecuencia ?? 0);
      const total = Number(row.total ?? 0);
      return `- ${index + 1}. ${row.cliente}: ${frecuencia} compra${frecuencia !== 1 ? 's' : ''}, ${formatMoney(total)} acumulado`;
    })
    .join('\n');

  return [
    `Sucursal: ${input.branchName || 'Sucursal activa'}`,
    `Módulo: ${input.businessUnit || 'materiales'}`,
    '',
    '📊 RESUMEN DEL REPORTE',
    `Se identificaron ${totalClientes} cliente${totalClientes !== 1 ? 's' : ''} recurrente${totalClientes !== 1 ? 's' : ''} en la sucursal y módulo activos. En conjunto representan ${totalVentas} compra${totalVentas !== 1 ? 's' : ''} y ${formatMoney(totalImporte)} acumulado.`,
    '',
    '📈 INDICADORES CLAVE',
    `- Clientes analizados: ${totalClientes}`,
    `- Compras acumuladas: ${totalVentas}`,
    `- Importe acumulado: ${formatMoney(totalImporte)}`,
    '',
    '🔎 HALLAZGOS RELEVANTES',
    topLines || '- No se encontraron clientes con ventas registradas.',
    '',
    '⚠️ RIESGOS / PUNTOS DE ATENCIÓN',
    '- Si los ingresos dependen de pocos clientes recurrentes, conviene dar seguimiento comercial para reducir riesgo de concentración.',
    '',
    '✅ ACCIONES RECOMENDADAS',
    '- 🔴 ALTA PRIORIDAD: contactar a los clientes de mayor frecuencia para asegurar recompra y detectar necesidades próximas.',
    '- 🟡 MEDIA PRIORIDAD: crear una lista de seguimiento por cliente con frecuencia alta pero monto bajo para impulsar ticket promedio.',
    '- 🟢 BAJA PRIORIDAD: comparar estos clientes contra el mes anterior para detectar pérdidas de recurrencia.',
  ].join('\n');
}

function buildPurchasesReport(rows: any[], input: { branchName?: string; businessUnit?: string; requestText: string }): string {
  const normalized = normalizeCsvRows(rows);
  const orders = normalized.length;
  const total = normalized.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const avg = orders > 0 ? total / orders : 0;
  const bySupplier = normalized.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
    const key = String(row.proveedor ?? 'Proveedor no especificado');
    acc[key] = acc[key] ?? { count: 0, total: 0 };
    acc[key].count += 1;
    acc[key].total += Number(row.total ?? 0);
    return acc;
  }, {});
  const supplierLines = Object.entries(bySupplier)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([supplier, info]) => `- ${supplier}: ${info.count} compra${info.count !== 1 ? 's' : ''}, ${formatMoney(info.total)}`)
    .join('\n');
  const topOrders = [...normalized]
    .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
    .slice(0, 5)
    .map((row) => `- Compra #${row.compra_id ?? row.id ?? 'N/D'}: ${formatMoney(Number(row.total ?? 0))} (${row.proveedor ?? 'Proveedor no especificado'})`)
    .join('\n');

  return [
    `Sucursal: ${input.branchName || 'Sucursal activa'}`,
    `Módulo: ${input.businessUnit || 'materiales'}`,
    '',
    '📊 RESUMEN DEL REPORTE',
    `El reporte de compras para ${input.requestText} incluye ${orders} compra${orders !== 1 ? 's' : ''}, con un total comprado de ${formatMoney(total)} y una compra promedio de ${formatMoney(avg)}.`,
    '',
    '📈 INDICADORES CLAVE',
    `- Compras registradas: ${orders}`,
    `- Total comprado: ${formatMoney(total)}`,
    `- Compra promedio: ${formatMoney(avg)}`,
    '',
    '🔎 HALLAZGOS RELEVANTES',
    supplierLines || '- No se encontraron proveedores clasificados.',
    '',
    'Compras más altas del periodo:',
    topOrders || '- Sin compras para destacar.',
    '',
    '⚠️ RIESGOS / PUNTOS DE ATENCIÓN',
    orders === 0
      ? '- No hay compras en el periodo solicitado; conviene validar si no hubo entradas o si falta captura.'
      : '- Revisa concentración por proveedor y compras altas para validar precios, condiciones y abastecimiento.',
    '',
    '✅ ACCIONES RECOMENDADAS',
    '- 🔴 ALTA PRIORIDAD: validar las compras de mayor importe contra factura y recepción física.',
    '- 🟡 MEDIA PRIORIDAD: revisar proveedores con mayor volumen para negociar mejores condiciones.',
    '- 🟢 BAJA PRIORIDAD: comparar compras contra ventas del mismo periodo para detectar sobreinventario.',
  ].join('\n');
}

function extractLowStockRows(text: string): Array<{ producto: string; stock: string; minimo: string }> {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^[-*+•]\s*/, ''))
    .map((line) => {
      const stockMinMatch = line.match(/^(.+?):\s*stock\s*=\s*([^,]+),\s*m[ií]nimo\s*=\s*(.+)$/i);
      if (stockMinMatch) {
        return {
          producto: stockMinMatch[1].trim(),
          stock: stockMinMatch[2].trim(),
          minimo: stockMinMatch[3].trim(),
        };
      }
      const unitsMatch = line.match(/^(.+?)\s*\(([-\d.,]+)\s*unidades?\)$/i);
      if (!unitsMatch) return null;
      return {
        producto: unitsMatch[1].trim(),
        stock: unitsMatch[2].trim(),
        minimo: '',
      };
    })
    .filter((row): row is { producto: string; stock: string; minimo: string } => Boolean(row));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportToWordHtml(text: string): string {
  const body = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<p>&nbsp;</p>';
      if (/^#{1,3}\s+/.test(trimmed)) {
        return `<h2>${escapeHtml(trimmed.replace(/^#{1,3}\s+/, ''))}</h2>`;
      }
      if (/^(\*|\+|-)\s+/.test(trimmed)) {
        return `<p style="margin-left:18pt;">• ${escapeHtml(trimmed.replace(/^(\*|\+|-)\s+/, ''))}</p>`;
      }
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Informe</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; line-height: 1.45; }
    h2 { color: #111827; margin: 18px 0 8px; }
    p { margin: 6px 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Render markdown ligero: **negrita**, `código`, viñetas (* + -) e indentación.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyBase}-b${k++}`} className="font-bold text-slate-900">{m[1]}</strong>);
    } else {
      parts.push(<code key={`${keyBase}-c${k++}`} className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-orange-600">{m[2]}</code>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const MessageContent: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const bullet = line.match(/^(\s*)[*+\-]\s+(.*)$/);
        if (bullet) {
          const depth = Math.min(Math.floor(bullet[1].replace(/\t/g, '  ').length / 2), 4);
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: depth * 14 }}>
              <span className="mt-[2px] text-orange-500">•</span>
              <span className="flex-1">{renderInline(bullet[2], `l${i}`)}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <div key={i}>{renderInline(line, `l${i}`)}</div>;
      })}
    </div>
  );
};

const AssistantDrawer: React.FC<AssistantDrawerProps> = ({
  isOpen, onClose, branchName, userName, userId = 'anon', businessUnit, branchId,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');
  const [debugQueries, setDebugQueries] = useState<QueryDebug[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [history, setHistory] = useState<ConversationMeta[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const lastSqlRef = useRef<string>('');
  const exportRowsRef = useRef<any[]>([]);
  messagesRef.current = messages;
  conversationIdRef.current = conversationId;

  useEffect(() => {
    if (isOpen && view === 'chat') {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [isOpen, view]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  // Borrador en vivo en localStorage mientras se conversa
  useEffect(() => {
    if (messages.length) saveDraft(userId, messages);
  }, [messages, userId]);

  // Persistir en Supabase y reiniciar a un chat nuevo
  const persistAndReset = useCallback(async () => {
    const current = messagesRef.current;
    const hasUser = current.some((m) => m.role === 'user' && m.text.trim());
    if (hasUser) {
      try {
        await saveConversation({
          id: conversationIdRef.current,
          userId,
          businessUnit,
          branchId,
          messages: current,
        });
      } catch (e) {
        console.error('No se pudo guardar la conversación IA:', e);
      }
    }
    clearDraft(userId);
    lastSqlRef.current = '';
    exportRowsRef.current = [];
    setDebugQueries([]);
    setMessages([]);
    setConversationId(null);
    setView('chat');
  }, [userId, businessUnit, branchId]);

  const handleClose = useCallback(() => {
    void persistAndReset();
    onClose();
  }, [persistAndReset, onClose]);

  // Cerrar con ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  const openHistory = async () => {
    setView('history');
    setLoadingHistory(true);
    try {
      setHistory(await listConversations(userId, businessUnit));
    } catch (e) {
      console.error('No se pudo cargar el historial IA:', e);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadConversation = async (meta: ConversationMeta) => {
    // Guarda lo que haya en el chat actual antes de reemplazarlo
    const current = messagesRef.current;
    if (current.some((m) => m.role === 'user' && m.text.trim())) {
      try {
        await saveConversation({ id: conversationIdRef.current, userId, businessUnit, branchId, messages: current });
      } catch (e) { console.error(e); }
    }
    try {
      const msgs = await getConversation(meta.id);
      lastSqlRef.current = '';
      exportRowsRef.current = [];
      setDebugQueries([]);
      setMessages(msgs);
      setConversationId(meta.id);
      setView('chat');
    } catch (e) {
      console.error('No se pudo abrir la conversación:', e);
    }
  };

  const removeConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (conversationIdRef.current === id) {
        setMessages([]);
        setConversationId(null);
      }
    } catch (err) { console.error(err); }
  };

  const startNewChat = async () => {
    const current = messagesRef.current;
    if (current.some((m) => m.role === 'user' && m.text.trim())) {
      try {
        await saveConversation({ id: conversationIdRef.current, userId, businessUnit, branchId, messages: current });
      } catch (e) { console.error(e); }
    }
    clearDraft(userId);
    lastSqlRef.current = '';
    exportRowsRef.current = [];
    setDebugQueries([]);
    setMessages([]);
    setConversationId(null);
    setView('chat');
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || isTyping) return;

    const previousUsefulAssistant = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === 'assistant' && m.text.trim().length > 0 && !isDownloadInstruction(m.text));
    const userMsg: ChatMessage = { id: uid('u'), role: 'user', text };
    const baseline = [...messagesRef.current, userMsg];
    setMessages(baseline);
    setInput('');
    setIsTyping(true);
    setDebugQueries([]);
    exportRowsRef.current = [];
    const shouldPrepareDownload = wantsDownload(text) || wantsTabularDownload(text) || (Boolean(previousUsefulAssistant) && isDownloadOnlyRequest(text));
    const shouldPreferCsv = wantsTabularDownload(text);
    const shouldPreferWord = wantsTextReport(text);
    const shouldUsePreviousAnswer = shouldPrepareDownload && Boolean(previousUsefulAssistant) && isDownloadOnlyRequest(text);
    const previousLooksLikeList = previousUsefulAssistant ? extractLowStockRows(previousUsefulAssistant.text).length > 0 : false;
    const shouldExportCsvFromContext =
      shouldPreferCsv ||
      (shouldPrepareDownload && previousLooksLikeList) ||
      (shouldUsePreviousAnswer && impliesCsvFromPrevious(previousUsefulAssistant?.text ?? ''));
    const attachCsvRows = (rawRows: any[], sourceLabel: string, filenamePrefix = 'reporte') => {
      const rows = normalizeCsvRows(rawRows);
      const branchToken = safeFileToken(branchName || 'sucursal', 'sucursal');
      const dateToken = new Date().toISOString().slice(0, 10);
      setMessages([
        ...baseline,
        {
          id: uid('a'),
          role: 'assistant',
          text: `Listo. Preparé el CSV con ${rows.length} registro${rows.length > 1 ? 's' : ''} ${sourceLabel}.`,
          attachment: {
            filename: `${filenamePrefix}_${branchToken}_${dateToken}.csv`,
            mimeType: 'text/csv;charset=utf-8;',
            content: '﻿' + rowsToCsv(rows),
            label: `Descargar CSV (${rows.length} fila${rows.length > 1 ? 's' : ''})`,
          },
        },
      ]);
      setIsTyping(false);
      setStatusLabel('');
    };

    if ((isSalesReportRequest(text) || isSalesSummaryRequest(text)) && !shouldPrepareDownload) {
      try {
        const resolvedBranchId = await resolveBranchId(branchId);
        const bu = businessUnit || 'materiales';
        const range = resolveSalesReportRange(text);
        const sql = `SELECT i.id AS venta_id,
       i.created_at,
       COALESCE(i.nombre_cliente, 'Mostrador') AS cliente,
       COALESCE(i.payment_type, 'Sin especificar') AS tipo_pago,
       COUNT(it.product_id) AS productos,
       COALESCE(SUM(COALESCE(it.line_total, it.qty * it.unit_price)), 0) AS total
FROM inventory_transactions i
JOIN inventory_transaction_items it ON it.transaction_id = i.id
WHERE i.type = 'SALE'
  AND i.is_deleted = false
  AND i.business_unit = '${bu}'
  AND i.branch_id = ${resolvedBranchId ?? 'NULL'}
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date >= '${range.from}'
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date < '${range.to}'
GROUP BY i.id, i.created_at, i.nombre_cliente, i.payment_type
ORDER BY i.created_at DESC`;
        const result = await executeTool('ejecutar_sql', { consulta: sql, proposito: `Reporte de ventas de ${range.label}` }, {
          businessUnit: bu,
          branchCode: branchId,
          branchName,
          branchId: resolvedBranchId,
        });
        const parsed = JSON.parse(result);
        setDebugQueries([{ sql, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: `Reporte de ventas de ${range.label}` }]);
        if (!parsed?.error && Array.isArray(parsed?.datos)) {
          setMessages([
            ...baseline,
            {
              id: uid('a'),
              role: 'assistant',
              text: buildSalesReportFallback(parsed.datos, { branchName, businessUnit: bu, requestText: range.label }),
            },
          ]);
          setIsTyping(false);
          setStatusLabel('');
          lastSqlRef.current = sql;
          exportRowsRef.current = parsed.datos;
          return;
        }
      } catch (error) {
        console.error('No se pudo generar reporte determinístico de ventas:', error);
      }
    }

    if (isRecurringCustomersRequest(text) && !shouldPrepareDownload) {
      try {
        const resolvedBranchId = await resolveBranchId(branchId);
        const bu = businessUnit || 'materiales';
        const isConcrete = bu === 'concretera';
        const txTable = isConcrete ? 'concrete_inventory_transactions' : 'inventory_transactions';
        const itemTable = isConcrete ? 'concrete_inventory_transaction_items' : 'inventory_transaction_items';
        const buFilter = isConcrete ? '' : `  AND i.business_unit = '${bu}'\n`;
        const sql = `SELECT COALESCE(NULLIF(TRIM(i.nombre_cliente), ''), 'Mostrador') AS cliente,
       COUNT(DISTINCT i.id) AS frecuencia,
       COALESCE(SUM(COALESCE(it.line_total, it.qty * it.unit_price)), 0) AS total
FROM ${txTable} i
JOIN ${itemTable} it ON it.transaction_id = i.id
WHERE i.type = 'SALE'
  AND i.is_deleted = false
${buFilter}  AND i.branch_id = ${resolvedBranchId ?? 'NULL'}
GROUP BY COALESCE(NULLIF(TRIM(i.nombre_cliente), ''), 'Mostrador')
ORDER BY frecuencia DESC, total DESC
LIMIT 20`;
        const result = await executeTool('ejecutar_sql', { consulta: sql, proposito: 'Clientes más recurrentes por frecuencia y monto acumulado' }, {
          businessUnit: bu,
          branchCode: branchId,
          branchName,
          branchId: resolvedBranchId,
        });
        const parsed = JSON.parse(result);
        setDebugQueries([{ sql, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: 'Clientes más recurrentes' }]);
        if (!parsed?.error && Array.isArray(parsed?.datos)) {
          setMessages([
            ...baseline,
            {
              id: uid('a'),
              role: 'assistant',
              text: buildRecurringCustomersReport(parsed.datos, { branchName, businessUnit: bu }),
            },
          ]);
          setIsTyping(false);
          setStatusLabel('');
          lastSqlRef.current = sql;
          exportRowsRef.current = parsed.datos;
          return;
        }
      } catch (error) {
        console.error('No se pudo generar reporte determinístico de clientes recurrentes:', error);
      }
    }

    if (isPurchasesReportRequest(text) && !shouldPrepareDownload) {
      try {
        const resolvedBranchId = await resolveBranchId(branchId);
        const bu = businessUnit || 'materiales';
        const range = resolveSalesReportRange(text);
        const isConcrete = bu === 'concretera';
        const txTable = isConcrete ? 'concrete_inventory_transactions' : 'inventory_transactions';
        const itemTable = isConcrete ? 'concrete_inventory_transaction_items' : 'inventory_transaction_items';
        const supplierTable = isConcrete ? 'concrete_suppliers' : 'suppliers';
        const buFilter = isConcrete ? '' : `  AND i.business_unit = '${bu}'\n`;
        const sqlWithSupplier = `SELECT i.id AS compra_id,
       i.created_at,
       COALESCE(s.name, i.nombre_cliente, 'Proveedor no especificado') AS proveedor,
       COUNT(it.product_id) AS productos,
       COALESCE(SUM(COALESCE(it.line_total, it.qty * it.unit_price)), 0) AS total
FROM ${txTable} i
JOIN ${itemTable} it ON it.transaction_id = i.id
LEFT JOIN ${supplierTable} s ON s.id = i.supplier_id
WHERE i.type = 'PURCHASE'
  AND i.is_deleted = false
${buFilter}  AND i.branch_id = ${resolvedBranchId ?? 'NULL'}
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date >= '${range.from}'
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date < '${range.to}'
GROUP BY i.id, i.created_at, s.name, i.nombre_cliente
ORDER BY i.created_at DESC`;
        const sqlWithoutSupplier = `SELECT i.id AS compra_id,
       i.created_at,
       COALESCE(i.nombre_cliente, 'Proveedor no especificado') AS proveedor,
       COUNT(it.product_id) AS productos,
       COALESCE(SUM(COALESCE(it.line_total, it.qty * it.unit_price)), 0) AS total
FROM ${txTable} i
JOIN ${itemTable} it ON it.transaction_id = i.id
WHERE i.type = 'PURCHASE'
  AND i.is_deleted = false
${buFilter}  AND i.branch_id = ${resolvedBranchId ?? 'NULL'}
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date >= '${range.from}'
  AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date < '${range.to}'
GROUP BY i.id, i.created_at, i.nombre_cliente
ORDER BY i.created_at DESC`;
        const runPurchaseSql = async (sql: string) => {
          const result = await executeTool('ejecutar_sql', { consulta: sql, proposito: `Reporte de compras de ${range.label}` }, {
            businessUnit: bu,
            branchCode: branchId,
            branchName,
            branchId: resolvedBranchId,
          });
          return JSON.parse(result);
        };
        let sql = sqlWithSupplier;
        let parsed = await runPurchaseSql(sqlWithSupplier);
        if (parsed?.error) {
          sql = sqlWithoutSupplier;
          parsed = await runPurchaseSql(sqlWithoutSupplier);
        }
        setDebugQueries([{ sql, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: `Reporte de compras de ${range.label}` }]);
        if (!parsed?.error && Array.isArray(parsed?.datos)) {
          setMessages([
            ...baseline,
            {
              id: uid('a'),
              role: 'assistant',
              text: buildPurchasesReport(parsed.datos, { branchName, businessUnit: bu, requestText: range.label }),
            },
          ]);
          setIsTyping(false);
          setStatusLabel('');
          lastSqlRef.current = sql;
          exportRowsRef.current = parsed.datos;
          return;
        }
      } catch (error) {
        console.error('No se pudo generar reporte determinístico de compras:', error);
      }
    }

    if (shouldPrepareDownload && shouldExportCsvFromContext && isLowStockProductsRequest(`${text}\n${previousUsefulAssistant?.text ?? ''}`)) {
      try {
        const resolvedBranchId = await resolveBranchId(branchId);
        const branchFilter = resolvedBranchId ? `s.branch_id = ${resolvedBranchId}` : '1 = 1';
        const bu = businessUnit === 'concretera' ? 'concretera' : 'materiales';
        const sql = bu === 'concretera'
          ? `SELECT p.name AS producto, s.qty_base AS stock, p.min_stock AS minimo
FROM concrete_inventory_stock s
JOIN concrete_products p ON s.product_id = p.id
WHERE ${branchFilter}
  AND COALESCE(p.is_active, true) = true
  AND COALESCE(p.min_stock, 0) > 0
  AND COALESCE(s.qty_base, 0) < COALESCE(p.min_stock, 0)
ORDER BY s.qty_base ASC, p.name ASC`
          : `SELECT p.name AS producto, s.qty_base AS stock, p.min_stock AS minimo
FROM inventory_stock s
JOIN products p ON s.product_id = p.id
WHERE ${branchFilter}
  AND p.business_unit = '${bu}'
  AND COALESCE(p.is_active, true) = true
  AND COALESCE(p.min_stock, 0) > 0
  AND COALESCE(s.qty_base, 0) < COALESCE(p.min_stock, 0)
ORDER BY s.qty_base ASC, p.name ASC`;
        const result = await executeTool('ejecutar_sql', { consulta: sql, proposito: 'Exportar productos con stock bajo a CSV' }, {
          businessUnit: bu,
          branchCode: branchId,
          branchName,
          branchId: resolvedBranchId,
        });
        const parsed = JSON.parse(result);
        setDebugQueries([{ sql, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: 'Exportar productos con stock bajo a CSV' }]);
        if (!parsed?.error && Array.isArray(parsed?.datos) && parsed.datos.length > 0) {
          attachCsvRows(parsed.datos, 'con stock bajo', 'productos_stock_bajo');
          return;
        }
      } catch (error) {
        console.error('No se pudo generar CSV determinístico de stock bajo:', error);
      }
    }

    if (shouldPrepareDownload && shouldExportCsvFromContext && wantsExactSqlExport(text) && lastSqlRef.current) {
      try {
        const result = await executeTool('ejecutar_sql', {
          consulta: lastSqlRef.current,
          proposito: 'Exportar el resultado de la última sentencia SQL a CSV',
        }, {
          businessUnit,
          branchCode: branchId,
          branchName,
          branchId: await resolveBranchId(branchId),
        });
        const parsed = JSON.parse(result);
        setDebugQueries([{ sql: lastSqlRef.current, rows: parsed?.filas, error: parsed?.error, data: parsed?.datos, label: 'Exportar última sentencia SQL a CSV' }]);
        if (!parsed?.error && Array.isArray(parsed?.datos) && parsed.datos.length > 0) {
          attachCsvRows(parsed.datos, 'de la última sentencia SQL', 'resultado_sql');
          return;
        }
      } catch (error) {
        console.error('No se pudo exportar la última sentencia SQL:', error);
      }
    }

    if (shouldPrepareDownload && shouldExportCsvFromContext && previousUsefulAssistant) {
      const rows = extractLowStockRows(previousUsefulAssistant.text);
      if (rows.length > 0) {
        attachCsvRows(rows, 'del reporte anterior', 'productos_stock_bajo');
        return;
      }
    }

    // Contexto completo de la conversación para Ollama
    const wireHistory: OllamaMessage[] = baseline.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const assistantId = uid('a');
    let gotText = false;

    try {
      const runAgent = isOpenAIProviderEnabled ? runOpenAIAgent : runOllamaAgent;
      const finalText = await runAgent(
        {
          ctx: { businessUnit, branchCode: branchId, branchName, lastSql: lastSqlRef.current || undefined },
          onStatus: (label) => setStatusLabel(label),
          onQuery: (info) => {
            setDebugQueries((prev) => [...prev, info]);
            if (!info.error && info.sql) lastSqlRef.current = info.sql; // recordar para continuidad
            if (Array.isArray(info.data) && info.data.length) {
              exportRowsRef.current = info.data;
            }
          },
          onToken: (_chunk, full) => {
            if (full.trim()) gotText = true;
            setIsTyping(false);
            setStatusLabel('');
            // Updater puro: detecta existencia en `prev` (compatible con StrictMode)
            setMessages((prev) => {
              if (!prev.some((m) => m.id === assistantId)) {
                return [...prev, { id: assistantId, role: 'assistant', text: full }];
              }
              return prev.map((m) => (m.id === assistantId ? { ...m, text: full } : m));
            });
          },
        },
        wireHistory,
      );

      if (shouldPrepareDownload && finalText?.trim()) {
        const rows = normalizeCsvRows(exportRowsRef.current);
        const branchToken = safeFileToken(branchName || 'sucursal', 'sucursal');
        const dateToken = new Date().toISOString().slice(0, 10);
        const useCsv = rows.length > 0 && (shouldPreferCsv || previousLooksLikeList || (!shouldPreferWord && rows.length > 1));
        if (shouldPreferCsv && rows.length === 0) {
          setMessages((prev) => {
            if (!prev.some((m) => m.id === assistantId)) {
              return [...prev, { id: assistantId, role: 'assistant', text: finalText.trim() }];
            }
            return prev.map((m) => (m.id === assistantId ? { ...m, text: finalText.trim() } : m));
          });
          return;
        }
        const reportText = shouldUsePreviousAnswer || isDownloadInstruction(finalText)
          ? previousUsefulAssistant?.text.trim() || finalText.trim()
          : finalText.trim();
        const attachment = useCsv
          ? {
              filename: `reporte_${branchToken}_${dateToken}.csv`,
              mimeType: 'text/csv;charset=utf-8;',
              content: '﻿' + rowsToCsv(rows),
              label: `Descargar CSV (${rows.length} fila${rows.length > 1 ? 's' : ''})`,
            }
          : {
              filename: `informe_${branchToken}_${dateToken}.doc`,
              mimeType: 'application/msword;charset=utf-8;',
              content: reportToWordHtml(reportText),
              label: 'Descargar Word',
            };

        setMessages((prev) => {
          const assistantText = useCsv
            ? `Listo. Preparé el CSV con ${rows.length} registro${rows.length > 1 ? 's' : ''}.`
            : finalText.trim();
          if (!prev.some((m) => m.id === assistantId)) {
            return [...prev, { id: assistantId, role: 'assistant', text: assistantText, attachment }];
          }
          return prev.map((m) => (m.id === assistantId ? { ...m, text: assistantText, attachment } : m));
        });
      }

      // Fallback: el modelo no produjo texto (p. ej. contexto saturado o consulta fallida).
      if (!gotText && !finalText?.trim()) {
        const rows = normalizeCsvRows(exportRowsRef.current);
        if (rows.length > 0 && isSalesReportRequest(text)) {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              text: buildSalesReportFallback(rows, { branchName, businessUnit, requestText: text }),
            },
          ]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: uid('a'),
            role: 'assistant',
            text: 'No logré completar la consulta esta vez. Intenta reformular la pregunta o ' +
              'pídeme un período/sucursal más específico. (Revisa el panel de "consultas SQL" para ver qué se ejecutó.)',
          },
        ]);
      }
    } catch (err) {
      console.error('Error con Ollama:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: uid('e'),
          role: 'assistant',
          text: isOpenAIProviderEnabled
            ? 'No pude conectar con OpenAI. Verifica que la función ai-chat esté desplegada y que OPENAI_API_KEY esté configurada en Supabase secrets.'
            : 'No pude conectar con el modelo (Ollama llama3.1). Verifica que el servidor esté activo en ' +
              (import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434') + '.',
        },
      ]);
    } finally {
      setIsTyping(false);
      setStatusLabel('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-[61] flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl shadow-slate-900/30 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Asistente IA"
      >
        {/* Header */}
        <header className="relative overflow-hidden bg-slate-900 px-5 py-5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-10 h-32 w-32 rounded-full bg-orange-600/20 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30">
                <SparkIcon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-white">
                  {view === 'history' ? 'Historial' : 'Asistente IA'}
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {branchName || 'En línea'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {view === 'chat' ? (
                <>
                  <button
                    onClick={startNewChat}
                    title="Nuevo chat"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button
                    onClick={openHistory}
                    title="Historial de conversaciones"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v5h5" />
                      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                      <path d="M12 7v5l4 2" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setView('chat')}
                  title="Volver al chat"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* ===================== Vista HISTORIAL ===================== */}
        {view === 'history' ? (
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
            {loadingHistory && (
              <div className="flex items-center justify-center py-10 text-sm font-semibold text-slate-400">
                Cargando historial…
              </div>
            )}
            {!loadingHistory && history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-slate-500">Sin conversaciones guardadas</p>
                <p className="mt-1 text-xs text-slate-400">Tus chats aparecerán aquí al cerrarlos.</p>
              </div>
            )}
            {history.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-orange-400 hover:shadow-md hover:shadow-orange-500/10"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white">
                  <SparkIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{c.title}</p>
                  <p className="text-[11px] font-medium text-slate-400">
                    {c.messageCount} mensajes · {fmtDate(c.updatedAt)}
                  </p>
                </div>
                <span
                  onClick={(e) => removeConversation(e, c.id)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Eliminar"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        ) : (
          /* ===================== Vista CHAT ===================== */
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
              {messages.length === 0 && (
                <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-xl shadow-orange-500/30">
                    <SparkIcon className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">
                    Hola{userName ? `, ${userName}` : ''} 👋
                  </h3>
                  <p className="mt-1.5 text-sm font-medium text-slate-500">
                    Pregúntame sobre ventas, inventario, clientes o flota. Estoy aquí para ayudarte.
                  </p>
                  <div className="mt-6 flex w-full flex-col gap-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => send(p.prompt)}
                        className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-orange-400 hover:shadow-md hover:shadow-orange-500/10"
                      >
                        <SparkIcon className="h-4 w-4 text-orange-500" />
                        <span className="flex-1">{p.label}</span>
                        <span className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mx-auto w-full max-w-2xl space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/20">
                      <SparkIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'whitespace-pre-wrap rounded-br-md bg-slate-900 text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {m.role === 'assistant' ? <MessageContent text={m.text} /> : m.text}
                    {m.role === 'assistant' && m.attachment && (
                      <button
                        type="button"
                        onClick={() => downloadFile(m.attachment!.content, m.attachment!.filename, m.attachment!.mimeType)}
                        className="mt-3 flex max-w-full items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-left text-xs font-bold text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
                        title={m.attachment.filename}
                      >
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        <span className="min-w-0 truncate">{m.attachment.label}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md">
                    <SparkIcon className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400" />
                    </span>
                    {statusLabel && (
                      <span className="text-xs font-semibold text-slate-500">{statusLabel}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Panel de consultas SQL ejecutadas (debug) */}
              {debugQueries.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    onClick={() => setShowDebug((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" />
                      </svg>
                      {debugQueries.length} consulta{debugQueries.length > 1 ? 's' : ''} SQL ejecutada{debugQueries.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-400">{showDebug ? '▲' : '▼'}</span>
                  </button>
                  {showDebug && (
                    <div className="space-y-2 border-t border-slate-100 px-3 py-2">
                      {debugQueries.map((q, i) => (
                        <div key={i} className="rounded-lg bg-slate-900 p-2.5">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-orange-300">{q.sql}</pre>
                          <p className={`mt-1.5 text-[10px] font-bold ${q.error ? 'text-red-400' : 'text-green-400'}`}>
                            {q.error ? `✕ ${q.error}` : `✓ ${q.rows ?? 0} fila(s)`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-slate-200 bg-white px-4 py-3">
              <div className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2 transition-colors focus-within:border-orange-400 focus-within:bg-white">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Escribe tu mensaje..."
                  className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || isTyping}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/30 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  aria-label="Enviar"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] font-medium text-slate-400">
                Presiona Enter para enviar · Shift+Enter para nueva línea
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default AssistantDrawer;
