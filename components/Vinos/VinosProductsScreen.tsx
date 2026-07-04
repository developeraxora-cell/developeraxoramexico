import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Package, TrendingUp, AlertTriangle, X, Settings, RefreshCw, Check, ChevronDown, Save, BarChart3, Loader2,
  DollarSign, SlidersHorizontal, FileDown, ShieldCheck,
} from 'lucide-react';
import { Branch, Role, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { authService } from '../../services/auth/auth.service';
import {
  vinosProductsService,
  type ProductWithStock,
  type ProductInsights,
} from '../../services/vinos/products.service';
import { vinosCatalogService, type Category, type Uom } from '../../services/vinos/catalog.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';
import { logVinosAudit } from '../../services/audit/audit.service';
import { generateVinosProductsListPdf } from '../../services/vinos/productsListPdf';
import VinosProductModal from './VinosProductModal';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const PRICE_TIER_LABEL: Record<string, string> = {
  MENUDEO: 'Menudeo',
  MEDIO_MAYOREO: 'Medio mayoreo',
  MAYOREO: 'Mayoreo',
};

const VinosProductsScreen: React.FC<Props> = ({ selectedBranchId, branches, currentUser }) => {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  // modal producto
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductWithStock | null>(null);

  // modal estadísticas
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<ProductWithStock | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyData, setHistoryData] = useState<ProductInsights | null>(null);

  // delete
  const [deleteTarget, setDeleteTarget] = useState<ProductWithStock | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteVerificationCode, setDeleteVerificationCode] = useState('');
  const [deleteVerificationValid, setDeleteVerificationValid] = useState(false);
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [deleteObservation, setDeleteObservation] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // stock manual
  const [stockTarget, setStockTarget] = useState<ProductWithStock | null>(null);
  const [stockValue, setStockValue] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState('');

  // precio compra
  const [purchaseCostTarget, setPurchaseCostTarget] = useState<ProductWithStock | null>(null);
  const [purchaseCostValue, setPurchaseCostValue] = useState('');
  const [purchaseCostNote, setPurchaseCostNote] = useState('');
  const [purchaseCostSaving, setPurchaseCostSaving] = useState(false);
  const [purchaseCostError, setPurchaseCostError] = useState('');

  // catalog manager
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newUomName, setNewUomName] = useState('');
  const [newUomSymbol, setNewUomSymbol] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  // ── branch id ────────────────────────────────────────────
  const branchName = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId)?.name ?? null,
    [branches, selectedBranchId],
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  useEffect(() => {
    let cancelled = false;
    setBranchDbId(null);
    vinosCustomersService.getBranchId(selectedBranch?.code ?? selectedBranchId)
      .then((id) => { if (!cancelled) setBranchDbId(id); })
      .catch(() => { if (!cancelled) setBranchDbId(null); });
    return () => { cancelled = true; };
  }, [selectedBranch?.code, selectedBranchId]);

  // ── load all ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats, us] = await Promise.all([
        vinosProductsService.listWithStock(branchDbId ?? undefined),
        vinosCatalogService.listCategories(),
        vinosCatalogService.listUoms(),
      ]);
      setProducts(prods);
      setCategories(cats);
      setUoms(us);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  // ── filtered ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let arr = products;
    if (categoryFilters.length > 0) {
      arr = arr.filter(p => p.category_id && categoryFilters.includes(p.category_id));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').includes(q)
      );
    }
    return arr;
  }, [products, search, categoryFilters]);

  const toggleCategoryFilter = (id: string) => {
    setCategoryFilters(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const exportProductsPdf = async () => {
    if (filtered.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      await generateVinosProductsListPdf({
        products: filtered,
        branchName,
        title: 'PRODUCTOS CASA TAHONA',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  // ── stats ────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: products.length,
    activos: products.filter(p => p.is_active).length,
    bajos: products.filter(p => p.total_stock <= Number(p.min_stock || 0)).length,
    unidades: products.reduce((sum, p) => sum + Number(p.total_stock || 0), 0),
  }), [products]);

  // ── modal helpers ────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (p: ProductWithStock) => {
    setEditTarget(p);
    setModalOpen(true);
  };

  const openHistory = async (p: ProductWithStock) => {
    setHistoryTarget(p);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryData(null);
    try {
      const data = await vinosProductsService.getProductInsights(p.id, branchDbId ?? undefined);
      setHistoryData(data);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'No se pudo cargar el historial del producto.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openStockAdjust = (p: ProductWithStock) => {
    setStockTarget(p);
    setStockValue(String(p.total_stock ?? 0));
    setStockNote('');
    setStockError('');
  };

  const openPurchaseCostAdjust = (p: ProductWithStock) => {
    setPurchaseCostTarget(p);
    setPurchaseCostValue(p.last_purchase_cost != null ? String(p.last_purchase_cost) : '');
    setPurchaseCostNote('');
    setPurchaseCostError('');
  };

  const closeStockAdjust = () => {
    if (stockSaving) return;
    setStockTarget(null);
    setStockValue('');
    setStockNote('');
    setStockError('');
  };

  const closePurchaseCostAdjust = () => {
    if (purchaseCostSaving) return;
    setPurchaseCostTarget(null);
    setPurchaseCostValue('');
    setPurchaseCostNote('');
    setPurchaseCostError('');
  };

  const closeHistory = () => {
    setHistoryOpen(false);
    setHistoryTarget(null);
    setHistoryData(null);
    setHistoryError('');
  };

  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const openDeleteConfirm = (product: ProductWithStock) => {
    setDeleteTarget(product);
    setDeleteVerificationCode('');
    setDeleteVerificationValid(false);
    setDeleteVerifying(false);
    setDeleteObservation('');
    setDeleteError('');
  };

  const closeDeleteConfirm = () => {
    if (deleting || deleteVerifying) return;
    setDeleteTarget(null);
    setDeleteVerificationCode('');
    setDeleteVerificationValid(false);
    setDeleteObservation('');
    setDeleteError('');
  };

  const verifyDeleteCode = async () => {
    const code = deleteVerificationCode.trim();
    setDeleteError('');

    if (currentUser.role !== Role.SUPERADMIN) {
      setDeleteError('Esta eliminación requiere la contraseña del usuario SUPERADMIN actual.');
      return;
    }
    if (!code) {
      setDeleteError('Ingresa el código de verificación.');
      return;
    }

    setDeleteVerifying(true);
    try {
      const identifier = currentUser.username || currentUser.email || currentUser.id;
      const valid = await authService.verifyPasswordForUser(identifier, code, currentUser.id);
      if (!valid) {
        setDeleteError('El código no corresponde al superadmin actual.');
        setDeleteVerificationValid(false);
        return;
      }
      setDeleteVerificationValid(true);
      setDeleteVerificationCode('');
    } catch (e) {
      setDeleteVerificationValid(false);
      setDeleteError(e instanceof Error ? e.message : 'No se pudo validar el código.');
    } finally {
      setDeleteVerifying(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const note = deleteObservation.trim();
    if (!deleteVerificationValid) {
      setDeleteError('Primero valida el código de verificación.');
      return;
    }
    if (!note) {
      setDeleteError('La observación es obligatoria.');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      await vinosProductsService.deactivate(deleteTarget.id);
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branchName,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'producto',
        entity_id: String(deleteTarget.id),
        description: `Producto desactivado: ${deleteTarget.name}`,
        justification: note,
        previous_data: {
          product_id: deleteTarget.id,
          name: deleteTarget.name,
          sku: deleteTarget.sku,
          stock: deleteTarget.total_stock,
          authorized_by: {
            id: currentUser.id,
            name: currentUser.name,
            role: currentUser.role,
          },
        },
        new_data: {
          is_active: false,
          deleted_at: new Date().toISOString(),
          observation: note,
        },
      });
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteVerificationCode('');
      setDeleteVerificationValid(false);
      setDeleteObservation('');
      setDeleteError('');
    } catch (e) {
      console.error(e);
      setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar el producto.');
    }
    finally { setDeleting(false); }
  };

  const handleStockAdjust = async () => {
    if (!stockTarget) return;
    const nextQty = Number(stockValue);
    const note = stockNote.trim();

    if (!branchDbId) {
      setStockError('No se pudo identificar la sucursal activa.');
      return;
    }
    if (!Number.isFinite(nextQty) || nextQty < 0) {
      setStockError('Ingresa un stock válido mayor o igual a 0.');
      return;
    }
    if (!note) {
      setStockError('La observación es obligatoria para ajustar stock.');
      return;
    }

    const previousQty = Number(stockTarget.total_stock ?? 0);
    setStockSaving(true);
    setStockError('');
    try {
      await vinosProductsService.adjustStock(stockTarget.id, branchDbId, nextQty, note);

      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branchName,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'producto',
        entity_id: String(stockTarget.id),
        description: `Stock ajustado manualmente: ${stockTarget.name} de ${previousQty} a ${nextQty}`,
        justification: note,
        previous_data: {
          product_id: stockTarget.id,
          name: stockTarget.name,
          stock: previousQty,
        },
        new_data: {
          product_id: stockTarget.id,
          name: stockTarget.name,
          stock: nextQty,
          observation: note,
        },
      });

      setProducts(prev => prev.map(product => (
        product.id === stockTarget.id ? { ...product, total_stock: nextQty } : product
      )));
      if (historyOpen && historyTarget?.id === stockTarget.id) {
        void openHistory({ ...stockTarget, total_stock: nextQty });
      }
      await load();
      setStockTarget(null);
      setStockValue('');
      setStockNote('');
    } catch (e) {
      setStockError(e instanceof Error ? e.message : 'No se pudo ajustar el stock.');
    } finally {
      setStockSaving(false);
    }
  };

  const handlePurchaseCostAdjust = async () => {
    if (!purchaseCostTarget) return;
    const nextCost = Number(purchaseCostValue);
    const note = purchaseCostNote.trim();

    if (!branchDbId) {
      setPurchaseCostError('No se pudo identificar la sucursal activa.');
      return;
    }
    if (!Number.isFinite(nextCost) || nextCost < 0) {
      setPurchaseCostError('Ingresa un precio de compra válido mayor o igual a 0.');
      return;
    }
    if (!note) {
      setPurchaseCostError('La observación es obligatoria para editar el precio de compra.');
      return;
    }

    const previousCost = purchaseCostTarget.last_purchase_cost;
    setPurchaseCostSaving(true);
    setPurchaseCostError('');
    try {
      await vinosProductsService.updateLastPurchaseCost(purchaseCostTarget.id, branchDbId, nextCost);

      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branchName,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'producto',
        entity_id: String(purchaseCostTarget.id),
        description: `Precio compra actualizado: ${purchaseCostTarget.name} de ${previousCost ?? 'sin registro'} a ${nextCost}`,
        justification: note,
        previous_data: {
          product_id: purchaseCostTarget.id,
          name: purchaseCostTarget.name,
          last_purchase_cost: previousCost,
        },
        new_data: {
          product_id: purchaseCostTarget.id,
          name: purchaseCostTarget.name,
          last_purchase_cost: nextCost,
          observation: note,
        },
      });

      setProducts(prev => prev.map(product => (
        product.id === purchaseCostTarget.id ? { ...product, last_purchase_cost: nextCost } : product
      )));
      if (historyOpen && historyTarget?.id === purchaseCostTarget.id) {
        void openHistory({ ...purchaseCostTarget, last_purchase_cost: nextCost });
      }
      await load();
      setPurchaseCostTarget(null);
      setPurchaseCostValue('');
      setPurchaseCostNote('');
    } catch (e) {
      setPurchaseCostError(e instanceof Error ? e.message : 'No se pudo editar el precio de compra.');
    } finally {
      setPurchaseCostSaving(false);
    }
  };

  // ── catalog manager actions ─────────────────────────────
  const addCategory = async () => {
    const n = newCategoryName.trim();
    if (!n) return;
    try {
      const cat = await vinosCatalogService.createCategory({ name: n, sort_order: categories.length });
      setCategories(prev => [...prev, cat]);
      setNewCategoryName('');
    } catch (e) { console.error(e); }
  };

  const removeCategory = async (id: string) => {
    try {
      await vinosCatalogService.deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (e) { console.error(e); }
  };

  const addUom = async () => {
    const n = newUomName.trim();
    if (!n) return;
    try {
      const u = await vinosCatalogService.createUom({
        name: n,
        symbol: newUomSymbol.trim() || null,
        sort_order: uoms.length,
      });
      setUoms(prev => [...prev, u]);
      setNewUomName(''); setNewUomSymbol('');
    } catch (e) { console.error(e); }
  };

  const removeUom = async (id: string) => {
    try {
      await vinosCatalogService.deleteUom(id);
      setUoms(prev => prev.filter(u => u.id !== id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      alert(msg.includes('foreign') || msg.includes('violates') ? 'No se puede eliminar: hay productos usando esta unidad. Edita el nombre.' : (msg || 'Error al eliminar.'));
    }
  };

  // edit inline state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingUomId, setEditingUomId] = useState<string | null>(null);
  const [editingUomName, setEditingUomName] = useState('');
  const [editingUomSymbol, setEditingUomSymbol] = useState('');

  const startEditCategory = (c: Category) => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); };
  const cancelEditCategory = () => { setEditingCategoryId(null); setEditingCategoryName(''); };
  const saveEditCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    try {
      const updated = await vinosCatalogService.updateCategory(editingCategoryId, { name: editingCategoryName.trim() });
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c));
      cancelEditCategory();
    } catch (e) { console.error(e); }
  };

  const startEditUom = (u: Uom) => { setEditingUomId(u.id); setEditingUomName(u.name); setEditingUomSymbol(u.symbol ?? ''); };
  const cancelEditUom = () => { setEditingUomId(null); setEditingUomName(''); setEditingUomSymbol(''); };
  const saveEditUom = async () => {
    if (!editingUomId || !editingUomName.trim()) return;
    try {
      const updated = await vinosCatalogService.updateUom(editingUomId, { name: editingUomName.trim(), symbol: editingUomSymbol.trim() || null });
      setUoms(prev => prev.map(u => u.id === updated.id ? updated : u));
      cancelEditUom();
    } catch (e) { console.error(e); }
  };

  // ── render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total productos',  value: stats.total,      icon: Package,        color: 'text-slate-900'  },
          { label: 'Activos',          value: stats.activos,    icon: TrendingUp,     color: 'text-green-600'  },
          { label: 'Stock bajo',       value: stats.bajos,      icon: AlertTriangle,  color: 'text-orange-500' },
          { label: 'Unidades totales', value: stats.unidades,   icon: Package,        color: 'text-slate-900'  },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <s.icon size={14} className="text-slate-300" />
            </div>
            <p className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 max-w-3xl gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Buscar por nombre, SKU o código…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Multi-select checkbox dropdown de categorías */}
          <div className="relative min-w-[220px]">
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen(o => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none hover:border-slate-300"
            >
              <span className="truncate">
                {categoryFilters.length === 0
                  ? `Todas las categorías (${products.length})`
                  : `${categoryFilters.length} seleccionadas`}
              </span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {categoryDropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setCategoryDropdownOpen(false)} />
                <div className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={() => setCategoryFilters([])}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-orange-50"
                  >
                    <span>Limpiar selección</span>
                    {categoryFilters.length === 0 && <Check size={14} className="text-orange-500" />}
                  </button>
                  <div className="border-t border-slate-100" />
                  {categories.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">No hay categorías</p>
                  ) : categories.map(c => {
                    const count = products.filter(p => p.category_id === c.id).length;
                    const active = categoryFilters.includes(c.id);
                    return (
                      <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50 ${active ? 'bg-orange-50/60' : ''}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                            checked={active}
                            onChange={() => toggleCategoryFilter(c.id)}
                          />
                          <span className={`font-bold ${active ? 'text-orange-700' : 'text-slate-700'}`}>{c.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{count}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <button onClick={() => setCatalogModalOpen(true)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
            <Settings size={14} /> Ajustes
          </button>
          <button onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50" title="Recargar">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={exportProductsPdf}
            disabled={filtered.length === 0 || exportingPdf}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Exportar PDF"
          >
            {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            PDF
          </button>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500">
          <Plus size={15} /> Nuevo producto
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">Cargando productos…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Package size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">
              {search || categoryFilters.length > 0 ? 'Sin resultados' : 'Sin productos'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {search || categoryFilters.length > 0 ? 'Prueba con otro filtro.' : 'Agrega tu primer producto al catálogo.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Producto','Categoría','Unidad','Stock','Prec. Compra','Menudeo','M. Mayoreo','Mayoreo',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => {
                  const lowStock = p.total_stock <= Number(p.min_stock || 0);
                  const stockClass = lowStock ? 'bg-red-100 text-red-700' : p.total_stock <= 20 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-lg">🍷</div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate max-w-[260px]">{p.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{p.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{p.category?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{p.uom?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-black ${stockClass}`}>
                          {p.total_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">
                        {p.last_purchase_cost != null ? formatCurrency(p.last_purchase_cost) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">
                        {formatCurrency(p.price_retail)}
                        {p.single_price_mode && <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-orange-500">Único</p>}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{p.single_price_mode ? '—' : formatCurrency(p.price_mid_wholesale)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{p.single_price_mode ? '—' : formatCurrency(p.price_wholesale)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openHistory(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Ver estadísticas">
                            <BarChart3 size={14}/>
                          </button>
                          <button onClick={() => openStockAdjust(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Editar stock manual">
                            <SlidersHorizontal size={14}/>
                          </button>
                          <button onClick={() => openPurchaseCostAdjust(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-600" title="Editar precio compra">
                            <DollarSign size={14}/>
                          </button>
                          <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar"><Pencil size={14}/></button>
                          <button onClick={() => openDeleteConfirm(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VinosProductModal
        isOpen={modalOpen}
        branchDbId={branchDbId}
        branchId={selectedBranchId}
        branchName={branchName}
        currentUser={currentUser}
        categories={categories}
        uoms={uoms}
        editTarget={editTarget}
        onClose={closeModal}
        onSaved={async () => {
          await load();
          closeModal();
        }}
      />

      {stockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Editar stock manual</h2>
                <p className="text-[10px] font-bold text-slate-400">{stockTarget.name} · {stockTarget.sku}</p>
              </div>
              <button onClick={closeStockAdjust} disabled={stockSaving} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={18}/></button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock actual</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">{stockTarget.total_stock}</p>
                </div>
                <label className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nuevo stock</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stockValue}
                    onChange={e => setStockValue(e.target.value)}
                    className="mt-1 w-full bg-transparent text-2xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observación obligatoria</span>
                <textarea
                  value={stockNote}
                  onChange={e => setStockNote(e.target.value)}
                  rows={4}
                  placeholder="Ej. Conteo físico, merma, ajuste por captura incorrecta..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>

              {stockError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{stockError}</div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={closeStockAdjust} disabled={stockSaving} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleStockAdjust} disabled={stockSaving} className="flex-1 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-50">
                {stockSaving ? 'Guardando...' : 'Guardar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseCostTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Editar precio compra</h2>
                <p className="text-[10px] font-bold text-slate-400">{purchaseCostTarget.name} · {purchaseCostTarget.sku}</p>
              </div>
              <button onClick={closePurchaseCostAdjust} disabled={purchaseCostSaving} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={18}/></button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio de compra actual</p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {purchaseCostTarget.last_purchase_cost != null ? formatCurrency(purchaseCostTarget.last_purchase_cost) : '—'}
                  </p>
                </div>
                <label className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nuevo precio de compra</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseCostValue}
                    onChange={e => setPurchaseCostValue(e.target.value)}
                    className="mt-1 w-full bg-transparent text-2xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observación obligatoria</span>
                <textarea
                  value={purchaseCostNote}
                  onChange={e => setPurchaseCostNote(e.target.value)}
                  rows={4}
                  placeholder="Ej. Corrección de costo capturado, actualización por factura..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>

              {purchaseCostError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{purchaseCostError}</div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={closePurchaseCostAdjust} disabled={purchaseCostSaving} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handlePurchaseCostAdjust} disabled={purchaseCostSaving} className="flex-1 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-50">
                {purchaseCostSaving ? 'Guardando...' : 'Guardar precio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Estadísticas del producto</h2>
                <p className="text-[10px] font-bold text-slate-400">{historyTarget.name} · {historyTarget.sku}</p>
              </div>
              <button onClick={closeHistory} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {historyLoading ? (
                <div className="py-20 text-center">
                  <Loader2 size={28} className="mx-auto animate-spin text-orange-500" />
                  <p className="mt-3 text-sm font-bold text-slate-400">Cargando historial…</p>
                </div>
              ) : historyError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{historyError}</div>
              ) : historyData ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Último costo compra</p>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {historyData.last_purchase_cost != null ? formatCurrency(historyData.last_purchase_cost) : '—'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ingresos</p>
                      <p className="mt-1 text-xl font-black text-green-600">{formatCurrency(historyData.purchased_total)}</p>
                      <p className="text-[10px] font-bold text-slate-400">{historyData.purchased_qty} unidades</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Salidas</p>
                      <p className="mt-1 text-xl font-black text-orange-600">{formatCurrency(historyData.sold_total)}</p>
                      <p className="text-[10px] font-bold text-slate-400">{historyData.sold_qty} unidades</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ganancia estimada</p>
                      <p className="mt-1 text-xl font-black text-blue-600">{formatCurrency(historyData.estimated_profit)}</p>
                      <p className="text-[10px] font-bold text-slate-400">Usando el último costo compra</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200">
                          {['Fecha', 'Estado', 'Cantidad', 'Precio', 'Total', 'Tipo', 'Ganancia', 'Detalle'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.history.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Sin movimientos para este producto.</td>
                          </tr>
                        ) : historyData.history.map((row) => {
                          const badgeClass =
                            row.status === 'INGRESO' ? 'bg-green-100 text-green-700'
                              : row.status === 'SALIDA' ? 'bg-orange-100 text-orange-700'
                                : 'bg-blue-100 text-blue-700';
                          return (
                            <tr key={row.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{new Date(row.created_at).toLocaleString('es-MX')}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${badgeClass}`}>{row.status}</span>
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900">
                                {row.qty != null ? row.qty : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900">
                                {row.unit_price != null ? formatCurrency(row.unit_price) : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900">
                                {row.subtotal != null ? formatCurrency(row.subtotal) : '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">
                                {row.price_type ? PRICE_TIER_LABEL[row.price_type] ?? row.price_type : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm font-black text-blue-600">
                                {row.profit != null ? formatCurrency(row.profit) : '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">
                                <p className="font-bold text-slate-800">{row.source}</p>
                                {row.detail && <p className="mt-0.5 text-[10px] text-slate-400">{row.detail}</p>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRMAR ELIMINAR ──────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${deleteVerificationValid ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {deleteVerificationValid ? <ShieldCheck size={22} /> : <Trash2 size={22} />}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Eliminar producto</h3>
                <p className="text-xs font-bold text-slate-500">
                  <span className="text-slate-800">{deleteTarget.name}</span> se desactivará.
                </p>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              {!deleteVerificationValid ? (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Código de verificación</label>
                    <input
                      type="password"
                      value={deleteVerificationCode}
                      onChange={e => setDeleteVerificationCode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && verifyDeleteCode()}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      placeholder="Contraseña del SUPERADMIN"
                      autoComplete="current-password"
                    />
                  </div>
                  <p className="rounded-2xl bg-orange-50 px-4 py-3 text-xs font-bold leading-relaxed text-orange-700">
                    Para continuar se debe validar la contraseña del usuario SUPERADMIN actual: {currentUser.name}.
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-widest text-green-700">Código validado</p>
                    <p className="mt-1 text-xs font-bold text-green-800">Autorizado por {currentUser.name}.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-red-500">Observación de eliminación *</label>
                    <textarea
                      rows={3}
                      value={deleteObservation}
                      onChange={e => setDeleteObservation(e.target.value)}
                      className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      placeholder="Explica por qué se elimina este producto..."
                    />
                  </div>
                </>
              )}

              {deleteError && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-600">{deleteError}</p>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button onClick={closeDeleteConfirm} disabled={deleting || deleteVerifying} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              {!deleteVerificationValid ? (
                <button onClick={verifyDeleteCode} disabled={deleteVerifying || !deleteVerificationCode.trim()} className="flex-1 rounded-2xl bg-slate-900 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-700 disabled:opacity-50">
                  {deleteVerifying ? 'Validando...' : 'Validar'}
                </button>
              ) : (
                <button onClick={handleDelete} disabled={deleting || !deleteObservation.trim()} className="flex-1 rounded-2xl bg-red-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-50">
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CATÁLOGO (categorías + unidades) ──────── */}
      {catalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Ajustes — Categorías y Unidades</h2>
              <button onClick={() => setCatalogModalOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Categorías */}
              <div>
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Categorías</h3>
                <div className="flex gap-2 mb-3">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                    placeholder="Nueva categoría…"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCategory()}
                  />
                  <button onClick={addCategory} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700">
                    Agregar
                  </button>
                </div>
                <ul className="space-y-1 max-h-72 overflow-y-auto">
                  {categories.length === 0 ? (
                    <li className="text-center py-6 text-xs text-slate-400">Sin categorías</li>
                  ) : categories.map(c => {
                    const editing = editingCategoryId === c.id;
                    return (
                      <li key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${editing ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
                        {editing ? (
                          <>
                            <input
                              autoFocus
                              className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-orange-500"
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory(); }}
                            />
                            <button onClick={saveEditCategory} className="rounded-md bg-orange-600 p-1.5 text-white hover:bg-orange-500" title="Guardar"><Save size={14}/></button>
                            <button onClick={cancelEditCategory} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Cancelar"><X size={14}/></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-slate-700">{c.name}</span>
                            <button onClick={() => startEditCategory(c)} className="text-slate-400 hover:text-orange-500" title="Editar"><Pencil size={14}/></button>
                            <button onClick={() => removeCategory(c.id)} className="text-slate-400 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Unidades */}
              <div>
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Unidades de medida</h3>
                <div className="grid grid-cols-[1fr_70px_auto] gap-2 mb-3">
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                    placeholder="Nombre (Botella…)"
                    value={newUomName}
                    onChange={e => setNewUomName(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                    placeholder="Símb."
                    value={newUomSymbol}
                    onChange={e => setNewUomSymbol(e.target.value)}
                  />
                  <button onClick={addUom} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700">
                    +
                  </button>
                </div>
                <ul className="space-y-1 max-h-72 overflow-y-auto">
                  {uoms.length === 0 ? (
                    <li className="text-center py-6 text-xs text-slate-400">Sin unidades</li>
                  ) : uoms.map(u => {
                    const editing = editingUomId === u.id;
                    return (
                      <li key={u.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${editing ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
                        {editing ? (
                          <>
                            <input
                              autoFocus
                              className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-orange-500"
                              placeholder="Nombre"
                              value={editingUomName}
                              onChange={e => setEditingUomName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditUom(); if (e.key === 'Escape') cancelEditUom(); }}
                            />
                            <input
                              className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-orange-500"
                              placeholder="Símb."
                              value={editingUomSymbol}
                              onChange={e => setEditingUomSymbol(e.target.value)}
                            />
                            <button onClick={saveEditUom} className="rounded-md bg-orange-600 p-1.5 text-white hover:bg-orange-500" title="Guardar"><Save size={14}/></button>
                            <button onClick={cancelEditUom} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Cancelar"><X size={14}/></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-slate-700">{u.name}{u.symbol ? <span className="text-slate-400"> ({u.symbol})</span> : null}</span>
                            <button onClick={() => startEditUom(u)} className="text-slate-400 hover:text-orange-500" title="Editar"><Pencil size={14}/></button>
                            <button onClick={() => removeUom(u.id)} className="text-slate-400 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

            </div>
            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex justify-end">
              <button onClick={() => setCatalogModalOpen(false)} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VinosProductsScreen;
