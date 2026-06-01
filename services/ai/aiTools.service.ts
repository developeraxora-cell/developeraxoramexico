// Herramienta de texto-a-SQL para el Asistente IA.
// El modelo redacta un SELECT; aquí se valida (doble candado además del RPC) y se
// ejecuta vía la función Postgres `exec_readonly_sql` (solo lectura, tope 500 filas).

import { supabase, isSupabaseConfigured } from '../supabaseClient';

export interface ToolContext {
  businessUnit?: string;
  branchCode?: string;
  branchName?: string;
  branchId?: number | null; // PK numérica resuelta (para usar en los WHERE)
  lastSql?: string;         // último SQL exitoso de la conversación (continuidad)
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export const AI_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'ejecutar_sql',
      description:
        'Ejecuta una consulta SQL de SOLO LECTURA (SELECT) sobre la base de datos PostgreSQL ' +
        'de la empresa y devuelve las filas en JSON. Úsala para responder cualquier pregunta ' +
        'sobre ventas, compras, inventario, clientes, crédito, diésel, etc. Escribe SQL de ' +
        'PostgreSQL válido. Una sola sentencia SELECT, sin punto y coma final.',
      parameters: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description: 'La sentencia SELECT de PostgreSQL a ejecutar.',
          },
          proposito: {
            type: 'string',
            description: 'Breve descripción en español de qué busca la consulta (para mostrar al usuario).',
          },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_reporte_ejecutivo',
      description:
        'Genera de una sola vez TODOS los datos para un reporte/informe ejecutivo de un ' +
        'período: ventas, compras, top productos, top clientes, cartera vencida e inventario ' +
        'bajo, ya filtrados por la sucursal y unidad activas. ÚSALA SOLO para reportes ejecutivos ' +
        'generales del negocio. NO la uses si el usuario pide un reporte específico de ventas, ' +
        'compras, productos, clientes, inventario, cartera o un día/rango concreto; en esos casos ' +
        'usa ejecutar_sql con consultas enfocadas al tema solicitado.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['hoy', 'ayer', 'esta_semana', 'semana_pasada', 'este_mes', 'mes_pasado'],
            description: 'Período del reporte. Si el usuario no lo dice, usa esta_semana.',
          },
          business_unit: {
            type: 'string',
            enum: ['materiales', 'concretera', 'transporteria'],
            description: 'Unidad. Si no se indica, usa la activa.',
          },
        },
      },
    },
  },
];

// Resuelve el id numérico de sucursal desde su código (para inyectar en contexto).
export async function resolveBranchId(branchCode?: string): Promise<number | null> {
  if (!branchCode || !isSupabaseConfigured) return null;
  const { data } = await supabase.from('branches').select('id').eq('code', branchCode).maybeSingle();
  return (data as any)?.id ?? null;
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|call|do|merge|vacuum|reindex|refresh|lock|begin|commit|rollback)\b/i;

/** Valida que sea un único SELECT/WITH de solo lectura. */
function validateSelect(sql: string): string | null {
  const q = sql.trim().replace(/;+\s*$/, ''); // quita ; final
  if (!/^(select|with)\s/i.test(q)) return 'Solo se permiten consultas SELECT.';
  // Ignorar contenido de literales entre comillas para no dar falsos positivos
  // (ej. buscar un texto que contenga "update" o ";" no debe bloquearse).
  const noStrings = q.replace(/'(?:[^']|'')*'/g, "''");
  if (noStrings.includes(';')) return 'No se permiten múltiples sentencias.';
  if (FORBIDDEN.test(noStrings)) return 'La consulta contiene operaciones de escritura no permitidas (solo lectura).';
  return null;
}

