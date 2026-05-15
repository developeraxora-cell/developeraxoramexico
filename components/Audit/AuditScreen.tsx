import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import type { Branch, User } from '../../types';
import { auditReadService, type AuditLogRow } from '../../services/audit/audit-read.service';

interface AuditScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
  module?: 'materiales' | 'concretera' | 'transporteria';
  title?: string;
  subtitle?: string;
}

const PAGE_SIZE = 15;

const AuditScreen: React.FC<AuditScreenProps> = ({
  selectedBranchId,
  branches,
  module = 'materiales',
  title = 'Auditorias',
  subtitle = 'Trazabilidad de cambios en Materiales por sucursal.',
}) => {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const effectiveSearch = debouncedSearch.length >= 3 ? debouncedSearch : '';

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, dateFrom, dateTo, branchId, module]);

  useEffect(() => {
    if (!branchId) {
      setRows([]);
      setTotal(0);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await auditReadService.list({
          module: module as 'materiales' | 'concretera' | 'transporteria' | 'materials',
          branch_id: branchId,
          action_type: actionFilter || undefined,
          entity_type: entityFilter || undefined,
          search: effectiveSearch || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: PAGE_SIZE,
          signal: controller.signal,
        });

        setRows(result.rows);
        setTotal(result.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'No se pudo cargar la auditoría.';
        setError(message);
        setRows([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    };

    void run();
    return () => {
      controller.abort();
    };
  }, [actionFilter, branchId, dateFrom, dateTo, effectiveSearch, entityFilter, module, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  };

  const extractObservation = (row: AuditLogRow) => {
    if (typeof row.observation === 'string' && row.observation.trim()) {
      return row.observation.trim();
    }

    const candidateKeys = ['notes', 'note', 'observacion', 'observation', 'reason'];
    const snapshots = [row.new_data, row.previous_data];

    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      for (const key of candidateKeys) {
        const value = snapshot[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return row.justification?.trim() || '—';
  };

  const badgeClass = (actionType: AuditLogRow['action_type']) => {
    switch (actionType) {
      case 'CREAR':
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-700';
      case 'ACTUALIZAR':
      case 'UPDATE':
        return 'bg-amber-100 text-amber-700';
      case 'ELIMINAR':
      case 'DELETE':
        return 'bg-red-100 text-red-700';
      case 'VENTA':
      case 'SALE':
        return 'bg-sky-100 text-sky-700';
      case 'COMPRA':
      case 'PURCHASE':
        return 'bg-violet-100 text-violet-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const formatActionLabel = (actionType: AuditLogRow['action_type']) => {
    switch (actionType) {
      case 'CREAR':
      case 'CREATE':
        return 'Crear';
      case 'ACTUALIZAR':
      case 'UPDATE':
        return 'Actualizar';
      case 'ELIMINAR':
      case 'DELETE':
        return 'Eliminar';
      case 'VENTA':
      case 'SALE':
        return 'Venta';
      case 'COMPRA':
      case 'PURCHASE':
        return 'Compra';
      default:
        return actionType;
    }
  };

  const formatEntityLabel = (entityType: AuditLogRow['entity_type']) => {
    switch (entityType) {
      case 'producto':
      case 'product':
        return 'Producto';
      case 'cliente':
      case 'client':
        return 'Cliente';
      case 'venta':
      case 'sale':
        return 'Venta';
      case 'compra':
      case 'purchase':
        return 'Compra';
      case 'nota_credito':
        return 'Nota de crédito';
      case 'abono_credito':
        return 'Abono de crédito';
      default:
        return entityType;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 ">
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
        {(title || subtitle) && (
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
              <ClipboardList className="w-7 h-7 text-orange-500" />
              {title}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {subtitle}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descripción, usuario, entidad u observación (mín. 3 letras)..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Todas las acciones</option>
            <option value="CREAR">Crear</option>
            <option value="ACTUALIZAR">Actualizar</option>
            <option value="ELIMINAR">Eliminar</option>
            <option value="VENTA">Venta</option>
            <option value="COMPRA">Compra</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Todas las entidades</option>
            <option value="producto">Producto</option>
            <option value="cliente">Cliente</option>
            <option value="venta">Venta</option>
            <option value="compra">Compra</option>
            <option value="nota_credito">Nota de crédito</option>
            <option value="abono_credito">Abono de crédito</option>
          </select>

          <div className="grid grid-cols-2 gap-3 xl:col-span-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {!auditReadService.isConfigured() && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-4 py-3 text-sm font-bold">
          La auditoría no está configurada. Verifica `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` o `VITE_AUDIT_API_URL`.
        </div>
      )}



      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Fecha</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Acción</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Entidad</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Descripción</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Usuario</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-left">Observación / Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando auditoría...</td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No hay registros de auditoría para esta sucursal.</td>
                </tr>
              )}

              {!isLoading && rows.map((row) => (
                <tr key={row.log_id} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-semibold text-slate-600">{formatDateTime(row.timestamp)}</td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${badgeClass(row.action_type)}`}>
                      {formatActionLabel(row.action_type)}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-black uppercase text-slate-700">{formatEntityLabel(row.entity_type)}</td>
                  <td className="p-4 text-xs font-semibold text-slate-700">
                    <p>{row.description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">ID: {row.entity_id}</p>
                  </td>
                  <td className="p-4 text-xs font-semibold text-slate-600">
                    <p>{row.user_name || '—'}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{row.user_id}</p>
                  </td>
                  <td className="p-4 text-xs font-semibold text-slate-600 max-w-[260px]">
                    <p className="line-clamp-2 break-words">{extractObservation(row)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-500">
          Mostrando {rows.length} de {total} registros
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[11px] font-black text-slate-700">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

    </div>
  );
};

export default AuditScreen;
