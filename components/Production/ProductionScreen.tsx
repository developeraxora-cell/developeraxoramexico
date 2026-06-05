import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Eraser, Factory, Loader2, Package, PackagePlus, Plus, Save, Scale, Trash2, Users, X } from 'lucide-react';
import { Branch, User } from '../../types';
import { catalogService, type Product, type Uom } from '../../services/inventory/catalog.service';
import { productionsService, type ProductionItemRow } from '../../services/inventory/productions.service';
import { logMaterialsAudit } from '../../services/audit/audit.service';

interface ProductionScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

type ScreenMode = 'list' | 'new';

interface ProductionRow {
  id: number;
  date: string;
  responsible: string;
  producer: string;
  observation: string;
  registeredAt: string;
  rawDate: string;
  rawResponsible: string;
  rawProducer: string;
  rawObservation: string;
}

const ADJUST_FACTOR = 0.21; // peso ajustado = peso * pareas + pareas * 0.21

// Mayúsculas + sin acentos, para matchear "ALAMBRÓN" / "ALAMBRON" / "ANILLO"
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('es-MX', { maximumFractionDigits: 3 }) : '-';
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX') : '-');
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-';

const ProductionScreen: React.FC<ProductionScreenProps> = ({ selectedBranchId, currentUser, branches }) => {
  const [mode, setMode] = useState<ScreenMode>('list');
  const [search, setSearch] = useState('');
  const [productions, setProductions] = useState<ProductionRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductionRow | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );
  const branchDbId = selectedBranch?.dbId !== undefined ? String(selectedBranch.dbId) : null;

  const loadList = useCallback(async () => {
    if (!branchDbId) {
      setProductions([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const rows = await productionsService.listByBranch(branchDbId);
      setProductions(rows.map((r) => ({
        id: r.id,
        date: fmtDate(r.production_date),
        responsible: r.responsible ?? '-',
        producer: r.producer ?? '-',
        observation: r.observation ?? '',
        registeredAt: fmtDateTime(r.created_at),
        rawDate: (r.production_date ?? '').slice(0, 10) || today(),
        rawResponsible: r.responsible ?? '',
        rawProducer: r.producer ?? '',
        rawObservation: r.observation ?? '',
      })));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    } finally {
      setListLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => {
    if (mode === 'list') loadList();
  }, [mode, loadList]);

  const handleConfirmDelete = useCallback(async (production: ProductionRow, justification: string) => {
    await productionsService.delete(production.id);
    logMaterialsAudit({
      branch_id: branchDbId ?? '',
      branch_name: selectedBranch?.name ?? null,
      user_id: currentUser.id,
      user_name: currentUser.name,
      action_type: 'ELIMINAR',
      entity_type: 'produccion',
      entity_id: String(production.id),
      description: `Producción eliminada: #${production.id} (responsable ${production.responsible})`,
      justification,
      previous_data: {
        id: production.id,
        production_date: production.rawDate,
        responsible: production.rawResponsible,
        producer: production.rawProducer,
        observation: production.rawObservation,
      },
    });
    await loadList();
  }, [branchDbId, currentUser.id, currentUser.name, loadList, selectedBranch?.name]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {mode === 'list' && (
        <ProductionListView
          productions={productions}
          loading={listLoading}
          error={listError}
          search={search}
          onSearch={setSearch}
          onNew={() => setMode('new')}
          onShowMovements={() => setMovementsOpen(true)}
          onDelete={setDeleteTarget}
        />
      )}

      {movementsOpen && (
        <MovementsModal branchDbId={branchDbId} onClose={() => setMovementsOpen(false)} />
      )}

      {deleteTarget && (
        <DeleteProductionModal
          production={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {mode === 'new' && (
        <NewProductionView
          onBack={() => setMode('list')}
          onSaved={() => setMode('list')}
          selectedBranchId={selectedBranchId}
          currentUser={currentUser}
          branches={branches}
        />
      )}
    </div>
  );
};

// ── Header reutilizable ───────────────────────────────────────────────────────

const ScreenHeader: React.FC<{ title: string; right: React.ReactNode }> = ({ title, right }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
        <Factory size={18} />
      </div>
      <div>
        <h1 className="text-base font-black tracking-tight text-slate-900">{title}</h1>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Módulo Producción</p>
      </div>
    </div>
    {right}
  </div>
);

const ActionButton: React.FC<{
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: 'slate' | 'red';
}> = ({ title, onClick, icon, tone = 'slate' }) => {
  const colors = {
    slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    red: 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${colors[tone]}`}
    >
      {icon}
    </button>
  );
};

// ── Listado ───────────────────────────────────────────────────────────────────

const ProductionListView: React.FC<{
  productions: ProductionRow[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  onShowMovements: () => void;
  onDelete: (production: ProductionRow) => void;
}> = ({ productions, loading, error, search, onSearch, onNew, onShowMovements, onDelete }) => {
  const term = normalize(search.trim());
  const filtered = term
    ? productions.filter((p) =>
        normalize(`${p.id} ${p.date} ${p.responsible} ${p.producer} ${p.observation}`).includes(term))
    : productions;

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Gestión de Producciones"
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onShowMovements}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200"
            >
              <ArrowLeftRight size={15} />
              Entradas y Salidas
            </button>
            <button
              type="button"
              onClick={onNew}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus size={15} />
              Nueva Producción
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar producción por fecha, responsable u observación..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        />

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-900 text-left text-[10px] font-black uppercase tracking-widest text-white">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Observaciones</th>
                  <th className="px-4 py-3">Productor</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-400">
                      <Loader2 size={16} className="mx-auto animate-spin" />
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-400">
                      No hay producciones registradas.
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((production) => (
                  <tr key={production.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-black text-slate-900">{production.id}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{production.date}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{production.responsible}</td>
                    <td className="px-4 py-3 font-bold text-slate-400">{production.observation || '-'}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{production.producer}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <ActionButton title="Eliminar producción" onClick={() => onDelete(production)} icon={<Trash2 size={15} />} tone="red" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs font-bold text-slate-500">
            <span>Mostrando {filtered.length} de {productions.length} producciones</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Modal: entradas y salidas de toda la sucursal ──────────────────────────────

const MovementsModal: React.FC<{
  branchDbId: string | null;
  onClose: () => void;
}> = ({ branchDbId, onClose }) => {
  const [rows, setRows] = useState<ProductionItemRow[]>([]);
  const [unitByProduct, setUnitByProduct] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    if (!branchDbId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [movs, products, uoms] = await Promise.all([
          productionsService.listMovementsByBranch(branchDbId),
          catalogService.listProductsByBranch(branchDbId),
          catalogService.listUoms(),
        ]);
        if (cancelled) return;
        const uomById = new Map(uoms.map((u) => [u.id, u.code || u.name]));
        const map: Record<string, string> = {};
        products.forEach((p) => { map[String(p.id)] = uomById.get(p.base_uom_id) || '-'; });
        setUnitByProduct(map);
        setRows(movs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los movimientos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [branchDbId]);

  const term = normalize(search.trim());
  const filtered = term
    ? rows.filter((r) => normalize(`${r.production_id} ${r.movement} ${r.product_name ?? ''}`).includes(term))
    : rows;

  // Resetea a página 1 al filtrar
  useEffect(() => { setPage(1); }, [search, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
              <ArrowLeftRight size={15} />
            </div>
            <h2 className="text-sm font-black tracking-tight text-slate-900">Entradas y Salidas</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producción, tipo o producto..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {error && <div className="px-4 py-3 text-xs font-semibold text-red-600">{error}</div>}
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Producción</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5">Medida</th>
                <th className="px-4 py-2.5 text-right">Peso Ajustado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400"><Loader2 size={16} className="mx-auto animate-spin" /></td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">Sin movimientos.</td></tr>
              )}
              {!loading && pageRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-black text-slate-900">{r.production_id}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex justify-center rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                      r.movement === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {r.movement === 'ENTRADA' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-slate-700">{r.product_name ?? `#${r.product_id}`}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-500">{unitByProduct[String(r.product_id)] ?? '-'}</td>
                  <td className="px-4 py-2.5 text-right font-black text-slate-700">{fmt(Number(r.qty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] font-bold text-slate-500">
          <span>
            {filtered.length === 0
              ? 'Sin registros'
              : `Mostrando ${start + 1} a ${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-1.5 text-slate-600">{safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Selector de productor + modal de administración ────────────────────────────

interface ProductorRow {
  id: number;
  name: string;
}

const ProductorSelect: React.FC<{
  branchDbId: string | null;
  value: string;
  onChange: (value: string) => void;
}> = ({ branchDbId, value, onChange }) => {
  const [list, setList] = useState<ProductorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const load = useCallback(async () => {
    if (!branchDbId) { setList([]); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await productionsService.listProductores(branchDbId);
      setList(data.map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los productores.');
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Productor</span>
      <div className="mt-1.5 flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        >
          <option value="">{loading ? 'Cargando...' : list.length === 0 ? 'Sin productores — agregá uno' : 'Seleccionar productor...'}</option>
          {list.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdminOpen(true)}
          title="Administrar productores"
          className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-3 text-slate-600 transition hover:bg-slate-200"
        >
          <Users size={15} />
        </button>
      </div>
      {error && <span className="mt-1 block text-[11px] font-semibold text-red-500">{error}</span>}

      {adminOpen && (
        <ProductoresAdminModal
          branchDbId={branchDbId}
          onClose={() => setAdminOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
};

const ProductoresAdminModal: React.FC<{
  branchDbId: string | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}> = ({ branchDbId, onClose, onChanged }) => {
  const [list, setList] = useState<ProductorRow[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchDbId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await productionsService.listProductores(branchDbId);
      setList(data.map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar.');
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!branchDbId) return;
    const clean = name.trim();
    if (!clean) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError(null);
    try {
      await productionsService.createProductor(branchDbId, clean);
      setName('');
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el productor.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await productionsService.deleteProductor(id);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };

  // Animación: monta cerrado, abre en RAF; al cerrar, espera la transición
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 280);
  };

  // ESC cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onMouseDown={close}
      />

      {/* Drawer desde la derecha, slide hacia la izquierda */}
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Administrar productores"
      >
        {/* Header con gradiente */}
        <header className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-orange-50 via-white to-white px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm">
                <Users size={18} />
              </div>
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-900">Productores</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {list.length} {list.length === 1 ? 'registrado' : 'registrados'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Form de alta */}
        <div className="border-b border-slate-100 px-5 py-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nuevo Productor</span>
          <div className="mt-1.5 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder="Nombre completo..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={add}
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Agregar
            </button>
          </div>
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lista</span>
          <div className="mt-2 space-y-1.5">
            {loading && (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            )}
            {!loading && list.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Users size={20} />
                </div>
                <p className="text-xs font-bold text-slate-400">Sin productores todavía.</p>
                <p className="text-[11px] font-semibold text-slate-300">Agregá uno arriba.</p>
              </div>
            )}
            {!loading && list.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition hover:border-orange-200 hover:bg-orange-50/40"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black uppercase text-slate-500 group-hover:bg-orange-100 group-hover:text-orange-600">
                  {p.name.slice(0, 2)}
                </div>
                <span className="flex-1 truncate text-sm font-bold text-slate-700">{p.name}</span>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                  title="Eliminar productor"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <footer className="border-t border-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Eliminar es soft delete · se mantienen producciones registradas
        </footer>
      </aside>
    </div>
  );
};

// ── Nueva producción ───────────────────────────────────────────────────────────

interface FinishedRow {
  key: string;
  productId: string;
  pareas: string;
}

const NewProductionView: React.FC<{
  onBack: () => void;
  onSaved: () => void;
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}> = ({ onBack, onSaved, selectedBranchId, currentUser, branches }) => {
  const branchDbId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    return match?.dbId !== undefined ? String(match.dbId) : null;
  }, [branches, selectedBranchId]);

  const [products, setProducts] = useState<Product[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pesoModalOpen, setPesoModalOpen] = useState(false);
  const responsible = currentUser.name || currentUser.username || currentUser.id;

  // Formulario
  const [date, setDate] = useState(today());
  const [producer, setProducer] = useState('');
  const [observation, setObservation] = useState('');
  const [alambonId, setAlambonId] = useState('');
  const [rows, setRows] = useState<FinishedRow[]>([{ key: crypto.randomUUID(), productId: '', pareas: '' }]);

  const load = useCallback(async () => {
    if (!branchDbId) {
      setProducts([]);
      setStockByProduct({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [productsData, uomsData, stockRows] = await Promise.all([
        catalogService.listProductsByBranch(branchDbId),
        catalogService.listUoms(),
        catalogService.listStockByBranch(branchDbId),
      ]);
      setProducts(productsData);
      setUoms(uomsData);
      setStockByProduct(stockRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.product_id] = Number(r.qty_base ?? 0);
        return acc;
      }, {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  const uomLabel = useCallback((product?: Product) => {
    if (!product) return '-';
    const uom = uoms.find((u) => u.id === product.base_uom_id);
    return uom?.code || uom?.name || '-';
  }, [uoms]);

  const alambonProducts = useMemo(
    () => products.filter((p) => normalize(p.name).includes('ALAMBRON')),
    [products],
  );
  const anilloProducts = useMemo(
    () => products.filter((p) => normalize(p.name).includes('ANILLO')),
    [products],
  );

  // Auto-selecciona el primer ALAMBON disponible
  useEffect(() => {
    if (!alambonId && alambonProducts.length > 0) setAlambonId(String(alambonProducts[0].id));
  }, [alambonProducts, alambonId]);

  const alambon = products.find((p) => String(p.id) === String(alambonId));
  const productById = useCallback(
    (id: string) => products.find((p) => String(p.id) === String(id)),
    [products],
  );

  // Peso ajustado por fila + total (= cantidad usada de alambrón)
  const ajustadoByRow = useMemo(
    () => rows.map((row) => {
      const product = productById(row.productId);
      const peso = Number(product?.peso_unitario ?? 0);
      const pareas = Number(row.pareas || 0);
      return product ? peso * pareas + pareas * ADJUST_FACTOR : 0;
    }),
    [rows, productById],
  );
  const totalUsado = ajustadoByRow.reduce((acc, v) => acc + v, 0);
  const alambonStock = alambon ? Number(stockByProduct[alambon.id] ?? 0) : 0;
  const exceedsStock = Boolean(alambon) && totalUsado > alambonStock;

  const updateRow = (key: string, patch: Partial<FinishedRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { key: crypto.randomUUID(), productId: '', pareas: '' }]);
  const removeRow = (key: string) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));

  const clearForm = () => {
    setDate(today());
    setProducer('');
    setObservation('');
    setRows([{ key: crypto.randomUUID(), productId: '', pareas: '' }]);
  };

  // Anillos válidos -> ENTRADA = peso * pareas (sin el 0.21)
  const buildItems = () => rows.flatMap((row) => {
    const product = productById(row.productId);
    const peso = Number(product?.peso_unitario ?? 0);
    const pareas = Number(row.pareas || 0);
    if (!product || pareas <= 0) return [];
    return [{
      product_id: product.id,
      product_name: product.name,
      qty: peso * pareas,
      pareas,
      peso,
    }];
  });

  const handleSubmit = async () => {
    if (saving) return;
    setError(null);

    if (!branchDbId) { setError('Sucursal inválida.'); return; }
    if (!alambon) { setError('Seleccioná el alambrón (materia prima).'); return; }
    if (!producer.trim()) { setError('Seleccioná el productor.'); return; }
    const items = buildItems();
    if (items.length === 0) { setError('Agregá al menos un anillo con número de pareas.'); return; }
    if (exceedsStock) {
      setError(`La cantidad usada (${fmt(totalUsado)}) supera el stock de alambrón (${fmt(alambonStock)}).`);
      return;
    }

    setSaving(true);
    try {
      await productionsService.process({
        branch_id: branchDbId,
        business_unit: 'materiales',
        date,
        responsible,
        producer: producer.trim(),
        observation: observation.trim() || null,
        alambon_product_id: alambon.id,
        alambon_name: alambon.name,
        alambon_used: totalUsado,
        items,
        created_by: currentUser.id,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la producción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Nueva Producción Interna"
        right={
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft size={15} />
            Volver al Historial
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>
      )}

      {/* Datos generales + acciones */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha de Producción</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsable</span>
            <input
              type="text"
              value={responsible}
              readOnly
              className="mt-1.5 w-full cursor-default rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>


          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Observaciones <span className="text-slate-300">(opcional)</span>
            </span>
            <input
              type="text"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Notas adicionales"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 md:items-end">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || exceedsStock}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Procesando...' : 'Procesar Producción'}
            </button>
            <button
              type="button"
              onClick={clearForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200"
            >
              <Eraser size={15} />
              Limpiar
            </button>
          </div>

          <div>
            <ProductorSelect branchDbId={branchDbId} value={producer} onChange={setProducer} />
          </div>
        </div>
      </div>

      {/* Materia prima: ALAMBON */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Package className="text-orange-500" size={17} />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Materia Prima (Alambón)</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Producto</span>
            <select
              value={alambonId}
              onChange={(e) => setAlambonId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-orange-500"
            >
              {alambonProducts.length === 0 && <option value="">Sin alambón disponible</option>}
              {alambonProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock Actual</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5">
              <span className="font-black text-slate-700">{alambon ? fmt(stockByProduct[alambon.id] ?? 0) : '-'}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{uomLabel(alambon)}</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad Usada (Σ peso ajustado)</span>
            <div
              className={`mt-1.5 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                exceedsStock ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-100'
              }`}
            >
              <span className={`font-black ${exceedsStock ? 'text-red-600' : 'text-slate-700'}`}>{fmt(totalUsado)}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{uomLabel(alambon)}</span>
            </div>
          </div>
        </div>

        {exceedsStock && (
          <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600">
            <AlertTriangle size={15} />
            La cantidad usada ({fmt(totalUsado)} {uomLabel(alambon)}) supera el stock de alambrón ({fmt(alambonStock)} {uomLabel(alambon)}).
          </div>
        )}
      </div>

      {/* Productos terminados: ANILLO */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Package className="text-orange-500" size={17} />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Productos Terminados (Anillos)</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPesoModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200"
            >
              <Scale size={14} />
              Peso
            </button>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-emerald-600"
            >
              <PackagePlus size={14} />
              Agregar
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Producto</th>
                <th className="px-3 py-2.5 text-center">Stock Actual</th>
                <th className="px-3 py-2.5 text-center">Número Pareas</th>
                <th className="px-3 py-2.5 text-center">Peso (kg)</th>
                <th className="px-3 py-2.5 text-center">Peso Ajustado</th>
                <th className="px-3 py-2.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => {
                const product = productById(row.productId);
                const peso = Number(product?.peso_unitario ?? 0);
                const ajustado = ajustadoByRow[index] ?? 0;
                return (
                  <tr key={row.key}>
                    <td className="px-3 py-2.5">
                      <select
                        value={row.productId}
                        onChange={(e) => updateRow(row.key, { productId: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500"
                      >
                        <option value="">Seleccionar anillo...</option>
                        {anilloProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — Stock: {fmt(stockByProduct[p.id] ?? 0)} {uomLabel(p)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-500">
                        {product ? `${fmt(stockByProduct[product.id] ?? 0)} ${uomLabel(product)}` : '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.pareas}
                        onChange={(e) => updateRow(row.key, { pareas: e.target.value })}
                        placeholder="0"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-900 outline-none focus:border-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-slate-600">{product ? fmt(peso) : '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center font-black text-slate-700">
                        {product ? fmt(ajustado) : '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length === 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-slate-400">
              <Loader2 size={15} className="animate-spin" /> Cargando productos...
            </div>
          )}
          {!loading && anilloProducts.length === 0 && (
            <p className="py-3 text-center text-xs font-semibold text-slate-400">No hay productos tipo ANILLO en esta sucursal.</p>
          )}
        </div>
      </div>

      {pesoModalOpen && (
        <PesoModal
          anillos={anilloProducts}
          uomLabel={uomLabel}
          onClose={() => setPesoModalOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
};

// ── Modal: editar peso unitario de anillos ─────────────────────────────────────

const PesoModal: React.FC<{
  anillos: Product[];
  uomLabel: (product?: Product) => string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}> = ({ anillos, uomLabel, onClose, onSaved }) => {
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const term = normalize(search.trim());
  const filtered = term ? anillos.filter((p) => normalize(p.name).includes(term)) : anillos;

  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const save = async (product: Product) => {
    const raw = values[String(product.id)];
    const peso = Number(raw ?? product.peso_unitario ?? 0);
    if (!Number.isFinite(peso) || peso < 0) { setError('Peso inválido.'); return; }
    setSavingId(String(product.id));
    setError(null);
    try {
      await productionsService.updatePeso(product.id, peso);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
              <Scale size={15} />
            </div>
            <h2 className="text-sm font-black tracking-tight text-slate-900">Editar Peso de Anillos</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar anillo..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
        </div>

        {error && <div className="px-4 py-2 text-xs font-semibold text-red-600">{error}</div>}

        <div className="flex-1 divide-y divide-slate-100 overflow-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-xs font-semibold text-slate-400">Sin anillos.</p>
          )}
          {pageRows.map((p) => {
            const id = String(p.id);
            const current = values[id] ?? String(Number(p.peso_unitario ?? 0));
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-xs font-bold text-slate-700">{p.name}</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={current}
                  onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                  className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold text-slate-900 outline-none focus:border-orange-500"
                />
                <span className="w-12 text-[10px] font-black uppercase tracking-widest text-slate-400">{uomLabel(p)}</span>
                <button
                  type="button"
                  onClick={() => save(p)}
                  disabled={savingId === id}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingId === id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Guardar
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] font-bold text-slate-500">
          <span>
            {filtered.length === 0
              ? 'Sin anillos'
              : `Mostrando ${start + 1} a ${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-1.5 text-slate-600">{safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Modal: eliminar producción (observación obligatoria + auditoría) ────────────

const DeleteProductionModal: React.FC<{
  production: ProductionRow;
  onClose: () => void;
  onConfirm: (production: ProductionRow, justification: string) => Promise<void>;
}> = ({ production, onClose, onConfirm }) => {
  const [observation, setObservation] = useState('');
  const [obsError, setObsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    const justification = observation.trim();
    if (!justification) {
      setObsError('La observación es obligatoria para eliminar la producción.');
      return;
    }
    setDeleting(true);
    setError(null);
    setObsError(null);
    try {
      await onConfirm(production, justification);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la producción.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500">
              <Trash2 size={15} />
            </div>
            <h2 className="text-sm font-black tracking-tight text-slate-900">Eliminar Producción #{production.id}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</div>}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Esta acción no revierte el stock. Quedará registrada en auditoría.
          </div>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Observación <span className="text-red-400">(obligatoria)</span></span>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              placeholder="Motivo de la eliminación..."
              className={`mt-1.5 w-full rounded-xl border bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 ${
                obsError ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-orange-500 focus:ring-orange-100'
              }`}
            />
            {obsError && <span className="mt-1 block text-[11px] font-semibold text-red-500">{obsError}</span>}
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductionScreen;
