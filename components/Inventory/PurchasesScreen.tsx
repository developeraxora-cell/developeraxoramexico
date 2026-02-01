import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Eye, History, Plus } from 'lucide-react';
import { Branch, User } from '../../types';
import { supabase } from '../../services/supabaseClient';
import NewProductModal from './NewProductModal';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';
import {
  catalogService,
  type Category,
  type Product,
  type ProductUom,
  type Uom,
} from '../../services/inventory/catalog.service';
import { purchasesService } from '../../services/inventory/purchases.service';

interface PurchasesScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

interface PurchaseCartItem {
  product_id: string;
  product_name: string;
  barcode: string;
  product_uom_id: string;
  uom_name: string;
  uom_code: string;
  factor_to_base: number;
  is_divisible: boolean;
  qty: number;
  unit_price: number;
}

interface PurchaseHistoryEntry {
  id: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  items_count: number;
  total_amount: number;
}

interface PurchaseItemDetail {
  id: string;
  qty: number;
  unit_price: number;
  qty_base: number;
  product: {
    name: string;
    sku: string | null;
    barcode: string | null;
    base_uom_id: string | null;
  } | null;
  uom: {
    name: string | null;
    code: string | null;
  } | null;
}

interface PendingUomSelection {
  product: Product;
  uoms: ProductUom[];
}

