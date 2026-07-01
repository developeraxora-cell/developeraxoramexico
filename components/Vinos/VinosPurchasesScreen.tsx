import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Trash2, Calendar, Truck, FileText, ArrowDownToLine, X, Loader2, Eye, RefreshCw, Pencil,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosPurchasesService, type PurchaseRow, type PurchaseWithItems, type CartItem } from '../../services/vinos/purchases.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';
import { vinosProductsService, type ProductWithStock } from '../../services/vinos/products.service';
import { vinosCatalogService, type Category, type Supplier, type Uom } from '../../services/vinos/catalog.service';
import VinosProductModal, { type VinosProductModalSavedPayload } from './VinosProductModal';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface ProductWithUoms extends ProductWithStock {
  product_uoms?: { id: string; uom_id: string; factor_to_base: number; uom: Uom }[];
}

interface PurchaseCartItem extends CartItem {
  qty_input: string;
  cost_per_unit_input: string;
}

interface PurchaseEditForm {
  supplier_id: string;
  purchase_date: string;
  is_credit: boolean;
  reference: string;
  notes: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const isNumericSearch = (value: string) => /^\d+$/.test(value.trim());
const normalizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, '').replace(/\./g, ',');
  if (!cleaned) return '';
  const [intPartRaw, ...rest] = cleaned.split(',');
  const hasDecimal = rest.length > 0;
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '');
  if (!hasDecimal) return intPart || (cleaned.startsWith('0') ? '0' : '');
  const decimalPart = rest.join('').replace(/,/g, '').slice(0, 2);
  const normalizedInt = intPart || '0';
  return `${normalizedInt},${decimalPart}`;
};
const parseMoneyInput = (value: string) => {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) return 0;
  return Number(normalized.replace(',', '.')) || 0;
};
const normalizeQtyInput = (value: string) => value.replace(/[^\d.,]/g, '').replace(',', '.');
const parseQtyInput = (value: string) => {
  const normalized = normalizeQtyInput(value);
  if (!normalized) return 0;
  return Number(normalized) || 0;
};
const getPurchaseProductNames = (purchase: PurchaseRow) => {
  const names = (purchase.items ?? [])
    .map(item => item.product?.name?.trim())
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
};

