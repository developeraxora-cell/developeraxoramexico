import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, ClipboardList, ShoppingCart, Package, Users, Edit, Trash2, Plus, X, FileText, RefreshCw, Truck,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { fetchAuditLogs, type AuditQueryRow, type AuditActionType, type AuditEntityType } from '../../services/audit/audit.service';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  CREAR:      { label: 'Crear',      icon: Plus,    bg: 'bg-green-100',  text: 'text-green-700'  },
  ACTUALIZAR: { label: 'Editar',     icon: Edit,    bg: 'bg-blue-100',   text: 'text-blue-700'   },
  ELIMINAR:   { label: 'Eliminar',   icon: Trash2,  bg: 'bg-red-100',    text: 'text-red-700'    },
  VENTA:      { label: 'Venta',      icon: ShoppingCart, bg: 'bg-orange-100', text: 'text-orange-700' },
  COMPRA:     { label: 'Compra',     icon: ClipboardList, bg: 'bg-purple-100', text: 'text-purple-700' },
};

const ENTITY_ICON: Record<string, React.ElementType> = {
  venta: ShoppingCart,
  producto: Package,
  cliente: Users,
  compra: ClipboardList,
  proveedor: Truck,
};

interface DeletedSaleAuditItem {
  product_name?: string | null;
  sku?: string | null;
  uom_name?: string | null;
  qty?: number;
  price_type?: string | null;
  unit_price?: number;
  line_total?: number;
  special_authorization?: string | null;
}

interface DeletedSaleAuditSnapshot {
  id?: string;
  created_at?: string;
  customer_name?: string | null;
  payment_method?: string | null;
  subtotal?: number;
  discount_amount?: number;
  total?: number;
  wallet_used?: number;
  notes?: string | null;
  items?: DeletedSaleAuditItem[];
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const getDeletedSaleSnapshot = (row: AuditQueryRow): DeletedSaleAuditSnapshot | null => {
  if (row.action_type !== 'ELIMINAR' || row.entity_type !== 'venta') return null;
  const data = asRecord(row.previous_data);
  if (!data) return null;
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    id: typeof data.id === 'string' ? data.id : row.entity_id,
    created_at: typeof data.created_at === 'string' ? data.created_at : undefined,
    customer_name: typeof data.customer_name === 'string' ? data.customer_name : null,
    payment_method: typeof data.payment_method === 'string' ? data.payment_method : null,
    subtotal: Number(data.subtotal ?? 0),
    discount_amount: Number(data.discount_amount ?? 0),
    total: Number(data.total ?? 0),
    wallet_used: Number(data.wallet_used ?? 0),
    notes: typeof data.notes === 'string' ? data.notes : null,
    items: items
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        product_name: typeof item.product_name === 'string' ? item.product_name : 'Producto sin nombre',
        sku: typeof item.sku === 'string' ? item.sku : null,
        uom_name: typeof item.uom_name === 'string' ? item.uom_name : null,
        qty: Number(item.qty ?? 0),
        price_type: typeof item.price_type === 'string' ? item.price_type : null,
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        special_authorization: typeof item.special_authorization === 'string' ? item.special_authorization : null,
      })),
  };
};

const getCreatedSaleSnapshot = (row: AuditQueryRow): DeletedSaleAuditSnapshot | null => {
  if (row.action_type !== 'VENTA' || row.entity_type !== 'venta') return null;
  const data = asRecord(row.new_data);
  if (!data) return null;
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    id: row.entity_id,
    created_at: row.timestamp,
    customer_name: typeof data.customer_name === 'string' ? data.customer_name : null,
    payment_method: typeof data.payment_method === 'string' ? data.payment_method : null,
    subtotal: Number(data.subtotal ?? data.total ?? 0),
    discount_amount: Number(data.discount_amount ?? 0),
    total: Number(data.total ?? 0),
    wallet_used: Number(data.wallet_used ?? 0),
    notes: typeof data.notes === 'string' ? data.notes : null,
    items: items
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        product_name: typeof item.product_name === 'string' ? item.product_name : 'Producto sin nombre',
        sku: typeof item.product_sku === 'string' ? item.product_sku : null,
        uom_name: typeof item.uom_name === 'string' ? item.uom_name : null,
        qty: Number(item.qty ?? 0),
        price_type: typeof item.price_type === 'string' ? item.price_type : null,
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        special_authorization: typeof item.special_authorization === 'string' ? item.special_authorization : null,
      })),
  };
};

