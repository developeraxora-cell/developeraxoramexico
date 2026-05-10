import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Branch, User } from '../../types';
import { catalogService, type Product, type ProductUom } from '../../services/inventory/catalog.service';
import { purchasesService } from '../../services/inventory/purchases.service';
import { supabase } from '../../services/supabaseClient';
import { formatCurrency } from '../../services/currency';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface CartItem {
  productId: string;
  productName: string;
  productUomId: string;
  uomLabel: string;
  factorToBase: number;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface SaleRow {
  id: string;
  created_at: string;
  nombre_cliente: string | null;
  payment_type: string | null;
  notes: string | null;
  total: number;
}

type PaymentMethod = 'EFECTIVO' | 'CREDITO';

const TransportPOSScreen: React.FC<Props> = ({ selectedBranchId, currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [defaultUomMap, setDefaultUomMap] = useState<Record<string, ProductUom>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const [clientName, setClientName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [notes, setNotes] = useState('');
  const [isSelling, setIsSelling] = useState(false);

  const [salesHistory, setSalesHistory] = useState<SaleRow[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [feedback, setFeedback] = useState<{ type: FeedbackType; title: string; description: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!selectedBranchId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [prods, stock] = await Promise.all([
        catalogService.listProductsByBranch(selectedBranchId),
        catalogService.listStockByBranch(selectedBranchId),
      ]);
      const productIds = prods.map((p) => p.id);
      const defaultUoms = productIds.length > 0
        ? await catalogService.listDefaultSaleUoms(productIds)
        : [];

      setProducts(prods);
      const smap: Record<string, number> = {};
      stock.forEach((s) => { smap[s.product_id] = s.qty_base; });
      setStockMap(smap);
      const umap: Record<string, ProductUom> = {};
      defaultUoms.forEach((u) => { umap[u.product_id] = u; });
      setDefaultUomMap(umap);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al cargar catálogo.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId]);

  const loadHistory = useCallback(async () => {
    if (!selectedBranchId) return;
    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('id, created_at, nombre_cliente, payment_type, notes, inventory_transaction_items(unit_price, qty)')
        .eq('branch_id', selectedBranchId)
        .eq('type', 'SALE')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows: SaleRow[] = (data ?? []).map((tx: any) => {
        const total = (tx.inventory_transaction_items ?? []).reduce(
          (acc: number, item: any) => acc + Number(item.unit_price ?? 0) * Number(item.qty ?? 0),
          0
        );
        return {
          id: tx.id,
          created_at: tx.created_at,
          nombre_cliente: tx.nombre_cliente ?? null,
          payment_type: tx.payment_type ?? null,
          notes: tx.notes ?? null,
          total,
        };
      });
      setSalesHistory(rows);
    } catch {
      // history load failures are non-critical
    } finally {
      setIsHistoryLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    void loadCatalog();
    void loadHistory();
  }, [loadCatalog, loadHistory]);

  const filteredProducts = useMemo(
    () => products.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [products, searchTerm]
  );

  const addToCart = (product: Product) => {
    const uom = defaultUomMap[product.id];
    if (!uom) {
      setFeedback({ type: 'error', title: 'Sin unidad de venta', description: `El producto "${product.name}" no tiene una unidad de venta configurada.` });
      return;
    }
    const stockAvail = stockMap[product.id] ?? 0;
    if (stockAvail <= 0) {
      setFeedback({ type: 'error', title: 'Sin stock', description: `"${product.name}" no tiene stock disponible.` });
      return;
    }
    const unitPrice = uom.retail_price ?? product.retail_price ?? 0;
    const uomLabel = uom.uom?.name ?? uom.uom?.code ?? 'U';

    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id && c.productUomId === uom.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === product.id && c.productUomId === uom.id
            ? { ...c, qty: c.qty + 1, lineTotal: (c.qty + 1) * c.unitPrice }
            : c
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productUomId: uom.id,
          uomLabel,
          factorToBase: uom.factor_to_base,
          qty: 1,
          unitPrice,
          lineTotal: unitPrice,
        },
      ];
    });
  };

  const updateCartQty = (productId: string, uomId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => !(c.productId === productId && c.productUomId === uomId)));
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.productUomId === uomId
          ? { ...c, qty, lineTotal: qty * c.unitPrice }
          : c
      )
    );
  };

  const updateCartPrice = (productId: string, uomId: string, price: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.productUomId === uomId
          ? { ...c, unitPrice: price, lineTotal: c.qty * price }
          : c
      )
    );
  };

  const removeFromCart = (productId: string, uomId: string) => {
    setCart((prev) => prev.filter((c) => !(c.productId === productId && c.productUomId === uomId)));
  };

  const cartTotal = cart.reduce((acc, c) => acc + c.lineTotal, 0);

  const handleCheckout = () => {
    if (cart.length === 0) {
      setFeedback({ type: 'error', title: 'Carrito vacío', description: 'Agrega al menos un producto antes de confirmar la venta.' });
      return;
    }
    if (paymentMethod === 'CREDITO' && !clientName.trim()) {
      setFeedback({ type: 'error', title: 'Nombre requerido', description: 'Para ventas a crédito debes registrar el nombre del cliente.' });
      return;
    }
    setConfirmState({
      title: 'Confirmar venta',
      description: `¿Confirmas la venta por ${formatCurrency(cartTotal)} en ${paymentMethod === 'EFECTIVO' ? 'efectivo' : 'crédito'}?`,
      onConfirm: () => void processSale(),
    });
  };

  const processSale = async () => {
    setIsSelling(true);
    setConfirmState(null);
    try {
      await purchasesService.createSale({
        branch_id: selectedBranchId,
        created_by: currentUser.id,
        nombre_cliente: clientName.trim() || null,
        payment_type: paymentMethod,
        notes: notes.trim() || null,
        cartItems: cart.map((c) => ({
          product_id: c.productId,
          product_uom_id: c.productUomId,
          qty: c.qty,
          factor_used: c.factorToBase,
          qty_base: c.qty * c.factorToBase,
          unit_price: c.unitPrice,
          line_total: c.lineTotal,
        })),
      });

      setCart([]);
      setClientName('');
      setNotes('');
      setPaymentMethod('EFECTIVO');
      setFeedback({ type: 'success', title: 'Venta registrada', description: `Venta de ${formatCurrency(cartTotal)} registrada correctamente.` });
      void loadCatalog();
      void loadHistory();
    } catch (err) {
      setFeedback({ type: 'error', title: 'Error al procesar', description: err instanceof Error ? err.message : 'No se pudo registrar la venta.' });
    } finally {
      setIsSelling(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <FeedbackModal
          isOpen={true}
          type={feedback.type}
          title={feedback.title}
          description={feedback.description}
          onClose={() => setFeedback(null)}
        />
      )}
      {confirmState && (
        <ConfirmModal
          isOpen={true}
          title={confirmState.title}
          description={confirmState.description}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Product catalog */}
        <div className="xl:col-span-3 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar producto por nombre o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
            />
          </div>

          {isLoading && (
            <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
              <p className="text-sm font-bold text-slate-400 animate-pulse">Cargando catálogo...</p>
            </div>
          )}
          {loadError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-semibold text-red-700">{loadError}</div>
          )}

          {!isLoading && !loadError && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filteredProducts.length === 0 && (
                <div className="col-span-full rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-bold text-slate-400">
                  {products.length === 0 ? 'No hay productos en esta sucursal.' : 'Sin resultados.'}
                </div>
              )}
              {filteredProducts.map((p) => {
                const stock = stockMap[p.id] ?? 0;
                const uom = defaultUomMap[p.id];
                const price = uom?.retail_price ?? p.retail_price ?? 0;
                const noStock = stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={noStock}
                    className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md active:scale-95 ${
                      noStock
                        ? 'border-slate-100 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-orange-300 hover:shadow-orange-100'
                    }`}
                  >
                    <p className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{p.name}</p>
                    {p.sku && <p className="mt-1 font-mono text-[10px] text-slate-400">{p.sku}</p>}
                    <p className="mt-2 text-sm font-black text-orange-600">{formatCurrency(price)}</p>
                    <p className={`mt-1 text-[10px] font-bold ${noStock ? 'text-red-500' : 'text-slate-400'}`}>
                      Stock: {stock.toLocaleString('es-MX')} {uom?.uom?.code ?? ''}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart & checkout */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                🛒 Carrito ({cart.length} líneas)
              </p>
            </div>

            {cart.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm font-bold text-slate-300">
                Toca un producto para agregarlo
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {cart.map((item) => (
                  <div key={`${item.productId}-${item.productUomId}`} className="px-4 py-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.productName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.uomLabel}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-[10px] text-slate-400 font-bold">Cant:</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.qty}
                          onChange={(e) => updateCartQty(item.productId, item.productUomId, Number(e.target.value))}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-orange-400 text-center"
                        />
                        <label className="text-[10px] text-slate-400 font-bold">Precio:</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateCartPrice(item.productId, item.productUomId, Number(e.target.value))}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-orange-400 text-right"
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-slate-900">{formatCurrency(item.lineTotal)}</p>
                      <button
                        onClick={() => removeFromCart(item.productId, item.productUomId)}
                        className="mt-1 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Total</p>
              <p className="text-xl font-black text-slate-900">{formatCurrency(cartTotal)}</p>
            </div>
          </div>

          {/* Checkout form */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Método de pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['EFECTIVO', 'CREDITO'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      paymentMethod === m
                        ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {m === 'EFECTIVO' ? '💵 Efectivo' : '📋 Crédito'}
                  </button>
                ))}
              </div>
              {paymentMethod === 'CREDITO' && (
                <p className="mt-2 text-[10px] text-orange-600 font-semibold bg-orange-50 rounded-lg px-3 py-1.5">
                  Crédito básico — gestión de pagarés y saldo en próxima entrega.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Nombre del cliente {paymentMethod === 'CREDITO' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                placeholder="Nombre o razón social"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Notas (opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Referencia, número de orden, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 resize-none"
              />
            </div>

            <button
              onClick={handleCheckout}
              disabled={isSelling || cart.length === 0}
              className="w-full py-4 rounded-2xl bg-orange-600 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-orange-600/30 hover:bg-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSelling ? 'Procesando...' : `Confirmar venta — ${formatCurrency(cartTotal)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Sales history */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">📋 Últimas ventas</p>
          <button
            onClick={() => void loadHistory()}
            disabled={isHistoryLoading}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 transition-colors disabled:opacity-50"
          >
            ↻ Actualizar
          </button>
        </div>
        {isHistoryLoading ? (
          <div className="p-6 text-center text-sm font-bold text-slate-300 animate-pulse">Cargando historial...</div>
        ) : salesHistory.length === 0 ? (
          <div className="p-6 text-center text-sm font-bold text-slate-300">Sin ventas registradas aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Pago</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salesHistory.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-slate-600">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{s.nombre_cliente || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      s.payment_type === 'EFECTIVO'
                        ? 'bg-green-100 text-green-700'
                        : s.payment_type === 'CREDITO'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {s.payment_type ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-xs font-black text-slate-900">{formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TransportPOSScreen;