const PurchasesScreen: React.FC<PurchasesScreenProps> = ({ selectedBranchId, currentUser, branches }) => {
  const [viewMode, setViewMode] = useState<'HISTORY' | 'CREATE'>('HISTORY');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [cartItems, setCartItems] = useState<PurchaseCartItem[]>([]);
  const [history, setHistory] = useState<PurchaseHistoryEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [pendingUomSelection, setPendingUomSelection] = useState<PendingUomSelection | null>(null);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [reactivateProduct, setReactivateProduct] = useState<Product | null>(null);
  const [reactivateUoms, setReactivateUoms] = useState<ProductUom[]>([]);
  const [isClearHistoryOpen, setIsClearHistoryOpen] = useState(false);
  const [isPurchaseDetailOpen, setIsPurchaseDetailOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseHistoryEntry | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemDetail[]>([]);
  const [isLoadingPurchaseItems, setIsLoadingPurchaseItems] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('alert');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const totalAmount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.qty * item.unit_price, 0);
  }, [cartItems]);
  const branchId = useMemo(() => {
    const match = branches.find(b => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || null;
  }, [branches, selectedBranchId]);
  const uomById = useMemo(() => {
    return uoms.reduce<Record<string, Uom>>((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});
  }, [uoms]);
  const loadCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    try {
      const [uomsData, categoriesData] = await Promise.all([
        catalogService.listUoms(),
        catalogService.listCategories(),
      ]);

      setUoms(uomsData);
      setCategories(categoriesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar catálogo.';
      setError(message);
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!branchId) return;
    setIsLoadingHistory(true);
    try {
      const { data: transactions, error: txError } = await supabase
        .from('inventory_transactions')
        .select('id, reference, notes, created_at')
        .eq('branch_id', branchId)
        .eq('type', 'PURCHASE')
        .order('created_at', { ascending: false })
        .limit(50);
      if (txError) throw txError;
      const transactionIds = (transactions ?? []).map((tx) => tx.id);

      let itemsSummary: Record<string, { count: number; total: number }> = {};

      if (transactionIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('inventory_transaction_items')
          .select('transaction_id, qty, unit_price')
          .in('transaction_id', transactionIds);

        if (itemsError) throw itemsError;

        itemsSummary = (items ?? []).reduce<Record<string, { count: number; total: number }>>((acc, item) => {
          const current = acc[item.transaction_id] ?? { count: 0, total: 0 };
          current.count += 1;
          current.total += Number(item.qty) * Number(item.unit_price || 0);
          acc[item.transaction_id] = current;
          return acc;
        }, {});
      }

      const formatted = (transactions ?? []).map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        notes: tx.notes,
        created_at: tx.created_at,
        items_count: itemsSummary[tx.id]?.count ?? 0,
        total_amount: itemsSummary[tx.id]?.total ?? 0,
      }));

      setHistory(formatted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el historial.';
      setError(message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedBranchId]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(history.length / historyPageSize));
    setHistoryPage((prev) => Math.min(prev, totalPages));
  }, [history.length]);

  useEffect(() => {
    if (viewMode === 'CREATE') {
      scanInputRef.current?.focus();
    }
  }, [viewMode]);

  const addToCart = (product: Product, uom: ProductUom) => {
    if (!uom || !uom.uom_id) {
      setError('Unidad de compra inválida. Verifique las UOMs del producto.');
      return;
    }
    const uomMeta = uomById[uom.uom_id];
    const uomName = uomMeta?.name ?? 'UOM';
    const uomCode = uomMeta?.code ?? '';

    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product_id === product.id && item.product_uom_id === uom.id
      );

      if (existingIndex >= 0) {
        const next = [...prev];
        const existing = next[existingIndex];
        const nextQty = existing.qty + 1;
        next[existingIndex] = {
          ...existing,
          qty: product.is_divisible ? nextQty : Math.round(nextQty),
        };
        return next;
      }

      return [
        {
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode,
          product_uom_id: uom.id,
          uom_name: uomName,
          uom_code: uomCode,
          factor_to_base: Number(uom.factor_to_base),
          is_divisible: product.is_divisible,
          qty: 1,
          unit_price: 0,
        },
        ...prev,
      ];
    });
  };

  const handleScan = async () => {
    const barcode = barcodeInput.trim();
    if (!barcode || !branchId) return;

    setError(null);
    setIsScanning(true);

    try {
      const product = await catalogService.findProductByBarcode(branchId, barcode);
      if (!product) {
        setPendingBarcode(barcode);
        setIsNewProductOpen(true);
        return;
      }

      if (product.is_active === false) {
        const uomsData = await catalogService.listProductUoms(product.id);
        setPendingBarcode(barcode);
        setReactivateProduct(product);
        setReactivateUoms(uomsData);
        setIsNewProductOpen(true);
        return;
      }

      const defaultUom = await catalogService.getDefaultPurchaseUom(product.id);
      if (defaultUom && defaultUom.uom_id) {
        addToCart(product, defaultUom);
        return;
      }

      const purchaseUoms = await catalogService.getPurchaseUoms(product.id);
      const validPurchaseUoms = purchaseUoms.filter((uom) => Boolean(uom && uom.uom_id));

      if (validPurchaseUoms.length === 0) {
        showFeedback('alert', 'UOM requerida', 'Este producto no tiene UOM de compra válida.');
        return;
      }

      if (validPurchaseUoms.length === 1) {
        addToCart(product, validPurchaseUoms[0]);
        return;
      }

      setPendingUomSelection({ product, uoms: validPurchaseUoms });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo leer el barcode.';
      setError(message);
    } finally {
      setIsScanning(false);
      setBarcodeInput('');
      scanInputRef.current?.focus();
    }
  };

  const updateCartItem = (productId: string, uomId: string, next: Partial<PurchaseCartItem>) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product_id === productId && item.product_uom_id === uomId ? { ...item, ...next } : item
      )
    );
  };

  const removeCartItem = (productId: string, uomId: string) => {
    setCartItems((prev) => prev.filter((item) => !(item.product_id === productId && item.product_uom_id === uomId)));
  };

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  };

  const closeFeedback = () => {
    if (feedbackType === 'loading') return;
    setFeedbackOpen(false);
  };

  const handleSavePurchase = async () => {
    if (!branchId) {
      showFeedback('alert', 'Sucursal requerida', 'Seleccione una sucursal antes de registrar compras.');
      return;
    }

    if (cartItems.length === 0) {
      showFeedback('alert', 'Carrito vacío', 'Agregue al menos un producto al carrito.');
      return;
    }

    if (!reference.trim() || !notes.trim()) {
      showFeedback('alert', 'Referencia y nota requeridas', 'Capture referencia y notas antes de guardar la compra.');
      return;
    }

    const invalidQty = cartItems.find((item) => item.qty <= 0 || Number.isNaN(item.qty));
    if (invalidQty) {
      showFeedback('alert', 'Cantidad inválida', 'Hay cantidades inválidas en el carrito.');
      return;
    }

    const invalidDecimal = cartItems.find((item) => !item.is_divisible && !Number.isInteger(item.qty));
    if (invalidDecimal) {
      showFeedback('alert', 'Cantidad inválida', `El producto ${invalidDecimal.product_name} no permite decimales.`);
      return;
    }

    const invalidPrice = cartItems.find((item) => item.unit_price <= 0 || Number.isNaN(item.unit_price));
    if (invalidPrice) {
      showFeedback('alert', 'Monto inválido', `El producto ${invalidPrice.product_name} tiene costo 0. Capture un precio válido.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    showFeedback('loading', 'Registrando compra', 'Procesando información...');

    try {
      await purchasesService.createPurchase({
        branch_id: branchId,
        reference: reference.trim(),
        notes: notes.trim(),
        created_by: currentUser.id,
        cartItems: cartItems.map((item) => ({
          product_id: item.product_id,
          product_uom_id: item.product_uom_id,
          qty: item.qty,
          unit_price: item.unit_price,
          barcode_scanned: item.barcode,
        })),
      });

      setCartItems([]);
      setReference('');
      setNotes('');
      setFeedbackOpen(false);
      showFeedback('success', 'Compra registrada', 'La compra se guardó correctamente.');
      setViewMode('HISTORY');
      await loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la compra.';
      setFeedbackOpen(false);
      showFeedback('error', 'No se pudo guardar', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHistory = async () => {
    if (!branchId) {
      showFeedback('alert', 'Sucursal requerida', 'Seleccione una sucursal antes de limpiar el historial.');
      return;
    }

    setIsClearHistoryOpen(false);
    showFeedback('loading', 'Limpiando historial', 'Eliminando registros...');

    try {
      const result = await purchasesService.clearPurchaseHistory(branchId);
      setFeedbackOpen(false);
      showFeedback('success', 'Historial eliminado', `Se eliminaron ${result.deleted} compras.`);
      await loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo limpiar el historial.';
      setFeedbackOpen(false);
      showFeedback('error', 'No se pudo limpiar', message);
    }
  };

  const handleOpenPurchaseDetail = async (purchase: PurchaseHistoryEntry) => {
    setSelectedPurchase(purchase);
    setIsPurchaseDetailOpen(true);
    setIsLoadingPurchaseItems(true);
    setError(null);
    try {
      const { data, error: itemsError } = await supabase
        .from('inventory_transaction_items')
        .select(`
          id,
          qty,
          unit_price,
          qty_base,
          product_id,
          product_uom_id,
          products ( name, sku, barcode, base_uom_id ),
          product_uoms ( uom_id, uoms ( name, code ) )
        `)
        .eq('transaction_id', purchase.id);

      if (itemsError) throw itemsError;

      const normalized = (data ?? []).map((row: any) => ({
        id: row.id,
        qty: Number(row.qty ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        qty_base: Number(row.qty_base ?? 0),
        product: row.products ?? null,
        uom: row.product_uoms?.uoms ?? null,
      })) as PurchaseItemDetail[];

      setPurchaseItems(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el detalle de la compra.';
      setError(message);
    } finally {
      setIsLoadingPurchaseItems(false);
    }
  };


  const handleProductCreated = (payload: { product: Product; purchaseUom: ProductUom }) => {
    addToCart(payload.product, payload.purchaseUom);
    setIsNewProductOpen(false);
    setPendingBarcode('');
    scanInputRef.current?.focus();
  };

  const handleProductReactivated = (payload: { product: Product; purchaseUom: ProductUom }) => {
    addToCart(payload.product, payload.purchaseUom);
    setIsNewProductOpen(false);
    setReactivateProduct(null);
    setReactivateUoms([]);
    setPendingBarcode('');
    scanInputRef.current?.focus();
  };

  const handleBarcodeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleScan();
  };

  const formatLocalDateTime = (value: string) => {
    const normalized = value.endsWith('Z') ? value : `${value}Z`;
    return new Date(normalized).toLocaleString();
  };

  const selectedBranchLabel = branchId ? 'Sucursal activa' : 'Seleccione sucursal';
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / historyPageSize));
  const historyStart = (historyPage - 1) * historyPageSize;
  const historyEnd = historyStart + historyPageSize;
  const pagedHistory = history.slice(historyStart, historyEnd);
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white px-6 py-5 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              {viewMode === 'HISTORY' ? 'Historial de Compras' : 'Nueva Compra'}
            </h2>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
              {selectedBranchLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          {viewMode === 'HISTORY' && (
            <button
              onClick={() => setIsClearHistoryOpen(true)}
              className="px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100"
            >
              <span className="inline-flex items-center gap-2">
                <Brush className="w-4 h-4" />
                Limpiar Historial
              </span>
            </button>
          )}
          <button
            onClick={() => setViewMode(viewMode === 'HISTORY' ? 'CREATE' : 'HISTORY')}
            className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-all ${viewMode === 'HISTORY' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-600'
              }`}
          >
            <span className="inline-flex items-center gap-2">
              {viewMode === 'HISTORY' && <Plus className="w-4 h-4" />}
              {viewMode === 'HISTORY' ? 'Registrar Compra' : 'Volver al Historial'}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      {viewMode === 'CREATE' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paso 1: Escaneo de Producto</p>
              <input
                ref={scanInputRef}
                type="text"
                placeholder="Escanee el barcode y presione Enter"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKey}
                disabled={!branchId || isScanning}
              />
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {branchId ? '1 scan = 1 producto (luego ingrese cantidad)' : 'Seleccione sucursal antes de escanear'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referencia y notas</p>
              <input
                type="text"
                placeholder="Referencia (Factura, Remisión, etc.)"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <textarea
                placeholder="Notas"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500 min-h-[120px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carrito de compra</p>
                  <p className="text-xs font-black">{cartItems.length} productos</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total estimado</p>
                  <p className="text-2xl font-black">${totalAmount.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto min-h-[420px] space-y-3">
                {cartItems.length === 0 && (
                  <div className="py-20 text-center text-slate-300 italic text-sm">Escanee productos para iniciar el carrito</div>
                )}
                {cartItems.map((item) => (
                  <div
                    key={`${item.product_id}-${item.product_uom_id}`}
                    className="bg-slate-50 p-4 rounded-3xl border border-slate-100 grid grid-cols-12 gap-4 items-center"
                  >
                    <div className="col-span-5">
                      <p className="font-black text-xs text-slate-800 uppercase">{item.product_name}</p>
                      <p className="text-[9px] text-slate-400 font-mono">{item.barcode}</p>
                      <p className="text-[9px] text-slate-500">
                        UOM: {item.uom_name} {item.uom_code ? `(${item.uom_code})` : ''} · Factor {item.factor_to_base}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Cantidad</label>
                      <input
                        type="number"
                        min={0}
                        step={item.is_divisible ? '0.01' : '1'}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl font-black text-xs"
                        value={item.qty}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const normalized = item.is_divisible ? raw : Math.round(raw);
                          updateCartItem(item.product_id, item.product_uom_id, { qty: normalized });
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Costo Unitario</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl font-black text-xs text-red-600"
                        value={item.unit_price}
                        onChange={(e) => updateCartItem(item.product_id, item.product_uom_id, { unit_price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        onClick={() => removeCartItem(item.product_id, item.product_uom_id)}
                        className="text-slate-300 hover:text-red-500 text-lg"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Total compra</p>
                  <p className="text-3xl font-black text-slate-900">${totalAmount.toLocaleString()}</p>
                </div>
                <button
                  onClick={handleSavePurchase}
                  disabled={cartItems.length === 0 || isSaving}
                  className={`px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all ${cartItems.length > 0 && !isSaving
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-slate-200 text-slate-400'
                    }`}
                >
                  {isSaving ? 'Guardando...' : 'Confirmar Compra'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest">Fecha</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest">Referencia</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest">Notas</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">Items</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-right">Monto Total</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedHistory.map((p) => (
                  <tr
                    key={p.id}
                    className="bg-white hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-700">
                        {formatLocalDateTime(p.created_at)}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700">
                        {p.reference || 'S/N'}
                      </span>
                    </td>
                    <td className="p-4 text-[11px] text-slate-500 italic">
                      <div className="line-clamp-2 max-w-xs">{p.notes || '—'}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-[10px] font-black">
                        {p.items_count}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-base font-black text-slate-900">
                        ${p.total_amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-center flex items-center justify-center">
                      <button
                        onClick={() => handleOpenPurchaseDetail(p)}
                        className="w-8 h-8 text-center rounded-lg bg-blue-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4 text-blue-600" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoadingHistory && history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-slate-300 italic">
                      No hay registros de compras recientes
                    </td>
                  </tr>
                )}
                {isLoadingHistory && (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-slate-300 italic">Cargando historial...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!isLoadingHistory && history.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 pb-6">
              <div className="text-[11px] text-slate-500 font-bold">
                Mostrando {historyStart + 1}-{Math.min(historyEnd, history.length)} de {history.length} registros
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  disabled={historyPage === 1}
                  title="Anterior"
                >
                  ‹
                </button>
                {Array.from({ length: totalHistoryPages }).slice(0, 5).map((_, index) => {
                  const page = index + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => setHistoryPage(page)}
                      className={`w-8 h-8 rounded-lg text-[11px] font-black ${historyPage === page ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      {page}
                    </button>
                  );
                })}
                {totalHistoryPages > 5 && (
                  <>
                    <span className="text-slate-400">…</span>
                    <button
                      onClick={() => setHistoryPage(totalHistoryPages)}
                      className={`w-8 h-8 rounded-lg text-[11px] font-black ${historyPage === totalHistoryPages ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      {totalHistoryPages}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  disabled={historyPage === totalHistoryPages}
                  title="Siguiente"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {pendingUomSelection && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">Seleccionar UOM de Compra</h3>
                <p className="text-slate-400 text-xs">{pendingUomSelection.product.name}</p>
              </div>
              <button
                onClick={() => setPendingUomSelection(null)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-3">
              {pendingUomSelection.uoms.filter((uom) => Boolean(uom && uom.uom_id)).map((uom) => {
                const meta = uomById[uom.uom_id];
                return (
                  <button
                    key={uom.id}
                    onClick={() => {
                      addToCart(pendingUomSelection.product, uom);
                      setPendingUomSelection(null);
                    }}
                    className="w-full p-4 rounded-2xl border border-slate-200 text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all"
                  >
                    <p className="text-sm font-black text-slate-900">
                      {meta?.name ?? 'UOM'} {meta?.code ? `(${meta.code})` : ''}
                    </p>
                    <p className="text-[10px] text-slate-500">Factor a base: {uom.factor_to_base}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <NewProductModal
        isOpen={isNewProductOpen}
        barcode={pendingBarcode}
        branchId={branchId}
        uoms={uoms}
        categories={categories}
        isCatalogLoading={isCatalogLoading}
        mode={reactivateProduct ? 'reactivate' : 'create'}
        existingProduct={reactivateProduct}
        existingUoms={reactivateUoms}
        allowBarcodeEdit={false}
        onClose={() => {
          setIsNewProductOpen(false);
          setPendingBarcode('');
          setReactivateProduct(null);
          setReactivateUoms([]);
        }}
        onCreated={handleProductCreated}
        onReactivated={handleProductReactivated}
      />

      <ConfirmModal
        isOpen={isClearHistoryOpen}
        title="Limpiar historial de compras"
        description="Se eliminarán todas las compras registradas en esta sucursal. Esta acción no modifica el stock."
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleClearHistory}
        onCancel={() => setIsClearHistoryOpen(false)}
      />

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={closeFeedback}
      />

      {isPurchaseDetailOpen && selectedPurchase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[70vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Detalle de Compra</h3>
                <p className="text-slate-400 text-xs">
                  {selectedPurchase.reference || 'S/N'} · {formatLocalDateTime(selectedPurchase.created_at)}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsPurchaseDetailOpen(false);
                  setSelectedPurchase(null);
                  setPurchaseItems([]);
                }}
                className="text-slate-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {isLoadingPurchaseItems && (
                <div className="p-6 text-center text-slate-400 text-sm">Cargando detalle...</div>
              )}
              {!isLoadingPurchaseItems && purchaseItems.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-sm">No hay productos en esta compra.</div>
              )}
              {!isLoadingPurchaseItems && purchaseItems.length > 0 && (
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest">Producto</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest">SKU</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest">UOM</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right">Cantidad</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right">Precio</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseItems.map((item) => {
                      const subtotal = Number(item.qty) * Number(item.unit_price);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3 text-xs font-black text-slate-800 uppercase">
                            {item.product?.name ?? '—'}
                          </td>
                          <td className="p-3 text-xs font-mono text-slate-500">{item.product?.sku ?? '—'}</td>
                          <td className="p-3 text-xs text-slate-600">
                            {item.uom?.name ?? 'UOM'}{item.uom?.code ? ` (${item.uom?.code})` : ''}
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-600 text-right">
                            {Number(item.qty).toLocaleString()}
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-600 text-right">
                            ${Number(item.unit_price).toLocaleString()}
                          </td>
                          <td className="p-3 text-xs font-black text-slate-900 text-right">
                            ${subtotal.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                {selectedPurchase.notes ? `Notas: ${selectedPurchase.notes}` : 'Sin notas'}
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase">Total</p>
                <p className="text-2xl font-black text-slate-900">
                  ${selectedPurchase.total_amount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasesScreen;
