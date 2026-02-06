
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban } from 'lucide-react';
import { Branch, User } from '../../types';
import { catalogService, type Category, type Product, type ProductUom, type Uom } from '../../services/inventory/catalog.service';
import ConfirmModal from '../common/ConfirmModal';
import NewProductModal from './NewProductModal';

interface InventoryScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

const InventoryScreen: React.FC<InventoryScreenProps> = ({ selectedBranchId, currentUser, branches }) => {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [productsSearch, setProductsSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToRemove, setProductToRemove] = useState<Product | null>(null);
  const [priceProduct, setPriceProduct] = useState<Product | null>(null);
  const [priceValue, setPriceValue] = useState(0);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editUoms, setEditUoms] = useState<ProductUom[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(false);

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || null;
  }, [branches, selectedBranchId]);

  const uomById = useMemo(() => {
    return uoms.reduce<Record<string, Uom>>((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});
  }, [uoms]);

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

  const handleConfirmDeleteProduct = useCallback(async () => {
    if (!productToDelete) return;
    setIsSaving(true);
    setError(null);
    try {
      if (productToDelete.is_active === false) {
        await catalogService.activateProduct(productToDelete.id);
      } else {
        await catalogService.deactivateProduct(productToDelete.id);
      }
      setProductToDelete(null);
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado del producto.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [productToDelete, loadProducts]);

  const handleConfirmRemoveProduct = useCallback(async () => {
    if (!productToRemove) return;
    setIsSaving(true);
    setError(null);
    try {
      await catalogService.deleteProduct(productToRemove.id);
      setProductToRemove(null);
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el producto.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [productToRemove, loadProducts]);

  const handleOpenPriceModal = (product: Product) => {
    setPriceProduct(product);
    setPriceValue(Number((product as any).retail_price ?? (product as any).precio ?? 0));
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
    if (!priceProduct) return;
    if (priceValue <= 0) {
      setError('El precio debe ser mayor a 0.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await catalogService.updateProductPrice(priceProduct.id, Number(priceValue));
      setPriceProduct(null);
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el precio.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const term = productsSearch.trim().toLowerCase();
    return productsList.filter((product) => {
      const matchesTerm = !term
        || product.name.toLowerCase().includes(term)
        || (product.sku ?? '').toLowerCase().includes(term)
        || (product.barcode ?? '').toLowerCase().includes(term);
      const isActive = product.is_active !== false;
      const matchesStatus =
        statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' && isActive)
        || (statusFilter === 'INACTIVE' && !isActive);
      return matchesTerm && matchesStatus;
    });
  }, [productsList, productsSearch, statusFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            📦 Inventario por Sucursal
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Listado de productos activos e inactivos por sucursal.
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
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
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
        <div className="flex bg-slate-100 p-1 rounded-2xl whitespace-nowrap">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                statusFilter === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {status === 'ALL' ? 'Todos' : status === 'ACTIVE' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
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
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Estado</th>
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
              {!isLoading && filteredProducts.map((product) => {
                const isActive = product.is_active !== false;
                const stock = Number((product as any).stock ?? stockByProduct[product.id] ?? 0);
                const minStock = Number((product as any).min_stock ?? 0);
                const stockLabel = Number.isFinite(stock)
                  ? stock.toLocaleString(undefined, { maximumFractionDigits: 3 })
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
                    ${Number((product as any).retail_price ?? (product as any).precio ?? 0).toLocaleString()}
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
                    {minStock.toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                    <span className="text-[9px] font-black text-slate-400">{baseCode}</span>
                  </td>
                  <td className="p-5 text-center text-xs font-bold">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {isActive ? 'Activo' : 'Inactivo'}
                    </span>
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
                        onClick={() => setProductToDelete(product)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                          isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={isActive ? 'Desactivar' : 'Activar'}
                        disabled={isSaving}
                      >
                        <Ban className="w-4 h-4" />
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

      {/* FOOTER INFORMATIVO */}
      <div className="bg-slate-900 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">
        <div className="flex items-center gap-4">
           <span>Sucursal: <span className="text-orange-400">{selectedBranchId || '—'}</span></span>
           <span>Productos en vista: <span className="text-white">{filteredProducts.length}</span></span>
        </div>
        <div className="flex items-center gap-2 text-orange-400">
          Usuario: {currentUser.name}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(productToDelete)}
        title={productToDelete?.is_active === false ? 'Activar producto' : 'Desactivar producto'}
        description={
          productToDelete?.is_active === false
            ? 'El producto volverá a estar disponible para compras.'
            : 'El producto quedará inactivo y no se podrá usar en compras nuevas.'
        }
        icon="⛔"
        confirmText={productToDelete?.is_active === false ? 'Activar' : 'Desactivar'}
        cancelText="Cancelar"
        onConfirm={handleConfirmDeleteProduct}
        onCancel={() => setProductToDelete(null)}
      />

      <ConfirmModal
        isOpen={Boolean(productToRemove)}
        title="Eliminar producto"
        description="Se eliminará del catálogo. Esta acción no se puede deshacer."
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleConfirmRemoveProduct}
        onCancel={() => setProductToRemove(null)}
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
                onChange={(e) => setPriceValue(Number(e.target.value))}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setPriceProduct(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePrice}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase"
                >
                  Guardar
                </button>
              </div>
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
