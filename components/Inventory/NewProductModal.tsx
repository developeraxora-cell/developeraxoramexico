import React, { useEffect, useMemo, useState } from 'react';
import type { Category, Product, ProductUom, Uom } from '../../services/inventory/catalog.service';
import { purchasesService } from '../../services/inventory/purchases.service';
import { catalogService } from '../../services/inventory/catalog.service';

interface SaleUomDraft {
  uom_id: string;
  factor_to_base: number;
  purpose: 'SALE' | 'BOTH';
  is_default_sale: boolean;
}

interface AttrPair {
  id: string;
  key: string;
  value: string;
}

interface NewProductModalProps {
  isOpen: boolean;
  barcode: string;
  branchId: string;
  uoms: Uom[];
  categories: Category[];
  isCatalogLoading?: boolean;
  mode?: 'create' | 'reactivate' | 'edit';
  existingProduct?: Product | null;
  existingUoms?: ProductUom[];
  allowBarcodeEdit?: boolean;
  onClose: () => void;
  onCreated: (payload: { product: Product; purchaseUom: ProductUom }) => void;
  onReactivated?: (payload: { product: Product; purchaseUom: ProductUom }) => void;
  onUpdated?: (payload: { product: Product; purchaseUom: ProductUom }) => void;
}

const NewProductModal: React.FC<NewProductModalProps> = ({
  isOpen,
  barcode,
  branchId,
  uoms,
  categories,
  isCatalogLoading = false,
  mode = 'create',
  existingProduct = null,
  existingUoms = [],
  allowBarcodeEdit = false,
  onClose,
  onCreated,
  onReactivated,
  onUpdated,
}) => {
  const [barcodeValue, setBarcodeValue] = useState(barcode);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [retailPrice, setRetailPrice] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [baseUomId, setBaseUomId] = useState('');
  const [isDivisible, setIsDivisible] = useState(false);
  const [attrsText, setAttrsText] = useState('');
  const [purchaseUomId, setPurchaseUomId] = useState('');
  const [purchaseFactor, setPurchaseFactor] = useState(1);
  const [saleUoms, setSaleUoms] = useState<SaleUomDraft[]>([]);
  const [attrPairs, setAttrPairs] = useState<AttrPair[]>([]);
  const buildAttrPair = (key = '', value = ''): AttrPair => ({
    id: Math.random().toString(36).slice(2, 10),
    key,
    value,
  });
  const [showJsonAttrs, setShowJsonAttrs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setBarcodeValue(barcode);

    if ((mode === 'reactivate' || mode === 'edit') && existingProduct) {
      setBarcodeValue(existingProduct.barcode ?? barcode);
      setSku(existingProduct.sku ?? '');
      setName(existingProduct.name ?? '');
      setDescription(existingProduct.description ?? '');
      setPurchasePrice(Number((existingProduct as any).purchase_price ?? 0));
      setWholesalePrice(Number((existingProduct as any).wholesale_price ?? 0));
      setRetailPrice(Number((existingProduct as any).retail_price ?? (existingProduct as any).precio ?? 0));
      setMinStock(Number((existingProduct as any).min_stock ?? 0));
      setCategoryId(existingProduct.category_id ?? '');
      setNewCategoryName('');
      setBaseUomId(existingProduct.base_uom_id ?? '');
      setIsDivisible(Boolean(existingProduct.is_divisible));
      setAttrsText('');
      setShowJsonAttrs(false);

      const attrs = existingProduct.attrs ?? {};
      const pairs = Object.entries(attrs).map(([key, value]) =>
        buildAttrPair(key, String(value ?? ''))
      );
      setAttrPairs(pairs.length > 0 ? pairs : []);

      const purchase = existingUoms.find((uom) => uom.purpose === 'PURCHASE' || uom.is_default_purchase);
      setPurchaseUomId(purchase?.uom_id ?? existingProduct.base_uom_id ?? '');
      setPurchaseFactor(Number(purchase?.factor_to_base ?? 1));

      const sales = existingUoms.filter((uom) => uom.purpose === 'SALE' || uom.purpose === 'BOTH');
      setSaleUoms(
        sales.map((uom, index) => ({
          uom_id: uom.uom_id,
          factor_to_base: Number(uom.factor_to_base),
          purpose: uom.purpose === 'BOTH' ? 'BOTH' : 'SALE',
          is_default_sale: Boolean(uom.is_default_sale) || index === 0,
        }))
      );
      return;
    }

    setSku('');
    setName('');
    setDescription('');
    setPurchasePrice(0);
    setWholesalePrice(0);
    setRetailPrice(0);
    setMinStock(0);
    setCategoryId('');
    setNewCategoryName('');
    setBaseUomId('');
    setIsDivisible(false);
    setAttrsText('');
    setPurchaseUomId('');
    setPurchaseFactor(1);
    setSaleUoms([]);
    setAttrPairs([]);
    setShowJsonAttrs(false);
  }, [isOpen, barcode, existingProduct, existingUoms, mode]);

  useEffect(() => {
    if (!baseUomId) return;
    if (!purchaseUomId) setPurchaseUomId(baseUomId);
    if (saleUoms.length === 0) {
      setSaleUoms([
        {
          uom_id: baseUomId,
          factor_to_base: 1,
          purpose: 'SALE',
          is_default_sale: true,
        },
      ]);
    }
  }, [baseUomId, purchaseUomId, saleUoms.length]);

  const parsedAttrs = useMemo(() => {
    if (attrPairs.some((pair) => pair.key.trim() || pair.value.trim())) {
      const attrs: Record<string, string> = {};
      attrPairs.forEach((pair) => {
        if (pair.key.trim()) {
          attrs[pair.key.trim()] = pair.value.trim();
        }
      });
      return Object.keys(attrs).length > 0 ? attrs : null;
    }

    if (!attrsText.trim()) return null;
    try {
      return JSON.parse(attrsText);
    } catch {
      return undefined;
    }
  }, [attrPairs, attrsText]);

  const handleAddSaleUom = () => {
    setSaleUoms((prev) => [
      ...prev,
      {
        uom_id: baseUomId || '',
        factor_to_base: 1,
        purpose: 'SALE',
        is_default_sale: prev.length === 0,
      },
    ]);
  };

  const updateSaleUom = (index: number, next: Partial<SaleUomDraft>) => {
    setSaleUoms((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));
  };

  const removeSaleUom = (index: number) => {
    setSaleUoms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!branchId) {
      setError('Seleccione una sucursal antes de crear el producto.');
      return;
    }

    if (!barcodeValue.trim()) {
      setError('El código de barras es obligatorio.');
      return;
    }

    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (retailPrice <= 0) {
      setError('El precio de venta menor debe ser mayor a 0.');
      return;
    }

    if (!baseUomId) {
      setError('Seleccione la unidad base.');
      return;
    }

    if (!purchaseUomId) {
      setError('Seleccione la unidad de compra.');
      return;
    }

    if (purchaseFactor <= 0) {
      setError('El factor de la unidad de compra debe ser mayor a 0.');
      return;
    }

    if (showJsonAttrs && parsedAttrs === undefined) {
      setError('El JSON de atributos no es válido.');
      return;
    }

    const resolvedSku = sku.trim() || `${branchId}-${Date.now()}`;
    let resolvedCategoryId = categoryId || null;

    if (newCategoryName.trim()) {
      try {
        const createdCategory = await catalogService.createCategory(newCategoryName.trim());
        resolvedCategoryId = createdCategory.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear la categoría.';
        setError(message);
        setSaving(false);
        return;
      }
    }

    const normalizedSaleUoms = saleUoms
      .filter((uom) => uom.uom_id && uom.factor_to_base > 0)
      .reduce<SaleUomDraft[]>((acc, uom) => {
        if (acc.find((row) => row.uom_id === uom.uom_id)) return acc;
        acc.push({ ...uom, is_default_sale: uom.is_default_sale || acc.length === 0 });
        return acc;
      }, []);

    const saleDefaults = normalizedSaleUoms.filter((uom) => uom.is_default_sale);
    if (saleDefaults.length > 1) {
      normalizedSaleUoms.forEach((uom, index) => {
        uom.is_default_sale = index === 0;
      });
    }

    setSaving(true);
    try {
      const payload = {
        branch_id: branchId,
        sku: resolvedSku,
        barcode: barcodeValue.trim(),
        name: name.trim(),
        purchase_price: Number(purchasePrice),
        wholesale_price: Number(wholesalePrice),
        retail_price: Number(retailPrice),
        min_stock: Number(minStock),
        description: description.trim() || null,
        category_id: resolvedCategoryId,
        brand_id: null,
        base_uom_id: baseUomId,
        is_divisible: isDivisible,
        attrs: parsedAttrs ?? {},
      };

      if ((mode === 'reactivate' || mode === 'edit') && existingProduct) {
        const result = await purchasesService.updateProductWithUoms({
          productId: existingProduct.id,
          product: payload,
          purchaseUom: {
            uom_id: purchaseUomId,
            purpose: 'PURCHASE',
            factor_to_base: purchaseFactor,
            is_default_purchase: true,
          },
          saleUoms: normalizedSaleUoms,
        });
        if (mode === 'reactivate') {
          onReactivated?.(result);
        } else {
          onUpdated?.(result);
        }
      } else {
        const result = await purchasesService.createProductWithUoms({
          product: payload,
          purchaseUom: {
            uom_id: purchaseUomId,
            purpose: 'PURCHASE',
            factor_to_base: purchaseFactor,
            is_default_purchase: true,
          },
          saleUoms: normalizedSaleUoms,
        });
        onCreated(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el producto.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const isCatalogReady = !isCatalogLoading && uoms.length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tighter">
              {mode === 'reactivate' ? 'Reactivar Producto' : mode === 'edit' ? 'Editar Producto' : 'Nuevo Producto'}
            </h3>
            <p className="text-slate-400 text-xs">
              {mode === 'reactivate'
                ? 'Actualiza datos para reactivar el producto.'
                : mode === 'edit'
                  ? 'Actualiza la información del producto.'
                  : 'Registro rápido desde escaneo.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          {!isCatalogReady && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-2xl px-4 py-3">
              {isCatalogLoading
                ? 'Cargando catálogo de unidades...'
                : 'No hay unidades registradas. Verifique las UOMs en Supabase.'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Barcode</label>
              <input
                type="text"
                value={barcodeValue}
                readOnly={!allowBarcodeEdit || mode === 'reactivate'}
                onChange={(e) => setBarcodeValue(e.target.value)}
                className={`w-full p-3 border-2 border-transparent rounded-xl outline-none font-mono text-xs ${
                  allowBarcodeEdit && mode === 'create' ? 'bg-gray-50 focus:border-orange-500' : 'bg-gray-100'
                }`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stock mínimo</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-semibold text-sm"
                value={minStock}
                onChange={(e) => setMinStock(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre</label>
              <input
                type="text"
                required
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-semibold text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio venta mayor</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-black text-sm"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio venta menor</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-black text-sm"
                value={retailPrice}
                onChange={(e) => setRetailPrice(Number(e.target.value))}
              />
              <p className="text-[10px] text-slate-400">Precio aplicado a la unidad base.</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Unidad Base</label>
              <select
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                value={baseUomId}
                onChange={(e) => setBaseUomId(e.target.value)}
              >
                <option value="">Seleccionar</option>
                {uoms.map((uom) => (
                  <option key={uom.id} value={uom.id}>
                    {uom.name} ({uom.code})
                  </option>
                ))}
              </select>
              {uoms.length === 0 && (
                <p className="text-[10px] text-slate-400">No hay unidades registradas.</p>
              )}
              <p className="text-[10px] text-slate-400">Unidad en la que se controla el stock (ej: KG).</p>
            </div>
            <div className="space-y-1 flex items-center gap-3">
              <input
                id="is_divisible"
                type="checkbox"
                className="w-5 h-5 accent-orange-500"
                checked={isDivisible}
                onChange={(e) => setIsDivisible(e.target.checked)}
              />
              <label htmlFor="is_divisible" className="text-xs font-semibold text-gray-600">
                Permite fraccionar (decimales)
              </label>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Medida de Compra</h4>
            </div>
            <p className="text-[10px] text-slate-400">Así lo compras al proveedor (ej: costal = 50 KG).</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">UOM</label>
                <select
                  className="w-full p-3 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                  value={purchaseUomId}
                  onChange={(e) => setPurchaseUomId(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.name} ({uom.code})
                    </option>
                  ))}
                </select>
                {uoms.length === 0 && (
                  <p className="text-[10px] text-slate-400">Cargue UOMs antes de continuar.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Factor a Base</label>
                <input
                  type="number"
                  min={0}
                  step="0.0001"
                  className="w-full p-3 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                  value={purchaseFactor}
                  onChange={(e) => setPurchaseFactor(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center text-[10px] font-bold text-slate-500">
                1 unidad de compra = {purchaseFactor || 0} unidades base
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Venta por menor (equivalencias)</h4>
              <button
                type="button"
                onClick={handleAddSaleUom}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                + Agregar
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Define equivalencias para venta menor (ej: 1 costal = 50 KG).</p>
            {saleUoms.length === 0 ? (
              <p className="text-xs text-slate-400">No hay unidades de venta configuradas.</p>
            ) : (
              <div className="space-y-3">
                {saleUoms.map((row, index) => (
                  <div key={`${row.uom_id}-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center bg-slate-50 p-4 rounded-2xl">
                    <select
                      className="md:col-span-2 w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                      value={row.uom_id}
                      onChange={(e) => updateSaleUom(index, { uom_id: e.target.value })}
                    >
                      <option value="">Seleccionar</option>
                      {uoms.map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.name} ({uom.code})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      className="w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                      value={row.factor_to_base}
                      onChange={(e) => updateSaleUom(index, { factor_to_base: Number(e.target.value) })}
                    />
                    <select
                      className="w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                      value={row.purpose}
                      onChange={(e) => updateSaleUom(index, { purpose: e.target.value as 'SALE' | 'BOTH' })}
                    >
                      <option value="SALE">Solo venta</option>
                      <option value="BOTH">Compra/Venta</option>
                    </select>
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                      <input
                        type="radio"
                        name="default_sale"
                        checked={row.is_default_sale}
                        onChange={() =>
                          setSaleUoms((prev) => prev.map((u, i) => ({ ...u, is_default_sale: i === index })))
                        }
                      />
                      Default
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSaleUom(index)}
                      className="text-[10px] font-black text-red-500"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !isCatalogReady}
                className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl ${saving || !isCatalogReady ? 'bg-slate-200 text-slate-400' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
              >
              {saving
                ? 'Guardando...'
                : mode === 'reactivate'
                  ? 'Reactivar Producto'
                  : mode === 'edit'
                    ? 'Guardar Cambios'
                    : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewProductModal;