async function ejecutarSql(args: any, ctx: ToolContext): Promise<any> {
  const sql: string = args?.consulta ?? '';
  if (!sql.trim()) return { error: 'No se proporcionó ninguna consulta.' };

  const invalid = validateSelect(sql);
  if (invalid) return { error: invalid };

  const cleaned = sql.trim().replace(/;+\s*$/, '');

  // Regla de negocio: las consultas sobre inventory_transactions DEBEN filtrar
  // business_unit (esa tabla mezcla unidades). Si falta, devolvemos un error
  // dirigido para que el modelo lo corrija en el siguiente intento.
  const lower = cleaned.toLowerCase();
  if (/\binventory_transactions\b/.test(lower) && ctx.businessUnit && !lower.includes('business_unit')) {
    return {
      error:
        `Falta el filtro obligatorio business_unit = '${ctx.businessUnit}'. ` +
        `Reescribe la MISMA consulta agregando "AND <alias>.business_unit = '${ctx.businessUnit}'" en el WHERE y reintenta.`,
    };
  }

  const { data, error } = await supabase.rpc('exec_readonly_sql', { query: cleaned });
  if (error) return { error: `Error al ejecutar: ${error.message}` };

  const rows = Array.isArray(data) ? data : [];
  return {
    filas: rows.length,
    truncado: rows.length >= 500,
    datos: rows,
  };
}

// ---------------------------------------------------------------------------
// Reporte ejecutivo: corre todas las consultas y devuelve un paquete de datos.
// ---------------------------------------------------------------------------

