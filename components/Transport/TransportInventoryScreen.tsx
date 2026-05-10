import React, { useCallback, useEffect, useState } from 'react';
import { Branch, User } from '../../types';
import { catalogService, type Product, type Supplier } from '../../services/inventory/catalog.service';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const TransportInventoryScreen: React.FC<Props> = ({ selectedBranchId, currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'suppliers'>('products');

  const loadData = useCallback(async () => {
    if (!selectedBranchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [prods, stock, supps] = await Promise.all([
        catalogService.listProductsByBranch(selectedBranchId),
        catalogService.listStockByBranch(selectedBranchId),
        catalogService.listSuppliersByBranch(selectedBranchId),
      ]);
      setProducts(prods);
      const map: Record<string, number> = {};
      stock.forEach((s) => { map[s.product_id] = s.qty_base; });
      setStockMap(map);
      setSuppliers(supps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (stock: number, min: number | null | undefined) => {
    if (stock <= 0) return { label: 'Sin stock', color: 'bg-red-100 text-red-700' };
    if (min && stock <= min) return { label: 'Stock bajo', color: 'bg-yellow-100 text-yellow-700' };
    return { label: 'En stock', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="space-y-6">
      {/* Notice banner */}
      <div className="rounded-2xl bg-orange-50 border border-orange-200 px-5 py-3 flex items-center gap-3">
        <span className="text-xl">🚧</span>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">Gestión de catálogo — próximamente</p>
          <p className="text-xs text-orange-700 font-semibold mt-0.5">
            Alta, edición y baja de productos estará disponible en la siguiente entrega. Por ahora puedes consultar el inventario actual.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['products', 'suppliers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab
                ? 'bg-slate-900 text-white shadow-lg'
                : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {tab === 'products' ? `📦 Productos (${products.length})` : `🏭 Proveedores (${suppliers.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'products' && (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
            />
            <button
              onClick={() => void loadData()}
              disabled={isLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-500 hover:border-slate-300 transition-all disabled:opacity-50"
            >
              ↻ Actualizar
            </button>
          </div>

          {isLoading && (
            <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
              <p className="text-sm font-bold text-slate-400 animate-pulse">Cargando inventario...</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-semibold text-red-700">{error}</div>
          )}

          {!isLoading && !error && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-slate-400">
                  {products.length === 0
                    ? 'No hay productos registrados en esta sucursal.'
                    : 'Sin resultados para tu búsqueda.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Producto</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">SKU</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Stock actual</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Precio venta</th>
                      <th className="text-center px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((p) => {
                      const stock = stockMap[p.id] ?? 0;
                      const status = getStockStatus(stock, p.min_stock);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 font-bold text-slate-900">{p.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-800">{stock.toLocaleString('es-MX')}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">
                            {p.retail_price != null ? formatCurrency(p.retail_price) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${status.color}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'suppliers' && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {suppliers.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">No hay proveedores registrados en esta sucursal.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Proveedor</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Teléfono</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Correo</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Dirección</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default TransportInventoryScreen;
