import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { User } from '../../types';
import type { Category, Product, ProductUom, Uom } from '../../services/concretera/catalog.service';
import { purchasesService } from '../../services/concretera/purchases.service';
import { catalogService } from '../../services/concretera/catalog.service';
import { logConcreteraAudit } from '../../services/audit/audit.service';
import { formatNumber } from '../../services/currency';
import ConfirmModal from '../common/ConfirmModal';

interface SaleUomDraft {
  uom_id: string;
  factor_to_base: number;
  purpose: 'SALE' | 'BOTH';
  wholesale_price: number;
  retail_price: number;
  is_default_sale: boolean;
  wholesale_price_touched?: boolean;
  retail_price_touched?: boolean;
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
  currentUser: User;
  branchName?: string | null;
  onClose: () => void;
  onCreated: (payload: { product: Product; purchaseUom: ProductUom }) => void;
  onReactivated?: (payload: { product: Product; purchaseUom: ProductUom }) => void;
  onUpdated?: (payload: { product: Product; purchaseUom: ProductUom }) => void;
}

const roundPrice = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const derivePriceByFactor = (basePrice: number, factorToBase: number) =>
  roundPrice(Number(basePrice || 0) * Number(factorToBase || 0));

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
  currentUser,
  branchName = null,
  onClose,
  onCreated,
  onReactivated,
  onUpdated,
}) => {
  const [modalUoms, setModalUoms] = useState<Uom[]>(uoms);
  const [barcodeValue, setBarcodeValue] = useState(barcode);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [retailPrice, setRetailPrice] = useState<string>('');
  const [minStock, setMinStock] = useState<string>('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [baseUomId, setBaseUomId] = useState('');
  const [isDivisible, setIsDivisible] = useState(false);
  const [attrsText, setAttrsText] = useState('');
  const [purchaseUomId, setPurchaseUomId] = useState('');
  const [purchaseFactor, setPurchaseFactor] = useState<string>('1');
  const [saleUoms, setSaleUoms] = useState<SaleUomDraft[]>([]);
  const [attrPairs, setAttrPairs] = useState<AttrPair[]>([]);
  const buildAttrPair = (key = '', value = ''): AttrPair => ({
    id: Math.random().toString(36).slice(2, 10),
    key,
    value,
  });
  const [showJsonAttrs, setShowJsonAttrs] = useState(false);
  const [isNewUomModalOpen, setIsNewUomModalOpen] = useState(false);
  const [newUomCode, setNewUomCode] = useState('');
  const [newUomName, setNewUomName] = useState('');
  const [isSavingUom, setIsSavingUom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showErrorModal = (message: string) => setError(message);
  const [barcodeMode, setBarcodeMode] = useState<'with' | 'without'>('with');
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [saveObservation, setSaveObservation] = useState('');
  const [saveObservationError, setSaveObservationError] = useState<string | null>(null);

  const buildAutoBarcode = () =>
    `CON-${branchId || '0'}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`;

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (!err) return fallback;
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object') {
      const payload = err as { message?: string; hint?: string; details?: string };
      if (payload.message && payload.hint) return `${payload.message}. ${payload.hint}`;
      if (payload.message) return payload.message;
      if (payload.details) return payload.details;
    }
    return fallback;
  };

  useEffect(() => {
    setModalUoms(uoms);
  }, [uoms]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setBarcodeValue(barcode);
    setIsNewUomModalOpen(false);
    setNewUomCode('');
    setNewUomName('');
    setIsSavingUom(false);
    setIsSaveConfirmOpen(false);
    setSaveObservation('');
    setSaveObservationError(null);

    if ((mode === 'reactivate' || mode === 'edit') && existingProduct) {
      setBarcodeValue(existingProduct.barcode ?? barcode);
      setBarcodeMode(existingProduct.barcode ? 'with' : 'without');
      setSku(existingProduct.sku ?? '');
      setName(existingProduct.name ?? '');
      setDescription(existingProduct.description ?? '');
      setPurchasePrice(String(Number((existingProduct as any).purchase_price ?? 0)));
      setWholesalePrice(String(Number((existingProduct as any).wholesale_price ?? 0)));
      setRetailPrice(String(Number((existingProduct as any).retail_price ?? (existingProduct as any).precio ?? 0)));
      setMinStock(String(Number((existingProduct as any).min_stock ?? 0)));
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

      setPurchaseUomId(existingProduct.base_uom_id ?? '');
      setPurchaseFactor('1');

      const sales = existingUoms.filter((uom) => uom.purpose === 'SALE' || uom.purpose === 'BOTH');
      setSaleUoms(
        sales.map((uom, index) => ({
          uom_id: uom.uom_id,
          factor_to_base: Number(uom.factor_to_base),
          purpose: uom.purpose === 'BOTH' ? 'BOTH' : 'SALE',
          wholesale_price: Number(
            uom.wholesale_price
            ?? derivePriceByFactor(Number((existingProduct as any).wholesale_price ?? 0), Number(uom.factor_to_base ?? 1))
          ),
          retail_price: Number(
            uom.retail_price
            ?? derivePriceByFactor(Number((existingProduct as any).retail_price ?? (existingProduct as any).precio ?? 0), Number(uom.factor_to_base ?? 1))
          ),
          is_default_sale: Boolean(uom.is_default_sale) || index === 0,
          wholesale_price_touched: true,
          retail_price_touched: true,
        }))
      );
      return;
    }

    setSku('');
    setName('');
    setDescription('');
    setPurchasePrice('');
    setWholesalePrice('');
    setRetailPrice('');
    setMinStock('');
    setCategoryId('');
    setNewCategoryName('');
    setBaseUomId('');
    setIsDivisible(false);
    setAttrsText('');
    setPurchaseUomId('');
    setPurchaseFactor('1');
    setSaleUoms([]);
    setAttrPairs([]);
    setShowJsonAttrs(false);
    setBarcodeMode(barcode.trim() ? 'with' : 'without');
  }, [isOpen, barcode, existingProduct, existingUoms, mode]);

  useEffect(() => {
    if (!baseUomId) return;
    if (!purchaseUomId) setPurchaseUomId(baseUomId);
    if (Number(purchaseFactor || 0) <= 0) setPurchaseFactor('1');
    setSaleUoms((prev) => {
      const baseIndex = prev.findIndex((row) => String(row.uom_id) === String(baseUomId));
      if (baseIndex >= 0) {
        return prev.map((row, index) => index === baseIndex
          ? {
              ...row,
              factor_to_base: 1,
              is_default_sale: row.is_default_sale || prev.every((candidate) => !candidate.is_default_sale),
            }
          : row);
      }
      return [
        {
          uom_id: baseUomId,
          factor_to_base: 1,
          purpose: 'SALE',
          wholesale_price: Number(wholesalePrice || 0),
          retail_price: Number(retailPrice || 0),
          is_default_sale: prev.length === 0 || prev.every((candidate) => !candidate.is_default_sale),
        },
        ...prev,
      ];
    });
  }, [baseUomId, purchaseFactor, purchaseUomId, retailPrice, saleUoms.length, wholesalePrice]);

  useEffect(() => {
    const baseSaleUom = saleUoms.find((row) => String(row.uom_id) === String(baseUomId)) ?? saleUoms.find((row) => Number(row.factor_to_base) === 1);
    if (!baseSaleUom) return;
    const nextWholesale = String(Number(baseSaleUom.wholesale_price ?? 0));
    const nextRetail = String(Number(baseSaleUom.retail_price ?? 0));
    if (wholesalePrice !== nextWholesale) setWholesalePrice(nextWholesale);
    if (retailPrice !== nextRetail) setRetailPrice(nextRetail);
  }, [baseUomId, retailPrice, saleUoms, wholesalePrice]);

  useEffect(() => {
    setSaleUoms((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const factor = Number(row.factor_to_base ?? 0);
        const derivedWholesale = derivePriceByFactor(Number(wholesalePrice || 0), factor);
        const derivedRetail = derivePriceByFactor(Number(retailPrice || 0), factor);
        const updatedRow = { ...row };
        if (!row.wholesale_price_touched && Number(row.wholesale_price ?? 0) !== derivedWholesale) {
          updatedRow.wholesale_price = derivedWholesale;
          changed = true;
        }
        if (!row.retail_price_touched && Number(row.retail_price ?? 0) !== derivedRetail) {
          updatedRow.retail_price = derivedRetail;
          changed = true;
        }
        return updatedRow;
      });
      return changed ? next : prev;
    });
  }, [retailPrice, wholesalePrice]);

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
          purpose: 'BOTH',
          wholesale_price: Number(wholesalePrice || 0),
          retail_price: Number(retailPrice || 0),
          is_default_sale: prev.length === 0,
        wholesale_price_touched: false,
        retail_price_touched: false,
      },
    ]);
  };

  const updateSaleUom = (index: number, next: Partial<SaleUomDraft>) => {
    setSaleUoms((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const merged: SaleUomDraft = { ...row, ...next };
        const nextFactor = Number(merged.factor_to_base ?? 0);
        if (!merged.wholesale_price_touched && next.wholesale_price === undefined) {
          merged.wholesale_price = derivePriceByFactor(Number(wholesalePrice || 0), nextFactor);
        }
        if (!merged.retail_price_touched && next.retail_price === undefined) {
          merged.retail_price = derivePriceByFactor(Number(retailPrice || 0), nextFactor);
        }
        if (next.wholesale_price !== undefined) {
          merged.wholesale_price_touched = true;
        }
        if (next.retail_price !== undefined) {
          merged.retail_price_touched = true;
        }
        return merged;
      })
    );
  };

  const removeSaleUom = (index: number) => {
    setSaleUoms((prev) => prev.filter((_, i) => i !== index));
  };

  const buildSaveContext = () => {
    setError(null);

    if (!branchId) {
      showErrorModal('Seleccione una sucursal antes de crear el producto.');
      return null;
    }

    if (!name.trim()) {
      showErrorModal('El nombre es obligatorio.');
      return null;
    }

    if (!baseUomId) {
      showErrorModal('Seleccione la unidad base.');
      return null;
    }

    if (showJsonAttrs && parsedAttrs === undefined) {
      showErrorModal('El JSON de atributos no es válido.');
      return null;
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

    const invalidSalePrice = normalizedSaleUoms.find((uom) => Number(uom.retail_price ?? 0) <= 0 || Number(uom.wholesale_price ?? 0) < 0);
    if (invalidSalePrice) {
      showErrorModal('Cada equivalencia de venta debe tener precio de menudeo mayor a 0 y mayoreo mayor o igual a 0.');
      return null;
    }

    const baseSaleUom = normalizedSaleUoms.find((uom) => String(uom.uom_id) === String(baseUomId))
      ?? normalizedSaleUoms.find((uom) => Number(uom.factor_to_base) === 1);
    if (!baseSaleUom) {
      showErrorModal('La unidad base debe existir dentro de las equivalencias de venta.');
      return null;
    }

    return {
      retailPriceNumber: Number(baseSaleUom.retail_price ?? 0),
      wholesalePriceNumber: Number(baseSaleUom.wholesale_price ?? 0),
      resolvedSku: sku.trim() || `${branchId}-${Date.now()}`,
      normalizedSaleUoms,
    };
  };

  const submitSave = async (justification: string | null) => {
    const context = buildSaveContext();
    if (!context) return;

    setSaving(true);
    try {
      let resolvedCategoryId = categoryId || null;

      if (newCategoryName.trim()) {
        try {
          const createdCategory = await catalogService.createCategory(newCategoryName.trim());
          resolvedCategoryId = createdCategory.id;
        } catch (err) {
          const message = getErrorMessage(err, 'No se pudo crear la categoría.');
          showErrorModal(message);
          setSaving(false);
          return;
        }
      }

      const manualBarcode = barcodeMode === 'without' ? '' : barcodeValue.trim();
      const resolvedBarcode = manualBarcode || buildAutoBarcode();
      const payload = {
        branch_id: branchId,
        sku: context.resolvedSku,
        barcode: resolvedBarcode,
        name: name.trim(),
        purchase_price: Number(purchasePrice || 0),
        wholesale_price: context.wholesalePriceNumber,
        retail_price: context.retailPriceNumber,
        min_stock: Number(minStock || 0),
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
            uom_id: baseUomId,
            purpose: 'PURCHASE',
            factor_to_base: 1,
            wholesale_price: context.wholesalePriceNumber,
            retail_price: context.retailPriceNumber,
            is_default_purchase: true,
          },
          saleUoms: context.normalizedSaleUoms,
        });
        if (mode === 'reactivate') {
          onReactivated?.(result);
        } else {
          onUpdated?.(result);
        }
        logConcreteraAudit({
          branch_id: branchId,
          branch_name: branchName,
          user_id: currentUser.id,
          user_name: currentUser.name,
          action_type: 'ACTUALIZAR',
          entity_type: 'producto',
          entity_id: String(result.product.id),
          description: `Producto actualizado: ${result.product.name}`,
          justification,
          previous_data: existingProduct as unknown as Record<string, unknown>,
          new_data: result.product as unknown as Record<string, unknown>,
        });
      } else {
        const result = await purchasesService.createProductWithUoms({
          product: payload,
          purchaseUom: {
            uom_id: baseUomId,
            purpose: 'PURCHASE',
            factor_to_base: 1,
            wholesale_price: context.wholesalePriceNumber,
            retail_price: context.retailPriceNumber,
            is_default_purchase: true,
          },
          saleUoms: context.normalizedSaleUoms,
        });
        onCreated(result);
        logConcreteraAudit({
          branch_id: branchId,
          branch_name: branchName,
          user_id: currentUser.id,
          user_name: currentUser.name,
          action_type: 'CREAR',
          entity_type: 'producto',
          entity_id: String(result.product.id),
          description: `Producto creado: ${result.product.name}`,
          new_data: result.product as unknown as Record<string, unknown>,
        });
      }
    } catch (err) {
      const message = getErrorMessage(err, 'No se pudo guardar el producto.');
      showErrorModal(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!buildSaveContext()) return;

    if (mode === 'edit' || mode === 'reactivate') {
      setSaveObservation('');
      setSaveObservationError(null);
      setIsSaveConfirmOpen(true);
      return;
    }

    await submitSave(null);
  };

  const handleConfirmSave = async () => {
    const observation = saveObservation.trim();
    if (!observation) {
      setSaveObservationError('La observación es obligatoria para actualizar el producto.');
      return;
    }

    setSaveObservationError(null);
    setIsSaveConfirmOpen(false);
    await submitSave(observation);
  };

  const handleCreateUom = async () => {
    setError(null);
    const code = newUomCode.trim().toUpperCase();
    const nameValue = newUomName.trim();

    if (!code || !nameValue) {
      showErrorModal('Ingrese código y nombre de la unidad.');
      return;
    }

    setIsSavingUom(true);
    try {
      const created = await catalogService.createUom({ code, name: nameValue });
      setModalUoms((prev) => {
        if (prev.some((u) => String(u.id) === String(created.id))) return prev;
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setBaseUomId(String(created.id));
      setNewUomCode('');
      setNewUomName('');
      setIsNewUomModalOpen(false);
    } catch (err) {
      const message = getErrorMessage(err, 'No se pudo crear la unidad.');
      showErrorModal(message);
    } finally {
      setIsSavingUom(false);
    }
  };

  if (!isOpen) return null;

  const isCatalogReady = !isCatalogLoading && modalUoms.length > 0;

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
          {!isCatalogReady && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-2xl px-4 py-3">
              {isCatalogLoading
                ? 'Cargando catálogo de unidades...'
                : 'No hay unidades registradas. Verifique las UOMs en Supabase.'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {mode === 'create' && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Barcode</label>
                <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBarcodeMode('with')}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                      barcodeMode === 'with' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                    }`}
                  >
                    Con código
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeMode('without');
                      setBarcodeValue('');
                    }}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                      barcodeMode === 'without' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                    }`}
                  >
                    Sin código (auto)
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Barcode</label>
              <input
                type="text"
                value={barcodeValue}
                readOnly={barcodeMode === 'without' || !allowBarcodeEdit || mode === 'reactivate'}
                onChange={(e) => setBarcodeValue(e.target.value)}
                className={`w-full p-3 border-2 border-transparent rounded-xl outline-none font-mono text-xs ${
                  barcodeMode === 'without'
                    ? 'bg-gray-100 text-gray-400'
                    : allowBarcodeEdit && mode === 'create'
                      ? 'bg-gray-50 focus:border-orange-500'
                      : 'bg-gray-100'
                }`}
                placeholder={barcodeMode === 'without' ? 'Se generará automáticamente al guardar' : ''}
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
                onChange={(e) => setMinStock(e.target.value)}
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
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Unidad Base</label>
              <select
                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                value={baseUomId}
                onChange={(e) => setBaseUomId(e.target.value)}
              >
                <option value="">Seleccionar</option>
                {modalUoms.map((uom) => (
                  <option key={uom.id} value={uom.id}>
                    {uom.name} ({uom.code})
                  </option>
                ))}
              </select>
              {modalUoms.length === 0 && (
                <p className="text-[10px] text-slate-400">No hay unidades registradas.</p>
              )}
              <button
                type="button"
                onClick={() => setIsNewUomModalOpen(true)}
                className="text-[10px] font-black uppercase tracking-widest text-orange-600 hover:text-orange-700"
              >
                + Nueva unidad base
              </button>
              <p className="text-[10px] text-slate-400">Unidad en la que se controla el stock (ej: KG).</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Equivalencias en las unidades de medida</h4>
              <button
                type="button"
                onClick={handleAddSaleUom}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                + Agregar
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Define equivalencias de venta y sus precios específicos. La fila de la unidad base reemplaza el precio general del producto.</p>
            {saleUoms.length === 0 ? (
              <p className="text-xs text-slate-400">No hay unidades de venta configuradas.</p>
            ) : (
              <div className="space-y-3">
                {saleUoms.map((row, index) => (
                  <div key={`${row.uom_id}-${index}`} className="bg-slate-50 p-4 rounded-2xl space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                      <select
                        className="w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs"
                        value={row.uom_id}
                        onChange={(e) => updateSaleUom(index, { uom_id: e.target.value })}
                      >
                        <option value="">Seleccionar</option>
                        {modalUoms.map((uom) => (
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
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs font-black"
                        value={row.wholesale_price}
                        onChange={(e) => updateSaleUom(index, { wholesale_price: Number(e.target.value || 0) })}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full p-2 bg-white border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-xs font-black"
                        value={row.retail_price}
                        onChange={(e) => updateSaleUom(index, { retail_price: Number(e.target.value || 0) })}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Unidad de venta</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Factor a base</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Precio mayoreo</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Precio menudeo</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-[10px] text-slate-400">
                        1 unidad equivale a {formatNumber(Number(row.factor_to_base || 0))} base
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSaleUom(index)}
                        className="text-[10px] font-black text-red-500"
                      >
                        Quitar
                      </button>
                    </div>
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

      <ConfirmModal
        isOpen={isSaveConfirmOpen}
        title={mode === 'reactivate' ? 'Reactivar producto' : 'Guardar cambios'}
        description={
          mode === 'reactivate'
            ? 'Antes de reactivar el producto, registre una observación obligatoria.'
            : 'Antes de guardar la edición, registre una observación obligatoria.'
        }
        confirmText={mode === 'reactivate' ? 'Reactivar' : 'Guardar'}
        cancelText="Cancelar"
        noteLabel="Observación obligatoria"
        notePlaceholder="Explique brevemente el motivo del cambio"
        noteValue={saveObservation}
        noteRequired
        noteError={saveObservationError}
        isProcessing={saving}
        onNoteChange={(value) => {
          setSaveObservation(value);
          if (saveObservationError) setSaveObservationError(null);
        }}
        onConfirm={handleConfirmSave}
        onCancel={() => {
          setIsSaveConfirmOpen(false);
          setSaveObservation('');
          setSaveObservationError(null);
        }}
      />

      {isNewUomModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h4 className="text-lg font-black uppercase tracking-tighter">Nueva unidad base</h4>
                <p className="text-slate-400 text-xs">Disponible solo para Concretera.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewUomModalOpen(false)}
                className="text-slate-300 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Código</label>
                <input
                  type="text"
                  placeholder="Ej: M3"
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-sm"
                  value={newUomCode}
                  onChange={(e) => setNewUomCode(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: Metro cúbico"
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none text-sm"
                  value={newUomName}
                  onChange={(e) => setNewUomName(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewUomModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateUom}
                  disabled={isSavingUom}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    isSavingUom ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSavingUom ? 'Guardando...' : 'Guardar UOM'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl overflow-hidden bg-white shadow-2xl">
            <div className="bg-red-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6" />
                <div>
                  <h4 className="text-base font-black uppercase tracking-widest">Error</h4>
                  <p className="text-[11px] text-white/80">No se pudo completar la operación.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"
                aria-label="Cerrar error"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-red-700 whitespace-pre-wrap break-words">{error}</p>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewProductModal;
