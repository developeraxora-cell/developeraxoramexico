
import React, { useState } from 'react';
import { Product, ProductConversion, Unit } from '../../types';
import { UNITS } from '../../constants';

interface ProductScreenProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  conversions: ProductConversion[];
  setConversions: React.Dispatch<React.SetStateAction<ProductConversion[]>>;
}

const ProductScreen: React.FC<ProductScreenProps> = ({ products, setProducts, conversions, setConversions }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  // Estado del formulario
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category: 'Materiales',
    baseUnitId: 'u1',
    price: 0,
    cost: 0,
    minStock: 0,
    allowsDecimals: true
  });

  // Estado para nueva conversión
  const [newConv, setNewConv] = useState({ fromUnitId: 'u3', factor: 0 });

  const categories = ['Todas', 'Materiales', 'Acero', 'Herramientas', 'Plomería', 'Eléctrico'];

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const productId = editingProductId || `p-${Date.now()}`;
    
    // Fixed: changed currentStock to stocks as per Product type definition
    const product: Product = {
      id: productId,
      sku: formData.sku,
      name: formData.name,
      category: formData.category,
      baseUnitId: formData.baseUnitId,
      allowsDecimals: formData.allowsDecimals,
      minStock: formData.minStock,
      maxStock: formData.minStock * 5,
      stocks: editingProductId ? (products.find(p => p.id === editingProductId)?.stocks || []) : [],
      costPerBaseUnit: formData.cost,
      pricePerBaseUnit: formData.price
    };

    if (editingProductId) {
      setProducts(products.map(p => p.id === editingProductId ? product : p));
    } else {
      setProducts([product, ...products]);
    }
    
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProductId(null);
    setFormData({
      sku: '', name: '', category: 'Materiales', baseUnitId: 'u1', 
      price: 0, cost: 0, minStock: 0, allowsDecimals: true
    });
  };

  const handleAddConversion = (productId: string) => {
    if (newConv.factor <= 0) return;
    const conv: ProductConversion = {
      id: `c-${Date.now()}`,
      productId,
      fromUnitId: newConv.fromUnitId,
      toUnitId: products.find(p => p.id === productId)!.baseUnitId,
      factor: newConv.factor
    };
    setConversions([...conversions, conv]);
    setNewConv({ fromUnitId: 'u3', factor: 0 });
  };

  const removeConversion = (id: string) => {
    setConversions(conversions.filter(c => c.id !== id));
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Barra de Herramientas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-1 gap-2 w-full">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              className="w-full p-3 pl-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          </div>
          <select 
            className="p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-orange-500"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 whitespace-nowrap"
        >
          <span className="text-xl">+</span> Nuevo Producto
        </button>
      </div>

      {/* Grid de Productos mejorado */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Información</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Costos y Precios</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unidad Base</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Presentaciones / Conversiones</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(p => {
              const prodConversions = conversions.filter(c => c.productId === p.id);
              const margin = ((p.pricePerBaseUnit - p.costPerBaseUnit) / p.pricePerBaseUnit) * 100;

              return (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4 max-w-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-orange-600 uppercase tracking-tighter mb-0.5">{p.category}</span>
                      <span className="font-bold text-slate-800">{p.name}</span>
                      <span className="text-xs text-gray-400 font-mono">SKU: {p.sku}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Costo:</span>
                        <span className="font-bold text-red-500">${p.costPerBaseUnit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Venta:</span>
                        <span className="font-bold text-green-600">${p.pricePerBaseUnit.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Margen: {margin.toFixed(1)}%
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                      {UNITS.find(u => u.id === p.baseUnitId)?.symbol}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {prodConversions.map(c => (
                          <div key={c.id} className="flex items-center bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                            <span className="text-[10px] font-bold text-slate-600">
                              1 {UNITS.find(u => u.id === c.fromUnitId)?.symbol} = {c.factor} {UNITS.find(u => u.id === p.baseUnitId)?.symbol}
                            </span>
                            <button onClick={() => removeConversion(c.id)} className="ml-1 text-red-400 hover:text-red-600">×</button>
                          </div>
                        ))}
                      </div>
                      {/* Mini-form para añadir conversión rápido */}
                      <div className="flex gap-1 items-center bg-slate-50 p-1 rounded-lg border border-dashed border-slate-200">
                         <select 
                          className="text-[9px] bg-transparent border-none outline-none font-bold"
                          onChange={(e) => setNewConv({...newConv, fromUnitId: e.target.value})}
                          value={newConv.fromUnitId}
                         >
                           {UNITS.filter(u => u.id !== p.baseUnitId).map(u => (
                             <option key={u.id} value={u.id}>{u.symbol}</option>
                           ))}
                         </select>
                         <input 
                          type="number" 
                          placeholder="Factor"
                          className="w-10 text-[9px] bg-transparent border-none outline-none font-bold"
                          onBlur={(e) => handleAddConversion(p.id)}
                          onChange={(e) => setNewConv({...newConv, factor: Number(e.target.value)})}
                         />
                         <button className="text-orange-500 text-xs font-bold">+</button>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => {
                        setEditingProductId(p.id);
                        setFormData({
                          sku: p.sku, name: p.name, category: p.category, 
                          baseUnitId: p.baseUnitId, price: p.pricePerBaseUnit, 
                          cost: p.costPerBaseUnit, minStock: p.minStock, 
                          allowsDecimals: p.allowsDecimals
                        });
                        setIsModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-orange-500 p-2 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL NUEVO/EDITAR PRODUCTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">
                  {editingProductId ? 'Editar Material' : 'Nuevo Producto'}
                </h3>
                <p className="text-slate-400 text-xs">Configure las reglas fundamentales de venta.</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-8 grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre Comercial</label>
                <input 
                  type="text" required placeholder="Ej. Varilla 1/2 pulgada"
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-semibold transition-all"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Código / SKU</label>
                <input 
                  type="text" required placeholder="SKU-BASE-001"
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-mono transition-all"
                  value={formData.sku}
                  onChange={e => setFormData({...formData, sku: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Categoría</label>
                <select 
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none transition-all"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  {categories.filter(c => c !== 'Todas').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Unidad de Medida Base</label>
                <select 
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none transition-all"
                  value={formData.baseUnitId}
                  onChange={e => setFormData({...formData, baseUnitId: e.target.value})}
                >
                  {UNITS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Costo Unitario (Base)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input 
                    type="number" step="0.01" required
                    className="w-full p-3 pl-8 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-bold text-red-600"
                    value={formData.cost}
                    onChange={e => setFormData({...formData, cost: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio Venta (Base)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input 
                    type="number" step="0.01" required
                    className="w-full p-3 pl-8 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-bold text-green-600"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="col-span-2 flex items-center gap-4 bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <input 
                  type="checkbox" id="decimals_modal" 
                  className="w-5 h-5 accent-orange-500"
                  checked={formData.allowsDecimals}
                  onChange={e => setFormData({...formData, allowsDecimals: e.target.checked})}
                />
                <label htmlFor="decimals_modal" className="text-sm font-semibold text-orange-800">
                  Permitir venta fraccionada (Ej. 1.25 kg de arena)
                </label>
              </div>

              <div className="col-span-2 flex gap-4 mt-4">
                <button 
                  type="button" onClick={closeModal}
                  className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all uppercase tracking-widest"
                >
                  {editingProductId ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductScreen;
