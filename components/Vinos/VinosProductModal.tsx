import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  vinosProductsService,
  type CreateProductInput,
  type ProductUomEquivalence,
  type ProductWithStock,
  type VinosProduct,
} from '../../services/vinos/products.service';
import type { Category, Uom } from '../../services/vinos/catalog.service';

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

export interface VinosProductUomRow {
  id: string;
  product_id: string;
  uom_id: string;
  factor_to_base: number;
  uom: { id: string; name: string; symbol: string | null };
}

export interface VinosProductModalSavedPayload {
  product: VinosProduct;
  productUoms: VinosProductUomRow[];
}

interface Props {
  isOpen: boolean;
  branchDbId: number | null;
  categories: Category[];
  uoms: Uom[];
  editTarget?: ProductWithStock | null;
  initialValues?: Partial<Pick<FormState, 'barcode' | 'name'>>;
  onClose: () => void;
  onSaved: (payload: VinosProductModalSavedPayload) => void | Promise<void>;
}

const emptyForm = (initialValues?: Partial<Pick<FormState, 'barcode' | 'name'>>): FormState => ({
  name: initialValues?.name ?? '',
  category_id: '',
  uom_id: '',
  is_divisible: false,
  barcode: initialValues?.barcode ?? '',
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

const VinosProductModal: React.FC<Props> = ({
  isOpen,
  branchDbId,
  categories,
  uoms,
  editTarget = null,
  initialValues,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [equivalences, setEquivalences] = useState<EquivalenceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setSaving(false);

    if (editTarget) {
      setForm({
        name: editTarget.name,
        category_id: editTarget.category_id ?? '',
        uom_id: editTarget.uom_id ?? '',
        is_divisible: editTarget.is_divisible ?? false,
        barcode: editTarget.barcode ?? '',
        price_retail: String(editTarget.price_retail),
        price_mid_wholesale: String(editTarget.price_mid_wholesale),
        price_wholesale: String(editTarget.price_wholesale),
        min_stock: String(editTarget.min_stock),
        image_url: editTarget.image_url ?? '',
      });
      setEquivalences([]);
      vinosProductsService.listEquivalences(editTarget.id)
        .then((eqs) => {
          const mapped = eqs.map(e => ({
            uom_id: e.uom_id,
            factor_to_base: String(e.factor_to_base),
            price_retail: String(e.price_retail),
            price_mid_wholesale: String(e.price_mid_wholesale),
            price_wholesale: String(e.price_wholesale),
          }));
          const hasBase = mapped.some(m => Number(m.factor_to_base) === 1 && m.uom_id === (editTarget.uom_id ?? ''));
          if (!hasBase && editTarget.uom_id) {
            mapped.unshift({
              uom_id: editTarget.uom_id,
              factor_to_base: '1',
              price_retail: String(editTarget.price_retail ?? ''),
              price_mid_wholesale: String(editTarget.price_mid_wholesale ?? ''),
              price_wholesale: String(editTarget.price_wholesale ?? ''),
            });
          }
          setEquivalences(mapped);
        })
        .catch(console.error);
      return;
    }

    setForm(emptyForm(initialValues));
    setEquivalences([]);
  }, [editTarget, initialValues, isOpen]);

  useEffect(() => {
    if (!form.uom_id) return;
    setEquivalences(prev => {
      const baseIdx = prev.findIndex(e => Number(e.factor_to_base) === 1);
      if (baseIdx >= 0) {
        if (prev[baseIdx].uom_id !== form.uom_id) {
          const copy = [...prev];
          copy[baseIdx] = { ...copy[baseIdx], uom_id: form.uom_id, factor_to_base: '1' };
          return copy;
        }
        return prev;
      }
      return [{
        uom_id: form.uom_id,
        factor_to_base: '1',
        price_retail: '',
        price_mid_wholesale: '',
        price_wholesale: '',
      }, ...prev];
    });
  }, [form.uom_id]);

  const addEquivalence = () => setEquivalences(prev => [...prev, emptyEquivalence()]);
  const removeEquivalence = (idx: number) => setEquivalences(prev => prev.filter((_, i) => i !== idx));
  const updateEquivalence = (idx: number, patch: Partial<EquivalenceRow>) =>
    setEquivalences(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio.'); return; }
    if (!editTarget && !branchDbId) { setFormError('Sucursal no encontrada en DB vinos.'); return; }
    if (!form.uom_id) { setFormError('Selecciona la unidad de medida base.'); return; }

    for (const eq of equivalences) {
      if (!eq.uom_id) { setFormError('Cada equivalencia debe tener unidad de medida.'); return; }
      if (!Number(eq.factor_to_base)) { setFormError('Cada equivalencia debe tener factor mayor a 0.'); return; }
    }

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

      const product = editTarget
        ? await vinosProductsService.update(editTarget.id, payload)
        : await vinosProductsService.create(payload, branchDbId as number);

      await vinosProductsService.setEquivalences(product.id, equivalences.map(eq => ({
        uom_id: eq.uom_id,
        factor_to_base: Number(eq.factor_to_base) || 1,
        price_retail: Number(eq.price_retail) || 0,
        price_mid_wholesale: Number(eq.price_mid_wholesale) || 0,
        price_wholesale: Number(eq.price_wholesale) || 0,
      })));

      const productUoms = await vinosProductsService.listAllProductUoms([product.id]);
      await onSaved({ product, productUoms: productUoms as VinosProductUomRow[] });
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
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
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
          <section>
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Datos del producto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Código de barras</label>
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Stock mínimo (alerta)</label>
                <input
                  type="number"
                  min="0"
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
          <button onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VinosProductModal;