const VinosAuditScreen: React.FC<Props> = () => {
  const [rows, setRows] = useState<AuditQueryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [detail, setDetail] = useState<AuditQueryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAuditLogs({
        module: 'vinos',
        action_type: (actionFilter || undefined) as AuditActionType | undefined,
        entity_type: (entityFilter || undefined) as AuditEntityType | undefined,
        search: search.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(result.rows);
      setTotal(result.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, entityFilter, actionFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const ofToday = rows.filter(r => new Date(r.timestamp) >= today).length;
    const ofWeek = rows.filter(r => new Date(r.timestamp) >= weekAgo).length;
    const eliminations = rows.filter(r => r.action_type === 'ELIMINAR').length;
    const users = new Set(rows.map(r => r.user_id)).size;
    return { ofToday, ofWeek, eliminations, users };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setSearch(''); setEntityFilter(''); setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Eventos en página',  value: rows.length },
          { label: 'Total registros',    value: total },
          { label: 'Eliminaciones',      value: stats.eliminations },
          { label: 'Usuarios distintos', value: stats.users },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Buscar por usuario, descripción, motivo…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={resetFilters} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
            Limpiar
          </button>
          <button onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14}/> Recargar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Entidad</label>
          <select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400">
            <option value="">Todas</option>
            <option value="venta">Ventas</option>
            <option value="compra">Compras</option>
            <option value="producto">Productos</option>
            <option value="cliente">Clientes</option>
            <option value="proveedor">Proveedores</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Acción</label>
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400">
            <option value="">Todas</option>
            <option value="CREAR">Crear</option>
            <option value="ACTUALIZAR">Actualizar</option>
            <option value="ELIMINAR">Eliminar</option>
            <option value="VENTA">Venta</option>
            <option value="COMPRA">Compra</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400" />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardList size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Sin eventos</p>
            <p className="mt-1 text-xs text-slate-400">No hay registros que coincidan con los filtros aplicados.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Fecha','Usuario','Entidad','Acción','Descripción','Motivo',''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => {
                    const action = ACTION_CONFIG[r.action_type] ?? ACTION_CONFIG['ACTUALIZAR'];
                    const Icon = ENTITY_ICON[r.entity_type] ?? ClipboardList;
                    return (
                      <tr key={r.log_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{new Date(r.timestamp).toLocaleString('es-MX')}</td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-bold text-slate-800">{r.user_name ?? '-'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{r.user_id.slice(0, 8)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 uppercase">
                            <Icon size={11}/> {r.entity_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black ${action.bg} ${action.text}`}>
                            <action.icon size={11}/> {action.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 truncate max-w-[260px]">{r.description}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 italic truncate max-w-[200px]">
                          {r.observation ?? r.justification ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setDetail(r)} title="Ver detalle" className="rounded-md border border-slate-200 p-1.5 text-blue-500 hover:bg-blue-50">
                            <FileText size={13}/>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span>Mostrando {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} de {total}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                <span className="px-2">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal detalle */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Detalle del evento</h3>
                <p className="text-[11px] font-bold text-slate-300 font-mono">{detail.log_id.slice(0, 12)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-xl bg-slate-800 p-1.5 hover:bg-slate-700"><X size={16}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha" value={new Date(detail.timestamp).toLocaleString('es-MX')} />
                <Field label="Usuario" value={detail.user_name ?? '-'} />
                <Field label="Acción" value={detail.action_type} />
                <Field label="Entidad" value={`${detail.entity_type} · ${detail.entity_id.slice(0, 12)}`} />
                <Field label="Sucursal" value={detail.branch_name ?? detail.branch_id} />
                <Field label="Módulo" value={detail.module} />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Descripción</p>
                <p className="text-sm font-bold text-slate-900">{detail.description}</p>
              </div>
              {(detail.observation || detail.justification) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Motivo / Observación</p>
                  <p className="text-sm font-bold text-amber-900 italic">{detail.observation ?? detail.justification}</p>
                </div>
              )}
              <SaleAuditDetail
                snapshot={getDeletedSaleSnapshot(detail) ?? getCreatedSaleSnapshot(detail)}
                title={detail.action_type === 'ELIMINAR' ? 'Detalle de venta eliminada' : 'Detalle de venta registrada'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm font-bold text-slate-900 truncate">{value}</p>
  </div>
);

const SaleAuditDetail: React.FC<{ snapshot: DeletedSaleAuditSnapshot | null; title: string }> = ({ snapshot, title }) => {
  if (!snapshot) return null;
  const items = snapshot.items ?? [];

  return (
    <div className="rounded-2xl border border-red-100 bg-white p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-red-500">{title}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{snapshot.customer_name || 'Cliente no registrado'}</p>
          <p className="text-[11px] font-bold text-slate-400">
            {snapshot.created_at ? new Date(snapshot.created_at).toLocaleString('es-MX') : 'Fecha no disponible'} · {snapshot.payment_method || 'Pago no disponible'}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total venta</p>
          <p className="text-lg font-black text-slate-950">{formatCurrency(Number(snapshot.total ?? 0))}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              {['Producto', 'Cant.', 'Tipo', 'Precio', 'Total'].map((label) => (
                <th key={label} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">Este registro no tiene productos guardados en auditoría.</td>
              </tr>
            ) : items.map((item, index) => (
              <tr key={`${item.sku ?? item.product_name}-${index}`}>
                <td className="px-3 py-2">
                  <p className="font-black text-slate-900">{item.product_name || 'Producto sin nombre'}</p>
                  <p className="text-[10px] font-bold text-slate-400">
                    {[item.sku, item.uom_name].filter(Boolean).join(' · ') || 'Sin SKU'}
                  </p>
                  {item.special_authorization && (
                    <p className="mt-0.5 text-[10px] font-bold text-amber-600">Autoriza: {item.special_authorization}</p>
                  )}
                </td>
                <td className="px-3 py-2 font-bold text-slate-700">{Number(item.qty ?? 0).toLocaleString('es-MX')}</td>
                <td className="px-3 py-2 text-slate-500">{item.price_type || '-'}</td>
                <td className="px-3 py-2 font-bold text-slate-900">{formatCurrency(Number(item.unit_price ?? 0))}</td>
                <td className="px-3 py-2 font-black text-slate-950">{formatCurrency(Number(item.line_total ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <SummaryPill label="Subtotal" value={formatCurrency(Number(snapshot.subtotal ?? 0))} />
        <SummaryPill label="Descuento" value={formatCurrency(Number(snapshot.discount_amount ?? 0))} />
        <SummaryPill label="Saldo usado" value={formatCurrency(Number(snapshot.wallet_used ?? 0))} />
        <SummaryPill label="Total" value={formatCurrency(Number(snapshot.total ?? 0))} strong />
      </div>
      {snapshot.notes && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas de venta</p>
          <p className="mt-1 text-xs font-bold text-slate-700">{snapshot.notes}</p>
        </div>
      )}
    </div>
  );
};

const SummaryPill: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className={`mt-0.5 text-sm ${strong ? 'font-black text-slate-950' : 'font-bold text-slate-700'}`}>{value}</p>
  </div>
);

export default VinosAuditScreen;
