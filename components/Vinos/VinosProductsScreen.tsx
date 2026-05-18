import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Package, TrendingUp, AlertTriangle, X, Loader2, Settings, RefreshCw, Check, ChevronDown, Save,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosProductsService, type ProductWithStock, type CreateProductInput, type ProductUomEquivalence } from '../../services/vinos/products.service';
import { vinosCatalogService, type Category, type Uom } from '../../services/vinos/catalog.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface FormState {
  name: string;
  category_id: string;
  uom_id: string;
  is_divisible: boolean;
  barcode: string;
  price_retail: string;
  price_mid_wholesale: string;
  price_wholesale: string;
  min_stock: string;
  image_url: string;
}

interface EquivalenceRow {
  uom_id: string;
  factor_to_base: string;
  price_retail: string;
  price_mid_wholesale: string;
  price_wholesale: string;
}

const emptyForm = (): FormState => ({
  name: '',
  category_id: '',
  uom_id: '',
  is_divisible: false,
  barcode: '',
  price_retail: '',
  price_mid_wholesale: '',
  price_wholesale: '',
  min_stock: '0',
  image_url: '',
});

const emptyEquivalence = (): EquivalenceRow => ({
  uom_id: '',
  factor_to_base: '',
  price_retail: '',
  price_mid_wholesale: '',
  price_wholesale: '',
});

