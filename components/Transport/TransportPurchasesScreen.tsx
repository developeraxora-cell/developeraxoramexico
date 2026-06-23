import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Branch, User } from '../../types';
import { catalogService, type Product, type ProductUom, type Supplier } from '../../services/inventory/catalog.service';
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

interface PurchaseLine {
  productId: string;
  productName: string;
  productUomId: string;
  uomLabel: string;
  factorToBase: number;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseRow {
  id: string;
  created_at: string;
  reference: string | null;
  notes: string | null;
  supplier_name: string | null;
  total: number;
}

const TransportPurchasesScreen: React.FC<Props> = ({ selectedBranchId, currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [defaultPurchaseUoms, setDefaultPurchaseUoms] = useState<Record<string, ProductUom>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isCredit, setIsCredit] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [history, setHistory] = useState<PurchaseRow[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [feedback, setFeedback] = useState<{ type: FeedbackType; title: string; description: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!selectedBranchId) return;
    setIsLoading(true);
    try {
      const [prods, supps] = await Promise.all([
        catalogService.listProductsByBranch(selectedBranchId),
        catalogService.listSuppliersByBranch(selectedBranchId),
      ]);
      setProducts(prods);
      setSuppliers(supps);

      if (prods.length > 0) {
        const ids = prods.map((p) => p.id);
        const { data: uomRows, error } = await supabase
          .from('product_uoms')
          .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms(id, code, name)')
          .in('product_id', ids)
          .eq('is_default_purchase', true);
        if (!error) {
          const map: Record<string, ProductUom> = {};
          (uomRows ?? []).forEach((row: any) => {
            map[row.product_id] = { ...row, uom: row.uoms } as ProductUom;
          });
          setDefaultPurchaseUoms(map);
        }
      }
    } catch {
      // silent
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
        .select('id, created_at, reference, notes, supplier_id, inventory_transaction_items(unit_price, qty)')
        .eq('branch_id', selectedBranchId)
        .eq('type', 'PURCHASE')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      const rows: PurchaseRow[] = (data ?? []).map((tx: any) => {
        const total = (tx.inventory_transaction_items ?? []).reduce(
          (acc: number, item: any) => acc + Number(item.unit_price ?? 0) * Number(item.qty ?? 0),
          0
        );
        const supplier = suppliers.find((s) => s.id === tx.supplier_id);
        return {
          id: tx.id,
          created_at: tx.created_at,
          reference: tx.reference ?? null,
          notes: tx.notes ?? null,
          supplier_name: supplier?.name ?? null,
          total,
        };
      });
      setHistory(rows);
    } catch {
      // silent
    } finally {
      setIsHistoryLoading(false);
    }
  }, [selectedBranchId, suppliers]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const addLine = () => {
    if (!selectedProductId) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const uom = defaultPurchaseUoms[product.id];
    if (!uom) {
      setFeedback({ type: 'error', title: 'Sin unidad de compra', description: `"${product.name}" no tiene unidad de compra configurada.` });
      return;
    }

    const existing = lines.find((l) => l.productId === product.id && l.productUomId === uom.id);
    if (existing) {
      setFeedback({ type: 'error', title: 'Ya en la lista', description: `"${product.name}" ya está en esta entrada.` });
      return;
    }

    const unitCost = uom.wholesale_price ?? product.purchase_price ?? 0;
    const uomLabel = uom.uom?.name ?? uom.uom?.code ?? 'U';

    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productUomId: uom.id,
        uomLabel,
        factorToBase: uom.factor_to_base,
        qty: 1,
        unitCost,
        lineTotal: unitCost,
      },
    ]);
    setSelectedProductId('');
  };

  const updateLine = (productId: string, uomId: string, field: 'qty' | 'unitCost', value: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (!(l.productId === productId && l.productUomId === uomId)) return l;
        const next = { ...l, [field]: value };
        next.lineTotal = next.qty * next.unitCost;
        return next;
      })
    );
  };

  const removeLine = (productId: string, uomId: string) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.productUomId === uomId)));
  };

  const purchaseTotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);

  const handleSubmit = () => {
    if (lines.length === 0) {
      setFeedback({ type: 'error', title: 'Sin productos', description: 'Agrega al menos un producto a la entrada.' });
      return;
    }
    setConfirmState({
      title: 'Confirmar entrada',
      description: `¿Confirmas la entrada de ${lines.length} producto(s) por ${formatCurrency(purchaseTotal)}?`,
      onConfirm: () => void processPurchase(),
    });
  };

  const processPurchase = async () => {
    setIsSaving(true);
    setConfirmState(null);
    try {
      const suppId = selectedSupplierId || null;
      await purchasesService.createPurchase({
        branch_id: selectedBranchId,
        created_by: currentUser.id,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        supplier_id: suppId,
        purchase_date: purchaseDate || null,
        is_credit: isCredit,
        cartItems: lines.map((l) => ({
          product_id: l.productId,
          product_uom_id: l.productUomId,
          qty: l.qty,
          unit_price: l.unitCost,
          barcode_scanned: '',
          factor_to_base: l.factorToBase,
        })),
      });

      setLines([]);
      setReference('');
      setNotes('');
      setSelectedSupplierId('');
      setSupplierName('');
      setIsCredit(false);
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      setFeedback({ type: 'success', title: 'Entrada registrada', description: `Entrada de ${formatCurrency(purchaseTotal)} registrada correctamente.` });
      void loadHistory();
    } catch (err) {
      setFeedback({ type: 'error', title: 'Error', description: err instanceof Error ? err.message : 'No se pudo registrar la entrada.' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <FeedbackModal isOpen={true} type={feedback.type} title={feedback.title} description={feedback.description} onClose={() => setFeedback(null)} />
      )}
      {confirmState && (
        <ConfirmModal isOpen={true} title={confirmState.title} description={confirmState.description} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowForm((v) => !v)}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm ${
            showForm
              ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/20'
          }`}
        >
          {showForm ? '✕ Cancelar' : '+ Nueva entrada'}
        </button>
      </div>

      {/* New purchase form */}
      {showForm && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">📥 Registrar nueva entrada</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Fecha</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Proveedor</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400 bg-white"
              >
                <option value="">Sin proveedor / libre</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Folio / Referencia</label>
              <input
                type="text"
                placeholder="Ej. FAC-001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCredit}
                onChange={(e) => setIsCredit(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-bold text-slate-600">Compra a crédito</span>
            </label>
          </div>

          {/* Add product line */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Agregar producto</label>
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400 bg-white"
                disabled={isLoading}
              >
                <option value="">Selecciona un producto...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                ))}
              </select>
              <button
                onClick={addLine}
                disabled={!selectedProductId}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-40 transition-all"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Producto</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Cant.</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Costo compra</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Subtotal</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={`${l.productId}-${l.productUomId}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 text-xs">{l.productName}</p>
                        <p className="text-[10px] text-slate-400">{l.uomLabel}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={l.qty}
                          onChange={(e) => updateLine(l.productId, l.productUomId, 'qty', Number(e.target.value))}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-center outline-none focus:border-orange-400"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.unitCost}
                          onChange={(e) => updateLine(l.productId, l.productUomId, 'unitCost', Number(e.target.value))}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-right outline-none focus:border-orange-400"
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-slate-900">{formatCurrency(l.lineTotal)}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => removeLine(l.productId, l.productUomId)} className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 text-right">Total entrada</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{formatCurrency(purchaseTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Notas</label>
            <textarea
              rows={2}
              placeholder="Observaciones, condiciones de pago, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setLines([]); }}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving || lines.length === 0}
              className="px-6 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-700 disabled:opacity-50 transition-all shadow-lg shadow-orange-600/20"
            >
              {isSaving ? 'Guardando...' : 'Confirmar entrada'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">📋 Historial de entradas</p>
          <button onClick={() => void loadHistory()} disabled={isHistoryLoading} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 disabled:opacity-50">
            ↻ Actualizar
          </button>
        </div>
        {isHistoryLoading ? (
          <div className="p-6 text-center text-sm font-bold text-slate-300 animate-pulse">Cargando historial...</div>
        ) : history.length === 0 ? (
          <div className="p-6 text-center text-sm font-bold text-slate-300">Sin entradas registradas aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Proveedor</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Referencia</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-slate-600">{formatDate(h.created_at)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{h.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{h.reference || '—'}</td>
                  <td className="px-5 py-3 text-right text-xs font-black text-slate-900">{formatCurrency(h.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TransportPurchasesScreen;
