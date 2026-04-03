
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, PenLine, Trash2 } from 'lucide-react';
import { Branch, User } from '../../types';
import { logMaterialsAudit } from '../../services/audit/audit.service';
import {
  catalogService,
  type Category,
  type Product,
  type ProductMovementHistory,
  type ProductMovementRow,
  type ProductUom,
  type Uom,
} from '../../services/inventory/catalog.service';
import { formatCurrency, formatNumber } from '../../services/currency';
import ConfirmModal from '../common/ConfirmModal';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import NewProductModal from './NewProductModal';

interface InventoryScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

interface ManualStockModalState {
  product: Product;
  currentStock: number;
}

const InventoryScreen: React.FC<InventoryScreenProps> = ({ selectedBranchId, currentUser, branches }) => {
  const PAGE_SIZE = 10;
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [productsSearch, setProductsSearch] = useState('');
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToRemove, setProductToRemove] = useState<Product | null>(null);
  const [statusObservation, setStatusObservation] = useState('');
  const [statusObservationError, setStatusObservationError] = useState<string | null>(null);
  const [deleteObservation, setDeleteObservation] = useState('');
  const [deleteObservationError, setDeleteObservationError] = useState<string | null>(null);
  const [priceProduct, setPriceProduct] = useState<Product | null>(null);
  const [priceValue, setPriceValue] = useState<string>('');
  const [priceObservation, setPriceObservation] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editUoms, setEditUoms] = useState<ProductUom[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [manualStockModal, setManualStockModal] = useState<ManualStockModalState | null>(null);
  const [manualStockValue, setManualStockValue] = useState('');
  const [manualStockReason, setManualStockReason] = useState('');
  const [manualStockNotes, setManualStockNotes] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyData, setHistoryData] = useState<ProductMovementHistory | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('error');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const actionLockRef = useRef(false);

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || null;
  }, [branches, selectedBranchId]);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const uomById = useMemo(() => {
    return uoms.reduce<Record<string, Uom>>((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});
  }, [uoms]);

  const formatQty = useCallback((value: number) => {
    return formatNumber(Number(value || 0), undefined, { maximumFractionDigits: 3 });
  }, []);

  const formatDateTime = useCallback((value: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  }, []);

  const showFeedback = useCallback((type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  }, []);

  const feedbackLoading = feedbackOpen && feedbackType === 'loading';

  const loadProducts = useCallback(async () => {
    if (!branchId) {
      setProductsList([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [productsData, uomsData, categoriesData, stockRows] = await Promise.all([
        catalogService.listProductsByBranch(branchId),
        catalogService.listUoms(),
        catalogService.listCategories(),
        catalogService.listStockByBranch(branchId),
      ]);
      setProductsList(productsData);
      setUoms(uomsData);
      setCategories(categoriesData);
      const stockMap = stockRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.product_id] = Number(row.qty_base ?? 0);
        return acc;
      }, {});
      setStockByProduct(stockMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar productos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openStatusModal = (product: Product) => {
    setProductToDelete(product);
    setStatusObservation('');
    setStatusObservationError(null);
  };

  const closeStatusModal = () => {
    setProductToDelete(null);
    setStatusObservation('');
    setStatusObservationError(null);
  };

  const openRemoveModal = (product: Product) => {
    setProductToRemove(product);
    setDeleteObservation('');
    setDeleteObservationError(null);
  };

  const closeRemoveModal = () => {
    setProductToRemove(null);
    setDeleteObservation('');
    setDeleteObservationError(null);
  };

  const handleConfirmDeleteProduct = useCallback(async () => {
    if (!productToDelete) return;

    const justification = statusObservation.trim();
    if (!justification) {
      setStatusObservationError(
        productToDelete.is_active === false
          ? 'La observación es obligatoria para activar el producto.'
          : 'La observación es obligatoria para desactivar el producto.'
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatusObservationError(null);
    try {
      const previousProduct = productToDelete;
      if (productToDelete.is_active === false) {
        await catalogService.activateProduct(productToDelete.id);
      } else {
        await catalogService.deactivateProduct(productToDelete.id);
      }
      logMaterialsAudit({
        branch_id: branchId ?? '',
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'producto',
        entity_id: String(previousProduct.id),
        description: previousProduct.is_active === false
          ? `Producto activado: ${previousProduct.name}`
          : `Producto desactivado: ${previousProduct.name}`,
        justification,
        previous_data: previousProduct as unknown as Record<string, unknown>,
        new_data: {
          ...previousProduct,
          is_active: previousProduct.is_active === false,
          notes: justification,
        },
      });
      closeStatusModal();
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado del producto.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [branchId, currentUser.id, currentUser.name, loadProducts, productToDelete, selectedBranch?.name, statusObservation]);

  const handleConfirmRemoveProduct = useCallback(async () => {
    if (!productToRemove) return;

    const justification = deleteObservation.trim();
    if (!justification) {
      setDeleteObservationError('La observación es obligatoria para eliminar el producto.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setDeleteObservationError(null);
    try {
      const previousProduct = productToRemove;
      await catalogService.deleteProduct(productToRemove.id);
      closeRemoveModal();
      logMaterialsAudit({
        branch_id: branchId ?? '',
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'producto',
        entity_id: String(previousProduct.id),
        description: `Producto eliminado: ${previousProduct.name}`,
        justification,
        previous_data: previousProduct as unknown as Record<string, unknown>,
      });
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el producto.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [branchId, currentUser.id, currentUser.name, deleteObservation, loadProducts, productToRemove, selectedBranch?.name]);

  const handleOpenPriceModal = (product: Product) => {
    setPriceProduct(product);
    setPriceValue(String(Number((product as any).retail_price ?? (product as any).precio ?? 0)));
    setPriceObservation('');
  };

  const handleOpenEditProduct = async (product: Product) => {
    setIsEditLoading(true);
    setEditProduct(product);
    try {
      const uomsList = await catalogService.listProductUoms(String(product.id));
      setEditUoms(uomsList);
      setIsEditOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el producto.';
      setError(message);
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleSavePrice = async () => {
    if (actionLockRef.current) return;
    if (!priceProduct) return;
    const nextPrice = Number(priceValue || 0);
    if (nextPrice <= 0) {
      setError('El precio debe ser mayor a 0.');
      return;
    }

    const justification = priceObservation.trim();
    if (!justification) {
      setError('La observación es obligatoria para actualizar el precio del producto.');
      return;
    }

    actionLockRef.current = true;
    setIsSaving(true);
    setError(null);
    showFeedback('loading', 'Guardando precio', 'Actualizando precio del producto...');
    try {
      const previousPrice = Number((priceProduct as any).retail_price ?? (priceProduct as any).precio ?? 0);
      await catalogService.updateProductPrice(priceProduct.id, nextPrice);
      logMaterialsAudit({
        branch_id: branchId ?? '',
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'producto',
        entity_id: String(priceProduct.id),
        description: `Precio actualizado: ${priceProduct.name}`,
        justification,
        previous_data: {
          retail_price: previousPrice,
        },
        new_data: {
          retail_price: nextPrice,
          notes: justification,
        },
      });
      setPriceProduct(null);
      await loadProducts();
      showFeedback('success', 'Precio actualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el precio.';
      setError(message);
      showFeedback('error', 'No se pudo actualizar', message);
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenManualStockModal = (product: Product) => {
    const currentStock = Number(stockByProduct[product.id] ?? 0);
    setManualStockModal({ product, currentStock });
    setManualStockValue(String(currentStock));
    setManualStockReason('');
    setManualStockNotes('');
  };

  const closeManualStockModal = () => {
    setManualStockModal(null);
    setManualStockValue('');
    setManualStockReason('');
    setManualStockNotes('');
  };

  const handleSaveManualStock = async () => {
    if (actionLockRef.current) return;
    if (!manualStockModal || !branchId) return;

    const nextQty = Number(manualStockValue);
    if (!Number.isFinite(nextQty) || nextQty < 0) {
      showFeedback('error', 'Stock inválido', 'El nuevo stock debe ser un número mayor o igual a 0.');
      return;
    }

    if (nextQty === manualStockModal.currentStock) {
      showFeedback('alert', 'Sin cambios', 'No hay cambios en el stock para guardar.');
      return;
    }

    const observation = manualStockNotes.trim();
    if (!observation) {
      showFeedback('error', 'Observación obligatoria', 'Debe ingresar una observación para guardar el ajuste de stock.');
      return;
    }

    actionLockRef.current = true;
    setIsSavingStock(true);
    setError(null);
    showFeedback('loading', 'Guardando ajuste', 'Actualizando stock...');
    try {
      const previousQty = manualStockModal.currentStock;
      await catalogService.adjustProductStock({
        branch_id: branchId,
        product_id: manualStockModal.product.id,
        new_qty_base: nextQty,
        reason: manualStockReason.trim() || null,
        notes: observation,
        created_by: currentUser.name || currentUser.username || null,
      });
      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'producto',
        entity_id: String(manualStockModal.product.id),
        description: `Stock ajustado manualmente para ${manualStockModal.product.name}`,
        justification: observation,
        previous_data: {
          stock: previousQty,
        },
        new_data: {
          stock: nextQty,
          reason: manualStockReason.trim() || null,
          notes: observation,
        },
      });
      closeManualStockModal();
      await loadProducts();
      showFeedback('success', 'Stock actualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el ajuste de stock.';
      showFeedback('error', 'Error al guardar stock', message);
    } finally {
      actionLockRef.current = false;
      setIsSavingStock(false);
    }
  };

  const handleOpenHistoryModal = async (product: Product) => {
    if (!branchId) return;
    setHistoryProduct(product);
    setHistoryData(null);
    setIsHistoryLoading(true);
    setError(null);
    try {
      const movementHistory = await catalogService.getProductMovementHistory(branchId, product.id, 120);
      setHistoryData(movementHistory);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el historial del producto.';
      setError(message);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryProduct(null);
    setHistoryData(null);
  };

  const filteredProducts = useMemo(() => {
    const term = productsSearch.trim().toLowerCase();
    return productsList.filter((product) => {
      return !term
        || product.name.toLowerCase().includes(term)
        || (product.sku ?? '').toLowerCase().includes(term)
        || (product.barcode ?? '').toLowerCase().includes(term);
    });
  }, [productsList, productsSearch]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE)),
    [filteredProducts.length, PAGE_SIZE]
  );

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage, PAGE_SIZE]);

  useEffect(() => {
    setCurrentPage(1);
  }, [productsSearch, branchId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            📦 Productos por Sucursal
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Listado de productos activos por sucursal.
          </p>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
          <button
            onClick={() => {
              if (!branchId) {
                setError('Seleccione una sucursal antes de crear el producto.');
                return;
              }
              setPendingBarcode('');
              setIsNewProductOpen(true);
            }}
            className="w-full lg:w-auto bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
          >
            ➕ Nuevo producto
          </button>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por nombre, SKU o barcode..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500 transition-all outline-none"
            value={productsSearch}
            onChange={(e) => setProductsSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-2xl p-4 text-sm">
          {error}
        </div>
      )}

      {!branchId && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl p-10 text-center text-slate-400">
          Seleccione una sucursal para ver productos.
        </div>
      )}

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Nombre</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">SKU</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Barcode</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Base</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Precio Menor</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Stock</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Stock Mínimo</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 text-sm">Cargando productos...</td>
                </tr>
              )}
              {!isLoading && branchId && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 text-sm">No hay productos para mostrar.</td>
                </tr>
              )}
              {!isLoading && paginatedProducts.map((product) => {
                const isActive = product.is_active !== false;
                const stock = Number((product as any).stock ?? stockByProduct[product.id] ?? 0);
                const minStock = Number((product as any).min_stock ?? 0);
                const stockLabel = Number.isFinite(stock)
                  ? formatNumber(Number(stock), undefined, { maximumFractionDigits: 3 })
                  : '0';
                const baseCode = uomById[product.base_uom_id]?.code || '—';
                const stockStatus = stock <= minStock
                  ? 'low'
                  : stock <= minStock + Math.max(1, minStock * 0.1)
                    ? 'warning'
                    : 'ok';
                return (
                <tr
                  key={product.id}
                  className={`transition-colors ${isActive ? 'hover:bg-emerald-50/60' : 'bg-red-50/60 hover:bg-red-50'}`}
                >
                  <td className="p-5 text-xs font-black uppercase">
                    <div className={`flex items-center gap-2 border-l-4 pl-3 ${isActive ? 'border-emerald-500' : 'border-red-500'}`}>
                    <span className={isActive ? 'text-slate-800' : 'text-red-700'}>
                      {product.name}
                    </span>
                    </div>
                  </td>
                  <td className="p-5 text-xs font-mono text-slate-500">{product.sku || '—'}</td>
                  <td className="p-5 text-xs font-mono text-slate-500">{product.barcode || '—'}</td>
                  <td className="p-5 text-xs font-bold text-slate-600">{baseCode}</td>
                  <td className="p-5 text-right text-xs font-black text-slate-900">
                    {formatCurrency(Number((product as any).retail_price ?? (product as any).precio ?? 0))}
                  </td>
                  <td className="p-5 text-right text-xs font-black">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                        stockStatus === 'low'
                          ? 'bg-red-100 text-red-700'
                          : stockStatus === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {stockLabel} <span className="text-[9px] font-black">{baseCode}</span>
                    </span>
                  </td>
                  <td className="p-5 text-right text-xs font-black text-slate-600">
                    {formatNumber(Number(minStock), undefined, { maximumFractionDigits: 3 })}{' '}
                    <span className="text-[9px] font-black text-slate-400">{baseCode}</span>
                  </td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenEditProduct(product)}
                        className="text-xs font-black px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                        title="Editar producto"
                        disabled={isSaving || isEditLoading}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleOpenManualStockModal(product)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        title="Ajustar stock"
                        disabled={isSaving || isEditLoading}
                      >
                        <PenLine className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenHistoryModal(product)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        title="Ver historial"
                        disabled={isSaving || isEditLoading}
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {false && (
                        <button
                          onClick={() => handleOpenPriceModal(product)}
                          className="text-xs font-black px-3 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                          title="Editar precio menor"
                          disabled={isSaving}
                        >
                          Precio
                        </button>
                      )}
                      <button
                        onClick={() => openStatusModal(product)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                        title="Eliminar producto"
                        disabled={isSaving}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINACIÓN */}
      {branchId && filteredProducts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs font-bold text-slate-500">
            Mostrando {paginatedProducts.length} de {filteredProducts.length} productos
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-[11px] font-black text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* FOOTER INFORMATIVO */}
      <div className="bg-slate-900 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">
        <div className="flex items-center gap-4">
           <span>Sucursal: <span className="text-orange-400">{selectedBranchId || '—'}</span></span>
           <span>Productos en vista: <span className="text-white">{paginatedProducts.length}</span></span>
        </div>
        <div className="flex items-center gap-2 text-orange-400">
          Usuario: {currentUser.name}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(productToDelete)}
        title={productToDelete?.is_active === false ? 'Restaurar producto' : 'Eliminar producto'}
        description={
          productToDelete?.is_active === false
            ? 'El producto volverá a estar disponible para compras.'
            : 'El producto dejará de estar disponible en productos y compras nuevas.'
        }
        icon="⛔"
        confirmText={productToDelete?.is_active === false ? 'Restaurar' : 'Eliminar'}
        cancelText="Cancelar"
        onConfirm={handleConfirmDeleteProduct}
        noteLabel="Observación obligatoria"
        notePlaceholder={
          productToDelete?.is_active === false
            ? 'Explique por qué se está restaurando el producto'
            : 'Explique por qué se está eliminando el producto'
        }
        noteValue={statusObservation}
        noteRequired
        noteError={statusObservationError}
        isProcessing={isSaving}
        onNoteChange={(value) => {
          setStatusObservation(value);
          if (statusObservationError) setStatusObservationError(null);
        }}
        onCancel={closeStatusModal}
      />

      <ConfirmModal
        isOpen={Boolean(productToRemove)}
        title="Eliminar producto"
        description="Se eliminará del catálogo. Esta acción no se puede deshacer."
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        noteLabel="Observación obligatoria"
        notePlaceholder="Explique por qué se eliminará este producto"
        noteValue={deleteObservation}
        noteRequired
        noteError={deleteObservationError}
        isProcessing={isSaving}
        onNoteChange={(value) => {
          setDeleteObservation(value);
          if (deleteObservationError) setDeleteObservationError(null);
        }}
        onConfirm={handleConfirmRemoveProduct}
        onCancel={closeRemoveModal}
      />

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={() => setFeedbackOpen(false)}
      />

      {priceProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">Actualizar precio menor</h3>
                <p className="text-slate-400 text-xs">{priceProduct.name}</p>
              </div>
              <button onClick={() => setPriceProduct(null)} className="text-slate-400 hover:text-white text-2xl">
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-orange-500"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
              />
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Observación *</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Explique por qué se actualiza el precio"
                  value={priceObservation}
                  onChange={(e) => setPriceObservation(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPriceProduct(null)}
                  disabled={feedbackLoading || isSaving}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePrice}
                  disabled={feedbackLoading || isSaving}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {manualStockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">Editar stock</h3>
                <p className="text-slate-400 text-xs">{manualStockModal.product.name}</p>
              </div>
              <button
                onClick={closeManualStockModal}
                className="text-slate-400 hover:text-white text-2xl"
                disabled={isSavingStock}
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock actual</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{formatQty(manualStockModal.currentStock)}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nuevo stock real</label>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                    value={manualStockValue}
                    onChange={(e) => setManualStockValue(e.target.value)}
                    disabled={isSavingStock}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Motivo (opcional)</label>
                <input
                  type="text"
                  maxLength={100}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Conteo físico"
                  value={manualStockReason}
                  onChange={(e) => setManualStockReason(e.target.value)}
                  disabled={isSavingStock}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Observación *</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Detalle obligatorio del ajuste manual"
                  value={manualStockNotes}
                  onChange={(e) => setManualStockNotes(e.target.value)}
                  disabled={isSavingStock}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={closeManualStockModal}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                  disabled={isSavingStock || feedbackLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveManualStock}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                  disabled={isSavingStock || feedbackLoading}
                >
                  {isSavingStock || feedbackLoading ? 'Guardando...' : 'Guardar ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {historyProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest">Historial de producto</h3>
                <p className="text-xs text-slate-300 uppercase tracking-wider mt-1">{historyProduct.name}</p>
              </div>
              <button onClick={closeHistoryModal} className="text-slate-400 hover:text-white text-2xl">
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {isHistoryLoading && (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-500 text-center">
                  Cargando historial del producto...
                </div>
              )}

              {!isHistoryLoading && historyData && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Stock actual</p>
                      <p className="text-lg font-black text-slate-900 mt-1">
                        {formatQty(Number(stockByProduct[historyProduct.id] ?? 0))}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                      <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Comprado</p>
                      <p className="text-lg font-black text-emerald-700 mt-1">
                        {formatQty(historyData.summary.purchased_qty_base)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
                      <p className="text-[10px] font-black uppercase text-red-600 tracking-wider">Vendido</p>
                      <p className="text-lg font-black text-red-700 mt-1">
                        {formatQty(historyData.summary.sold_qty_base)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total compras</p>
                      <p className="text-lg font-black text-slate-900 mt-1">
                        {formatCurrency(historyData.summary.purchased_total)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total ventas</p>
                      <p className="text-lg font-black text-slate-900 mt-1">
                        {formatCurrency(historyData.summary.sold_total)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full min-w-[950px] border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white">
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-left">Fecha</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-left">Tipo</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-left">Referencia</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-right">Cantidad</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-right">Unitario</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-right">Total</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-right">Stock antes</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-right">Stock después</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-wider text-left">Usuario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.rows.length === 0 && (
                          <tr>
                            <td colSpan={9} className="p-5 text-sm text-center text-slate-400">
                              Sin movimientos para este producto.
                            </td>
                          </tr>
                        )}
                        {historyData.rows.map((row: ProductMovementRow) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-3 text-xs font-semibold text-slate-600">{formatDateTime(row.created_at)}</td>
                            <td className="p-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                                  row.movement_type === 'PURCHASE'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : row.movement_type === 'SALE'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {row.movement_type === 'PURCHASE'
                                  ? 'Compra'
                                  : row.movement_type === 'SALE'
                                    ? 'Venta'
                                    : 'Ajuste'}
                              </span>
                            </td>
                            <td className="p-3 text-xs font-semibold text-slate-700">
                              {row.reference || '—'}
                              {row.notes ? <p className="text-[10px] text-slate-400 mt-1">{row.notes}</p> : null}
                            </td>
                            <td
                              className={`p-3 text-xs font-black text-right ${
                                row.qty_base < 0 ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              {row.qty_base < 0 ? '-' : '+'}
                              {formatQty(Math.abs(row.qty_base))}
                            </td>
                            <td className="p-3 text-xs font-black text-right text-slate-700">
                              {row.unit_price === null ? '—' : formatCurrency(row.unit_price)}
                            </td>
                            <td className="p-3 text-xs font-black text-right text-slate-900">
                              {row.total_amount > 0 ? formatCurrency(row.total_amount) : '—'}
                            </td>
                            <td className="p-3 text-xs text-right font-semibold text-slate-600">
                              {row.stock_before === null ? '—' : formatQty(row.stock_before)}
                            </td>
                            <td className="p-3 text-xs text-right font-semibold text-slate-600">
                              {row.stock_after === null ? '—' : formatQty(row.stock_after)}
                            </td>
                            <td className="p-3 text-xs font-semibold text-slate-600">{row.created_by || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <NewProductModal
        isOpen={isNewProductOpen}
        barcode={pendingBarcode}
        branchId={branchId ?? ''}
        uoms={uoms}
        categories={categories}
        isCatalogLoading={isLoading}
        mode="create"
        existingProduct={null}
        existingUoms={[]}
        allowBarcodeEdit
        currentUser={currentUser}
        branchName={selectedBranch?.name ?? null}
        onClose={() => {
          setIsNewProductOpen(false);
          setPendingBarcode('');
        }}
        onCreated={() => {
          setIsNewProductOpen(false);
          setPendingBarcode('');
          loadProducts();
        }}
      />

      <NewProductModal
        isOpen={isEditOpen}
        barcode={editProduct?.barcode ?? ''}
        branchId={branchId ?? ''}
        uoms={uoms}
        categories={categories}
        isCatalogLoading={isLoading}
        mode="edit"
        existingProduct={editProduct}
        existingUoms={editUoms}
        allowBarcodeEdit
        currentUser={currentUser}
        branchName={selectedBranch?.name ?? null}
        onClose={() => {
          setIsEditOpen(false);
          setEditProduct(null);
          setEditUoms([]);
        }}
        onUpdated={() => {
          setIsEditOpen(false);
          setEditProduct(null);
          setEditUoms([]);
          loadProducts();
        }}
      />
    </div>
  );
};

export default InventoryScreen;