const VinosProductsScreen: React.FC<Props> = ({ selectedBranchId }) => {
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
  const [form, setForm] = useState<FormState>(emptyForm());
  const [equivalences, setEquivalences] = useState<EquivalenceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // delete
  const [deleteTarget, setDeleteTarget] = useState<ProductWithStock | null>(null);
  const [deleting, setDeleting] = useState(false);

  // catalog manager
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newUomName, setNewUomName] = useState('');
  const [newUomSymbol, setNewUomSymbol] = useState('');

  // inline create from form
  const [showInlineCategory, setShowInlineCategory] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');
  const [showInlineUom, setShowInlineUom] = useState(false);
  const [inlineUomName, setInlineUomName] = useState('');

  // ── branch id ────────────────────────────────────────────
  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

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
    setForm(emptyForm());
    setEquivalences([]);
    setFormError('');
    setShowInlineCategory(false);
    setShowInlineUom(false);
    setModalOpen(true);
  };

  const openEdit = async (p: ProductWithStock) => {
    setEditTarget(p);
    setForm({
      name: p.name,
      category_id: p.category_id ?? '',
      uom_id: p.uom_id ?? '',
      is_divisible: p.is_divisible ?? false,
      barcode: p.barcode ?? '',
      price_retail: String(p.price_retail),
      price_mid_wholesale: String(p.price_mid_wholesale),
      price_wholesale: String(p.price_wholesale),
      min_stock: String(p.min_stock),
      image_url: p.image_url ?? '',
    });
    setEquivalences([]);
    setFormError('');
    setShowInlineCategory(false);
    setShowInlineUom(false);
    setModalOpen(true);
    try {
      const eqs = await vinosProductsService.listEquivalences(p.id);
      const mapped = eqs.map(e => ({
        uom_id: e.uom_id,
        factor_to_base: String(e.factor_to_base),
        price_retail: String(e.price_retail),
        price_mid_wholesale: String(e.price_mid_wholesale),
        price_wholesale: String(e.price_wholesale),
      }));
      // Si no existe row base (producto viejo), generar una con los precios actuales del producto
      const hasBase = mapped.some(m => Number(m.factor_to_base) === 1 && m.uom_id === (p.uom_id ?? ''));
      if (!hasBase && p.uom_id) {
        mapped.unshift({
          uom_id: p.uom_id,
          factor_to_base: '1',
          price_retail: String(p.price_retail ?? ''),
          price_mid_wholesale: String(p.price_mid_wholesale ?? ''),
          price_wholesale: String(p.price_wholesale ?? ''),
        });
      }
      setEquivalences(mapped);
    } catch (e) { console.error(e); }
  };

  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  // ── equivalencias helpers ────────────────────────────────
  const addEquivalence = () => setEquivalences(prev => [...prev, emptyEquivalence()]);
  const removeEquivalence = (idx: number) => setEquivalences(prev => prev.filter((_, i) => i !== idx));
  const updateEquivalence = (idx: number, patch: Partial<EquivalenceRow>) =>
    setEquivalences(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

  // Mantener una row base (factor 1, uom = uom_id del producto) sincronizada
  useEffect(() => {
    if (!form.uom_id) return;
    setEquivalences(prev => {
      const baseIdx = prev.findIndex(e => Number(e.factor_to_base) === 1);
      if (baseIdx >= 0) {
        // Actualizar uom de la row base si cambió
        if (prev[baseIdx].uom_id !== form.uom_id) {
          const copy = [...prev];
          copy[baseIdx] = { ...copy[baseIdx], uom_id: form.uom_id, factor_to_base: '1' };
          return copy;
        }
        return prev;
      }
      // No existe → crearla al inicio
      return [{
        uom_id: form.uom_id,
        factor_to_base: '1',
        price_retail: '',
        price_mid_wholesale: '',
        price_wholesale: '',
      }, ...prev];
    });
  }, [form.uom_id]);

  // ── inline catalog ───────────────────────────────────────
  const addInlineCategory = async () => {
    const n = inlineCategoryName.trim();
    if (!n) return;
    try {
      const cat = await vinosCatalogService.createCategory({ name: n, sort_order: categories.length });
      setCategories(prev => [...prev, cat]);
      setForm(f => ({ ...f, category_id: cat.id }));
      setInlineCategoryName('');
      setShowInlineCategory(false);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error al crear categoría.'); }
  };

  const addInlineUom = async () => {
    const n = inlineUomName.trim();
    if (!n) return;
    try {
      const u = await vinosCatalogService.createUom({ name: n, sort_order: uoms.length });
      setUoms(prev => [...prev, u]);
      setForm(f => ({ ...f, uom_id: u.id }));
      setInlineUomName('');
      setShowInlineUom(false);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error al crear unidad.'); }
  };

  // ── save ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio.'); return; }
    if (!branchDbId) { setFormError('Sucursal no encontrada en DB vinos.'); return; }
    if (!form.uom_id) { setFormError('Selecciona la unidad de medida base.'); return; }

    // Validar equivalencias
    for (const eq of equivalences) {
      if (!eq.uom_id) { setFormError('Cada equivalencia debe tener unidad de medida.'); return; }
      if (!Number(eq.factor_to_base)) { setFormError('Cada equivalencia debe tener factor mayor a 0.'); return; }
    }

    // Precios base = row con factor 1 cuya uom = form.uom_id
    const baseRow = equivalences.find(e => Number(e.factor_to_base) === 1 && e.uom_id === form.uom_id);
    if (!baseRow) { setFormError('Falta la fila de la unidad base en equivalencias.'); return; }

    setSaving(true);
    setFormError('');
    try {
      const payload: CreateProductInput = {
        name: form.name,
        category_id: form.category_id || null,
        uom_id: form.uom_id || null,
        is_divisible: form.is_divisible,
        barcode: form.barcode || null,
        price_retail: Number(baseRow.price_retail) || 0,
        price_mid_wholesale: Number(baseRow.price_mid_wholesale) || 0,
        price_wholesale: Number(baseRow.price_wholesale) || 0,
        min_stock: Number(form.min_stock) || 0,
        image_url: form.image_url || null,
      };

      let productId: string;
      if (editTarget) {
        await vinosProductsService.update(editTarget.id, payload);
        productId = editTarget.id;
      } else {
        const created = await vinosProductsService.create(payload, branchDbId);
        productId = created.id;
      }

      // Guardar equivalencias (reemplaza todas)
      await vinosProductsService.setEquivalences(productId, equivalences.map(eq => ({
        uom_id: eq.uom_id,
        factor_to_base: Number(eq.factor_to_base) || 1,
        price_retail: Number(eq.price_retail) || 0,
        price_mid_wholesale: Number(eq.price_mid_wholesale) || 0,
        price_wholesale: Number(eq.price_wholesale) || 0,
      })));

      await load();
      closeModal();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await vinosProductsService.deactivate(deleteTarget.id);
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
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
                  {['Producto','Categoría','Unidad','Stock','Menudeo','M. Mayoreo','Mayoreo',''].map(h => (
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
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{formatCurrency(p.price_retail)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{formatCurrency(p.price_mid_wholesale)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{formatCurrency(p.price_wholesale)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar"><Pencil size={14}/></button>
                          <button onClick={() => setDeleteTarget(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
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

      {/* ─── MODAL CREAR / EDITAR PRODUCTO ─────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                  {editTarget ? 'Editar producto' : 'Nuevo producto'}
                </h2>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                  El stock se carga vía Compras. SKU se genera automáticamente.
                </p>
              </div>
              <button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">

              {/* Datos básicos */}
              <section>
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Datos del producto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="">
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Código de barras</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.barcode}
                      onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                                  {/* Stock mínimo */}
                <div className="">
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Stock mínimo (alerta)</label>
                  <input type="number" min="0"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    value={form.min_stock}
                    onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))}
                  />
                </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Casa Madero Cabernet 750ml"
                    />
                  </div>

                  {/* Categoría */}
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Categoría</label>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.category_id}
                      onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Unidad base + is_divisible */}
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Unidad base</label>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.uom_id}
                      onChange={e => setForm(f => ({ ...f, uom_id: e.target.value }))}
                    >
                      <option value="">Sin unidad</option>
                      {uoms.map(u => <option key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ''}</option>)}
                    </select>
                    <label className="mt-2 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                        checked={form.is_divisible}
                        onChange={e => setForm(f => ({ ...f, is_divisible: e.target.checked }))}
                      />
                      <span className="text-[11px] font-bold text-slate-600">Permite fraccionar (decimales)</span>
                    </label>
                  </div>
                </div>
              </section>

              {/* Equivalencias de unidades de medida */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Equivalencias en unidades de medida</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Define otras unidades de venta (caja, lote, etc.). El factor indica cuántas unidades base equivalen a 1 de la unidad indicada.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addEquivalence}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700"
                  >
                    <Plus size={12}/> Agregar
                  </button>
                </div>

                {equivalences.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    Selecciona primero la unidad base. Se creará la primera fila automáticamente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Encabezados */}
                    <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_100px_32px] gap-2 px-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <span>Unidad</span>
                      <span>Factor</span>
                      <span>Menudeo</span>
                      <span>M. Mayoreo</span>
                      <span>Mayoreo</span>
                      <span></span>
                    </div>
                    {equivalences.map((eq, idx) => {
                      const isBase = Number(eq.factor_to_base) === 1 && eq.uom_id === form.uom_id;
                      return (
                        <div key={idx} className={`grid grid-cols-2 md:grid-cols-[1fr_100px_100px_100px_100px_32px] gap-2 rounded-xl border p-2 ${isBase ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                          {isBase ? (
                            <div className="flex items-center gap-2 px-2 py-1.5">
                              <span className="rounded-md bg-orange-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-orange-800">Base</span>
                              <span className="text-xs font-bold text-slate-700 truncate">
                                {uoms.find(u => u.id === eq.uom_id)?.name ?? '—'}
                              </span>
                            </div>
                          ) : (
                            <select
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                              value={eq.uom_id}
                              onChange={e => updateEquivalence(idx, { uom_id: e.target.value })}
                            >
                              <option value="">Selecciona unidad</option>
                              {uoms.filter(u => u.id !== form.uom_id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ''}</option>
                              ))}
                            </select>
                          )}
                          <input
                            type="number" min="0" step="0.0001"
                            disabled={isBase}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400 disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="ej: 12"
                            value={eq.factor_to_base}
                            onChange={e => updateEquivalence(idx, { factor_to_base: e.target.value })}
                          />
                          <input
                            type="number" min="0" step="0.01"
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                            placeholder="Menudeo"
                            value={eq.price_retail}
                            onChange={e => updateEquivalence(idx, { price_retail: e.target.value })}
                          />
                          <input
                            type="number" min="0" step="0.01"
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                            placeholder="M.May."
                            value={eq.price_mid_wholesale}
                            onChange={e => updateEquivalence(idx, { price_mid_wholesale: e.target.value })}
                          />
                          <input
                            type="number" min="0" step="0.01"
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                            placeholder="Mayoreo"
                            value={eq.price_wholesale}
                            onChange={e => updateEquivalence(idx, { price_wholesale: e.target.value })}
                          />
                          {isBase ? (
                            <span className="flex items-center justify-center text-slate-300" title="No se puede eliminar la unidad base">
                              <Trash2 size={14}/>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeEquivalence(idx)}
                              className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {formError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{formError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-8 py-5 bg-slate-50/50">
              <button onClick={closeModal} className="rounded-2xl border border-slate-200 bg-white px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRMAR ELIMINAR ──────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">¿Eliminar producto?</h3>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-bold">{deleteTarget.name}</span> se desactivará. No se borra historial.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 rounded-2xl bg-red-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-50">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
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