const money = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lineAmount = (it: any) => Number(it.line_total ?? (Number(it.qty ?? 0) * Number(it.unit_price ?? 0)));
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const utcBound = (localDate: string, end: boolean) =>
  new Date(`${localDate}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString().slice(0, 19);

function periodRange(period?: string): [string, string, string] {
  const now = new Date();
  const today = isoLocal(now);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const add = (d: Date, n: number) => { const r = new Date(d); r.setDate(d.getDate() + n); return r; };
  switch (period) {
    case 'hoy': return [today, today, 'hoy'];
    case 'ayer': { const y = isoLocal(add(now, -1)); return [y, y, 'ayer']; }
    case 'semana_pasada': { const s = add(monday, -7); const e = add(monday, -1); return [isoLocal(s), isoLocal(e), 'la semana pasada']; }
    case 'este_mes': return [isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)), today, 'este mes'];
    case 'mes_pasado': { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return [isoLocal(s), isoLocal(e), 'el mes pasado']; }
    case 'esta_semana':
    default: return [isoLocal(monday), today, 'esta semana'];
  }
}

async function generarReporteEjecutivo(args: any, ctx: ToolContext): Promise<any> {
  const bu = args.business_unit || ctx.businessUnit || 'materiales';
  const branchId = ctx.branchId ?? null;
  const [from, to, label] = periodRange(args.period);
  const gte = utcBound(from, false);
  const lte = utcBound(to, true);
  const isConcrete = bu === 'concretera';

  const txTable = isConcrete ? 'concrete_inventory_transactions' : 'inventory_transactions';
  const itemsRel = isConcrete ? 'concrete_inventory_transaction_items' : 'inventory_transaction_items';
  const prodTable = isConcrete ? 'concrete_products' : 'products';
  const stockTable = isConcrete ? 'concrete_inventory_stock' : 'inventory_stock';
  const notesTable = isConcrete ? 'concrete_credit_notes' : 'credit_notes';
  const custTable = isConcrete ? 'concrete_credit_customers' : 'credit_customers';

  const txSelect = (type: string) => {
    let q = supabase
      .from(txTable)
      .select(`id, nombre_cliente, ${itemsRel}(qty, unit_price, line_total, product_id)`)
      .eq('type', type).eq('is_deleted', false)
      .gte('created_at', gte).lte('created_at', lte);
    if (!isConcrete) q = q.eq('business_unit', bu);
    if (branchId) q = q.eq('branch_id', branchId);
    return q;
  };

  // 1) Ventas + 2) Compras (en paralelo) + 4) Cartera + 5) Inventario bajo
  const [ventasRes, comprasRes, carteraRes, stockRes] = await Promise.all([
    txSelect('SALE'),
    txSelect('PURCHASE'),
    (() => {
      let q = supabase.from(notesTable)
        .select(`balance, due_date, folio, ${custTable}(name)`)
        .gt('balance', 0).lt('due_date', isoLocal(new Date()));
      if (!isConcrete) q = q.eq('business_unit', bu);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),
    (() => {
      let q = supabase.from(stockTable).select(`product_id, qty_base, ${prodTable}(name, min_stock, business_unit, is_active)`);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),
  ]);

  // Ventas
  const ventas = (ventasRes.data ?? []) as any[];
  let totalVentas = 0; const perProd: Record<string, number> = {}; const perCli: Record<string, number> = {};
  for (const t of ventas) {
    for (const it of (t[itemsRel] ?? [])) {
      const a = lineAmount(it); totalVentas += a; perProd[it.product_id] = (perProd[it.product_id] ?? 0) + a;
    }
    // importe por cliente (suma de sus líneas)
    const cliTotal = (t[itemsRel] ?? []).reduce((s: number, it: any) => s + lineAmount(it), 0);
    const cli = t.nombre_cliente || 'Mostrador';
    perCli[cli] = (perCli[cli] ?? 0) + cliTotal;
  }

  // Compras
  const compras = (comprasRes.data ?? []) as any[];
  let totalCompras = 0;
  for (const t of compras) for (const it of (t[itemsRel] ?? [])) totalCompras += lineAmount(it);

  // Top productos (nombres)
  const topProdIds = Object.entries(perProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const names: Record<string, string> = {};
  if (topProdIds.length) {
    const { data: pr } = await supabase.from(prodTable).select('id, name').in('id', topProdIds.map(([id]) => id));
    for (const p of (pr ?? []) as any[]) names[p.id] = p.name;
  }

  // Cartera vencida
  const cartera = (carteraRes.data ?? []) as any[];
  const saldoVencido = cartera.reduce((s, r) => s + Number(r.balance ?? 0), 0);

  // Inventario bajo
  const lowStock = (stockRes.data ?? [])
    .map((r: any) => ({ nombre: r[prodTable]?.name, min: Number(r[prodTable]?.min_stock ?? 0), actual: Number(r.qty_base ?? 0), bu: r[prodTable]?.business_unit, activo: r[prodTable]?.is_active }))
    .filter((p: any) => p.activo !== false && (isConcrete || p.bu === bu) && p.min > 0 && p.actual < p.min)
    .sort((a: any, b: any) => a.actual - b.actual);

  const topClientes = Object.entries(perCli).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const margenBruto = totalVentas - totalCompras;

  return {
    periodo: label,
    rango_fechas: from === to ? from : `${from} a ${to}`,
    unidad: bu,
    sucursal: ctx.branchName || ctx.branchCode || 'todas',
    ventas: { total: `$${money(totalVentas)}`, tickets: ventas.length, ticket_promedio: ventas.length ? `$${money(totalVentas / ventas.length)}` : '$0.00' },
    compras: { total: `$${money(totalCompras)}`, ordenes: compras.length },
    margen_bruto_aprox: `$${money(margenBruto)}`,
    top_productos: topProdIds.map(([id, v]) => ({ producto: names[id] || `#${id}`, importe: `$${money(v)}` })),
    top_clientes: topClientes.map(([cli, v]) => ({ cliente: cli, importe: `$${money(v)}` })),
    cartera_vencida: { notas: cartera.length, saldo: `$${money(saldoVencido)}`, top: cartera.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 5).map((r) => ({ cliente: r[custTable]?.name, folio: r.folio, vencio: r.due_date, saldo: `$${money(Number(r.balance ?? 0))}` })) },
    inventario_bajo: { productos: lowStock.length, detalle: lowStock.slice(0, 10).map((p: any) => ({ producto: p.nombre, stock: p.actual, minimo: p.min })) },
    nota: 'Margen bruto = ventas − compras del período (aproximado; no incluye gastos operativos ni costo exacto por producto).',
  };
}

/** Ejecuta una tool y devuelve el resultado serializado (string JSON) para el modelo. */
export async function executeTool(name: string, args: any, ctx: ToolContext): Promise<string> {
  if (!isSupabaseConfigured) {
    return JSON.stringify({ error: 'Base de datos no configurada.' });
  }
  try {
    if (name === 'ejecutar_sql') return JSON.stringify(await ejecutarSql(args, ctx));
    if (name === 'generar_reporte_ejecutivo') return JSON.stringify(await generarReporteEjecutivo(args, ctx));
    return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
  } catch (e: any) {
    return JSON.stringify({ error: `Fallo al consultar: ${e?.message || String(e)}` });
  }
}