const VinosPurchasesScreen: React.FC<Props> = ({ selectedBranchId, branches, currentUser }) => {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  // tab
  const [tab, setTab] = useState<'historial' | 'nueva'>('historial');

  // form nueva compra
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [products, setProducts] = useState<ProductWithUoms[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [isCredit, setIsCredit] = useState(false);
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseWithItems | null>(null);

  // edit modal
  const [editTarget, setEditTarget] = useState<PurchaseRow | null>(null);
  const [editForm, setEditForm] = useState<PurchaseEditForm>({
    supplier_id: '',
    purchase_date: todayISO(),
    is_credit: false,
    reference: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // delete modal
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRow | null>(null);
  const [deleteNote, setDeleteNote] = useState('');
  const [deleting, setDeleting] = useState(false);

  // supplier modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [newSupplierRfc, setNewSupplierRfc] = useState('');
  const [supplierModalContext, setSupplierModalContext] = useState<'newPurchase' | 'editPurchase'>('newPurchase');

  // product modal
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productInitialValues, setProductInitialValues] = useState<{ barcode?: string; name?: string }>({});

  // ── branch id ────────────────────────────────────────────
  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  // ── load purchases ───────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await vinosPurchasesService.list(branchDbId ?? undefined, { search: search.trim() || undefined });
      setPurchases(rows);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [branchDbId, search]);

  useEffect(() => { load(); }, [load]);

  const loadSuppliers = async () => {
    const sups = await vinosCatalogService.listSuppliers();
    setSuppliers(sups);
    return sups;
  };

  // ── load catálogo al abrir modal nueva compra ───────────
  const loadModalData = async () => {
    try {
      const [list, sups, cats, units] = await Promise.all([
        vinosProductsService.listWithStock(branchDbId ?? undefined),
        loadSuppliers(),
        vinosCatalogService.listCategories(),
        vinosCatalogService.listUoms(),
      ]);
      const puRows = await vinosProductsService.listAllProductUoms(list.map(p => p.id));
      const byProduct: Record<string, ProductWithUoms['product_uoms']> = {};
      puRows.forEach(row => {
        byProduct[row.product_id] = byProduct[row.product_id] || [];
        byProduct[row.product_id]!.push({ id: row.id, uom_id: row.uom_id, factor_to_base: row.factor_to_base, uom: row.uom as Uom });
      });
      const prods = list.map(p => ({ ...p, product_uoms: byProduct[p.id] ?? [] })) as ProductWithUoms[];
      setProducts(prods);
      setSuppliers(sups);
      setCategories(cats);
      setUoms(units);
    } catch (e) { console.error(e); }
  };

  const resetForm = () => {
    setSupplierId('');
    setReference('');
    setPurchaseDate(todayISO());
    setIsCredit(false);
    setNotes('');
    setCart([]);
    setProductSearch('');
    setFormError('');
  };

  // Cargar catálogo cuando se entra a tab nueva
  useEffect(() => {
    if (tab === 'nueva' && branchDbId) loadModalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, branchDbId]);

  // ── productos filtrados ─────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q)
    ).slice(0, 20);
  }, [products, productSearch]);

  // ── carrito ─────────────────────────────────────────────
  const addProductToCart = (p: ProductWithUoms, costPerUnit = '') => {
    // por defecto unidad base (factor 1 en product_uoms, o usar uom_id del producto)
    const baseOption = p.product_uoms?.find(pu => Number(pu.factor_to_base) === 1) ?? p.product_uoms?.[0];
    if (!baseOption) {
      setFormError(`El producto "${p.name}" no tiene unidades configuradas.`);
      return;
    }
    setCart(prev => [...prev, {
      product_id: p.id,
      product_uom_id: baseOption.id,
      factor_to_base: Number(baseOption.factor_to_base),
      qty: 1,
      qty_input: '1',
      cost_per_unit: parseMoneyInput(String(costPerUnit)),
      cost_per_unit_input: normalizeMoneyInput(String(costPerUnit)),
      product_name: p.name,
      product_sku: p.sku,
      uom_name: baseOption.uom?.name ?? '',
    }]);
    setProductSearch('');
  };

  const openNewProductFromSearch = () => {
    const query = productSearch.trim();
    if (!query) return;
    if (!branchDbId) {
      setFormError('Sucursal no encontrada. Selecciona una sucursal antes de registrar productos.');
      return;
    }
    setProductInitialValues(isNumericSearch(query) ? { barcode: query } : { name: query });
    setProductModalOpen(true);
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setProductInitialValues({});
  };

  const handleProductSaved = ({ product, productUoms }: VinosProductModalSavedPayload) => {
    const selectedCategory = categories.find(category => category.id === product.category_id) ?? null;
    const selectedUom = uoms.find(uom => uom.id === product.uom_id) ?? null;
    const productWithUoms: ProductWithUoms = {
      ...product,
      category: selectedCategory ? { id: selectedCategory.id, name: selectedCategory.name } : null,
      uom: selectedUom ? { id: selectedUom.id, name: selectedUom.name, symbol: selectedUom.symbol } : null,
      total_stock: 0,
      product_uoms: productUoms.map(row => ({
        id: row.id,
        uom_id: row.uom_id,
        factor_to_base: Number(row.factor_to_base) || 1,
        uom: row.uom as Uom,
      })),
    };
    setProducts(prev => [...prev.filter(existing => existing.id !== product.id), productWithUoms]
      .sort((a, b) => a.name.localeCompare(b.name)));
    addProductToCart(productWithUoms, '');
    closeProductModal();
  };

  const updateCartItem = (idx: number, patch: Partial<PurchaseCartItem>) =>
    setCart(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'qty_input')) {
        next.qty = parseQtyInput(String(next.qty_input ?? ''));
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'cost_per_unit_input')) {
        next.cost_per_unit = parseMoneyInput(String(next.cost_per_unit_input ?? ''));
      }
      return next;
    }));

  const removeCartItem = (idx: number) =>
    setCart(prev => prev.filter((_, i) => i !== idx));

  const changeCartItemUom = (idx: number, productUomId: string) => {
    const item = cart[idx];
    const product = products.find(p => p.id === item.product_id);
    const pu = product?.product_uoms?.find(u => u.id === productUomId);
    if (!pu) return;
    updateCartItem(idx, {
      product_uom_id: pu.id,
      factor_to_base: Number(pu.factor_to_base),
      uom_name: pu.uom?.name ?? '',
    });
  };

  const total = useMemo(() => cart.reduce((sum, it) => sum + (Number(it.qty) * Number(it.cost_per_unit)), 0), [cart]);

  // ── stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const ofMonth = purchases.filter(p => new Date(p.purchase_date) >= monthStart);
    const suppliersSet = new Set(purchases.map(p => p.supplier_id).filter(Boolean));
    const credito = purchases.filter(p => p.is_credit).length;
    return {
      total: purchases.length,
      monto_mes: ofMonth.reduce((s, p) => s + Number(p.total), 0),
      proveedores: suppliersSet.size,
      credito,
    };
  }, [purchases]);

  // ── save ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!branchDbId) { setFormError('Sucursal no encontrada.'); return; }
    if (cart.length === 0) { setFormError('Agrega al menos un producto.'); return; }
    for (const it of cart) {
      if (Number(it.qty) <= 0) { setFormError('Cantidad debe ser mayor a 0.'); return; }
      if (Number(it.cost_per_unit) < 0) { setFormError('Costo unitario inválido.'); return; }
    }

    setSaving(true);
    setFormError('');
    try {
      await vinosPurchasesService.create({
        branch_id: branchDbId,
        supplier_id: supplierId || null,
        reference: reference.trim() || null,
        purchase_date: purchaseDate,
        notes: notes.trim() || null,
        is_credit: isCredit,
        created_by: currentUser.id,
        items: cart,
      });
      await load();
      resetForm();
      setTab('historial');
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ── detail ──────────────────────────────────────────────
  const openDetail = async (p: PurchaseRow) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      const d = await vinosPurchasesService.getDetail(p.id);
      setDetail(d);
    } catch (e) { console.error(e); }
  };

  // ── edit metadata ───────────────────────────────────────
  const openEdit = async (p: PurchaseRow) => {
    setEditTarget(p);
    setEditError('');
    setEditForm({
      supplier_id: p.supplier_id ?? '',
      purchase_date: p.purchase_date || todayISO(),
      is_credit: Boolean(p.is_credit),
      reference: p.reference ?? '',
      notes: p.notes ?? '',
    });
    if (suppliers.length === 0) {
      try { await loadSuppliers(); } catch (e) { console.error(e); }
    }
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditError('');
    setEditSaving(false);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.purchase_date) { setEditError('Selecciona la fecha de compra.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await vinosPurchasesService.updateMetadata(editTarget.id, {
        supplier_id: editForm.supplier_id || null,
        purchase_date: editForm.purchase_date,
        is_credit: editForm.is_credit,
        reference: editForm.reference,
        notes: editForm.notes,
      });
      await load();
      closeEdit();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── delete ──────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteNote.trim()) { return; }
    setDeleting(true);
    try {
      await vinosPurchasesService.softDelete(deleteTarget.id, deleteNote.trim());
      setPurchases(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteNote('');
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
  };

  // ── add supplier ────────────────────────────────────────
  const createSupplier = async () => {
    const name = newSupplierName.trim();
    if (!name) return;
    try {
      const s = await vinosCatalogService.createSupplier({
        name,
        phone: newSupplierPhone.trim() || null,
        email: newSupplierEmail.trim() || null,
        address: null,
        rfc: newSupplierRfc.trim() || null,
        notes: null,
      });
      setSuppliers(prev => [...prev, s]);
      if (supplierModalContext === 'editPurchase') {
        setEditForm(prev => ({ ...prev, supplier_id: s.id }));
      } else {
        setSupplierId(s.id);
      }
      setNewSupplierName(''); setNewSupplierPhone(''); setNewSupplierEmail(''); setNewSupplierRfc('');
      setSupplierModalOpen(false);
    } catch (e) { console.error(e); }
  };

  // ── render ──────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total compras',  value: purchases.length,                icon: ArrowDownToLine },
          { label: 'Monto del mes',  value: formatCurrency(stats.monto_mes), icon: FileText },
          { label: 'Proveedores',    value: stats.proveedores,                icon: Truck },
          { label: 'Compras a crédito', value: stats.credito,                 icon: Calendar },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <s.icon size={14} className="text-slate-300" />
            </div>
            <p className="mt-1 text-2xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header con título + acción */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
            {tab === 'historial' ? <ArrowDownToLine size={20}/> : <Plus size={20}/>}
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              {tab === 'historial' ? 'Historial de Compras' : 'Nueva Compra'}
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sucursal activa</p>
          </div>
        </div>
        {tab === 'historial' ? (
          <button
            onClick={() => { setTab('nueva'); if (cart.length === 0) resetForm(); }}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-700"
          >
            <Plus size={15}/> Registrar compra
          </button>
        ) : (
          <button
            onClick={() => setTab('historial')}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            Volver al historial
          </button>
        )}
      </div>

      {tab === 'historial' && (
      <>
      {/* Search */}
      <div className="flex gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Folio, proveedor, total…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50" title="Recargar">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">Cargando compras…</div>
        ) : purchases.length === 0 ? (
          <div className="py-20 text-center">
            <ArrowDownToLine size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Sin compras registradas</p>
            <p className="mt-1 text-xs text-slate-400">Registra tu primera entrada de inventario.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Folio','Fecha','Proveedor','Productos','Notas','Total',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map(p => {
                  const productNames = getPurchaseProductNames(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 border-l-4" style={{ borderLeftColor: p.is_credit ? '#ef4444' : '#22c55e' }}>
                      <td className="px-4 py-3 text-xs font-mono text-slate-700">{p.reference ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{p.purchase_date}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{p.supplier?.name ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700">
                        {productNames.length > 0 ? (
                          <span className="block max-w-[320px] truncate" title={productNames.join(', ')}>
                            {productNames.join(', ')}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-[200px]">{p.notes ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{formatCurrency(p.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openDetail(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Ver detalle"><Eye size={14}/></button>
                          <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-500" title="Editar datos"><Pencil size={14}/></button>
                          <button onClick={() => { setDeleteTarget(p); setDeleteNote(''); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
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

      </>
      )}

      {tab === 'nueva' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Columna izq: 3 cards (escaneo + proveedor/fecha + referencia/notas) */}
          <div className="space-y-4">

            {/* Card 1: Escaneo / búsqueda */}
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5">
              <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Paso 1: Escaneo de producto</h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  placeholder="Escanee el barcode o escriba el nombre"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
                {productSearch.trim() && (
                  <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProductToCart(p)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-orange-50"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-base">🍷</div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-bold text-slate-800">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{p.sku}</p>
                        </div>
                        <Plus size={14} className="text-orange-500"/>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={openNewProductFromSearch}
                      className="flex w-full items-center gap-3 border-t border-emerald-100 bg-emerald-50 px-4 py-3 text-left text-sm hover:bg-emerald-100"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Plus size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black uppercase tracking-wide text-emerald-800">Registrar producto</p>
                        <p className="truncate text-[10px] font-mono text-emerald-700">
                          {isNumericSearch(productSearch) ? 'Código' : 'Nombre'}: {productSearch.trim()}
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">1 scan = 1 producto (luego ingrese cantidad)</p>
            </div>

            {/* Card 2: Proveedor y fecha */}
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Proveedor y fecha</h3>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Proveedor</label>
                  <button
                    type="button"
                    onClick={() => { setSupplierModalContext('newPurchase'); setSupplierModalOpen(true); }}
                    className="text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600"
                  >
                    + Nuevo proveedor
                  </button>
                </div>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {suppliers.length === 0 && (
                  <p className="mt-1 text-[10px] text-slate-400">No hay proveedores. Crea uno con "+ Nuevo proveedor".</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha de compra</label>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Compra a crédito</label>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                    value={isCredit ? 'si' : 'no'}
                    onChange={e => setIsCredit(e.target.value === 'si')}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Card 3: Referencia y notas */}
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Referencia y notas</h3>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white"
                placeholder="Referencia (Factura, Remisión, etc.)"
                value={reference}
                onChange={e => setReference(e.target.value)}
              />
              <textarea
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white resize-none"
                placeholder="Notas"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              {formError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{formError}</p>
              )}
            </div>

          </div>

          {/* Columna der: card carrito con scroll + totals + botones */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col max-h-[calc(100vh-260px)]">
            {/* Header carrito */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Productos en la entrada</h3>
                <p className="text-[10px] font-bold text-slate-400">{cart.length} producto{cart.length !== 1 ? 's' : ''} · {cart.reduce((s, it) => s + Number(it.qty), 0)} unidades</p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500"
                >
                  Vaciar
                </button>
              )}
            </div>

            {/* Lista con scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[300px]">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <ArrowDownToLine size={36} className="text-slate-300" />
                  <p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-400">Carrito vacío</p>
                  <p className="mt-1 text-[10px] text-slate-400">Busca productos en el panel izquierdo.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((it, idx) => {
                    const product = products.find(p => p.id === it.product_id);
    const subtotal = Number(it.qty) * Number(it.cost_per_unit);
                    return (
                      <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{it.product_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{it.product_sku}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCartItem(idx)}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Unidad</label>
                            <select
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                              value={it.product_uom_id}
                              onChange={e => changeCartItemUom(idx, e.target.value)}
                            >
                              {(product?.product_uoms ?? []).map(pu => (
                                <option key={pu.id} value={pu.id}>
                                  {pu.uom?.name ?? ''} · x{pu.factor_to_base}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Cantidad</label>
                            <input
                              type="number" min="0" step="0.01"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                              value={it.qty_input}
                              onChange={e => updateCartItem(idx, { qty_input: normalizeQtyInput(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Precio compra</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400"
                              type="text"
                              inputMode="decimal"
                              value={it.cost_per_unit_input}
                              onChange={e => updateCartItem(idx, { cost_per_unit_input: normalizeMoneyInput(e.target.value) })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subtotal</span>
                          <span className="text-sm font-black text-slate-900">{formatCurrency(subtotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer: total + botones */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Total compra</span>
                <span className="text-2xl font-black text-orange-600">{formatCurrency(total)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCart([])}
                  disabled={cart.length === 0}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || cart.length === 0}
                  className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-40"
                >
                  {saving && <Loader2 size={14} className="animate-spin"/>}
                  {saving ? 'Guardando…' : 'Registrar entrada'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL EDITAR COMPRA ────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Editar compra</h2>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">Casa Tahona</p>
              </div>
              <button
                onClick={closeEdit}
                disabled={editSaving}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18}/>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 px-6 py-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Proveedor y fecha</h3>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Proveedor</label>
                    <button
                      type="button"
                      onClick={() => { setSupplierModalContext('editPurchase'); setSupplierModalOpen(true); }}
                      className="text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600"
                    >
                      + Nuevo proveedor
                    </button>
                  </div>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                    value={editForm.supplier_id}
                    onChange={e => setEditForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                  >
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha de compra</label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                      value={editForm.purchase_date}
                      onChange={e => setEditForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Compra a crédito</label>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-400 focus:bg-white"
                      value={editForm.is_credit ? 'si' : 'no'}
                      onChange={e => setEditForm(prev => ({ ...prev, is_credit: e.target.value === 'si' }))}
                    >
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Referencia y notas</h3>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white"
                  placeholder="Referencia (Factura, Remisión, etc.)"
                  value={editForm.reference}
                  onChange={e => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
                />
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white resize-none"
                  placeholder="Notas"
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {editError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{editError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button
                onClick={closeEdit}
                disabled={editSaving}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-50"
              >
                {editSaving && <Loader2 size={14} className="animate-spin"/>}
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DETALLE COMPRA ───────────────────────── */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Detalle de compra</h2>
              <button onClick={() => { setDetailOpen(false); setDetail(null); }} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!detail ? (
                <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Folio</p><p className="text-sm font-bold text-slate-900 font-mono">{detail.reference ?? '—'}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</p><p className="text-sm font-bold text-slate-900">{detail.purchase_date}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proveedor</p><p className="text-sm font-bold text-slate-900">{detail.supplier?.name ?? '—'}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p><p className="text-sm font-black text-orange-600">{formatCurrency(detail.total)}</p></div>
                  </div>
                  {detail.notes && <p className="mb-4 text-xs text-slate-500 italic">Notas: {detail.notes}</p>}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="py-2 text-left">Producto</th>
                        <th className="py-2 text-left">Unidad</th>
                        <th className="py-2 text-right">Cant.</th>
                        <th className="py-2 text-right">Prec. Compra</th>
                        <th className="py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.items.map(it => (
                        <tr key={it.id}>
                          <td className="py-2 text-slate-700">{it.product?.name ?? '—'}</td>
                          <td className="py-2 text-slate-600">{it.uom?.name ?? '—'}</td>
                          <td className="py-2 text-right text-slate-700">{it.qty}</td>
                          <td className="py-2 text-right text-slate-700">{formatCurrency(Number(it.cost_per_unit))}</td>
                          <td className="py-2 text-right font-bold text-slate-900">{formatCurrency(it.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR ─────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500"><Trash2 size={22}/></div>
              <div>
                <h3 className="text-base font-black text-slate-900">¿Eliminar compra?</h3>
                <p className="text-xs text-slate-500">Folio {deleteTarget.reference ?? '—'} · {formatCurrency(deleteTarget.total)}</p>
              </div>
            </div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Motivo de eliminación *</label>
            <textarea
              rows={3}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
              value={deleteNote}
              onChange={e => setDeleteNote(e.target.value)}
              placeholder="Explica por qué se elimina…"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteNote(''); }} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting || !deleteNote.trim()} className="flex-1 rounded-2xl bg-red-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-40">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <VinosProductModal
        isOpen={productModalOpen}
        branchDbId={branchDbId}
        branchId={selectedBranchId}
        branchName={branches.find(b => b.id === selectedBranchId)?.name ?? null}
        currentUser={currentUser}
        categories={categories}
        uoms={uoms}
        initialValues={productInitialValues}
        onClose={closeProductModal}
        onSaved={handleProductSaved}
      />

      {/* ─── MODAL NUEVO PROVEEDOR ──────────────────────── */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Nuevo proveedor</h3>
              <button onClick={() => setSupplierModalOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Teléfono</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">RFC</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400" value={newSupplierRfc} onChange={e => setNewSupplierRfc(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Email</label>
                <input type="email" className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400" value={newSupplierEmail} onChange={e => setNewSupplierEmail(e.target.value)} />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setSupplierModalOpen(false)} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={createSupplier} disabled={!newSupplierName.trim()} className="flex-1 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-40">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VinosPurchasesScreen;
