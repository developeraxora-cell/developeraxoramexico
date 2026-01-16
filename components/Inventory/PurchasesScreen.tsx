
import React, { useState, useMemo } from 'react';
import { Product, Purchase, PurchaseItem, User } from '../../types';
import { UNITS } from '../../constants';

interface PurchasesScreenProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  purchases: Purchase[];
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  selectedBranchId: string;
  currentUser: User;
}

const PurchasesScreen: React.FC<PurchasesScreenProps> = ({ 
  products, setProducts, purchases, setPurchases, selectedBranchId, currentUser 
}) => {
  const [viewMode, setViewMode] = useState<'HISTORY' | 'CREATE'>('HISTORY');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para nueva compra
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const purchaseTotal = purchaseItems.reduce((acc, item) => acc + item.subtotal, 0);

  const addItemToPurchase = (product: Product) => {
    if (purchaseItems.find(i => i.productId === product.id)) return;
    const newItem: PurchaseItem = {
      productId: product.id,
      qty: 1,
      cost: product.costPerBaseUnit,
      subtotal: product.costPerBaseUnit
    };
    setPurchaseItems([...purchaseItems, newItem]);
  };

  const updateItem = (productId: string, qty: number, cost: number) => {
    setPurchaseItems(prev => prev.map(i => 
      i.productId === productId ? { ...i, qty, cost, subtotal: qty * cost } : i
    ));
  };

  const handleSavePurchase = () => {
    if (!supplier || purchaseItems.length === 0) {
      alert("⚠️ Complete el proveedor y añada al menos un producto.");
      return;
    }

    const newPurchase: Purchase = {
      id: `PUR-${Date.now()}`,
      supplier,
      invoiceNumber,
      items: purchaseItems,
      total: purchaseTotal,
      date: new Date(),
      branchId: selectedBranchId,
      userId: currentUser.id
    };

    // 1. Actualizar Stock y Costos en el Catálogo Maestro
    setProducts(prev => prev.map(p => {
      const pItem = purchaseItems.find(pi => pi.productId === p.id);
      if (pItem) {
        return {
          ...p,
          costPerBaseUnit: pItem.cost, // Actualizamos al último costo de compra
          stocks: p.stocks.map(s => s.branchId === selectedBranchId ? { ...s, qty: s.qty + pItem.qty } : s)
        };
      }
      return p;
    }));

    setPurchases([newPurchase, ...purchases]);
    setViewMode('HISTORY');
    setSupplier('');
    setInvoiceNumber('');
    setPurchaseItems([]);
    alert("✅ Entrada de mercancía registrada y costos actualizados.");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER DE COMANDOS */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            {viewMode === 'HISTORY' ? '📥 Historial de Entradas' : '📦 Nueva Entrada por Compra'}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {viewMode === 'HISTORY' ? 'Registro de facturas y recepciones' : 'Abastecimiento de almacén y ajuste de costos'}
          </p>
        </div>
        <button 
          onClick={() => setViewMode(viewMode === 'HISTORY' ? 'CREATE' : 'HISTORY')}
          className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all ${viewMode === 'HISTORY' ? 'bg-slate-900 text-white hover:bg-orange-600' : 'bg-slate-100 text-slate-500'}`}
        >
          {viewMode === 'HISTORY' ? '+ Registrar Compra' : 'Volver al Historial'}
        </button>
      </div>

      {viewMode === 'CREATE' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Lado Izquierdo: Buscador y Selección */}
          <div className="lg:col-span-5 space-y-4">
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Paso 1: Seleccionar Materiales</p>
                <input 
                  type="text" 
                  placeholder="Buscar por SKU o Nombre..."
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {filteredProducts.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => addItemToPurchase(p)}
                      className="w-full text-left p-4 bg-white border border-slate-100 rounded-2xl hover:border-orange-500 hover:bg-orange-50/30 transition-all flex justify-between items-center group"
                    >
                      <div>
                        <p className="font-black text-xs text-slate-800 uppercase leading-none">{p.name}</p>
                        <p className="text-[9px] text-slate-400 mt-1 font-mono">{p.sku}</p>
                      </div>
                      <span className="opacity-0 group-hover:opacity-100 text-orange-500 font-black text-lg">+</span>
                    </button>
                  ))}
                </div>
             </div>
          </div>

          {/* Lado Derecho: Formulario de Factura */}
          <div className="lg:col-span-7 space-y-4">
             <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
                <div className="p-6 bg-slate-900 text-white grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase">Proveedor</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-800 border-none rounded-xl mt-1 p-2 text-xs font-bold focus:ring-1 focus:ring-orange-500"
                      placeholder="Nombre de la empresa..."
                      value={supplier}
                      onChange={e => setSupplier(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase"># Factura / Remisión</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-800 border-none rounded-xl mt-1 p-2 text-xs font-bold focus:ring-1 focus:ring-orange-500"
                      placeholder="Ej. F-9901"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto min-h-[400px]">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Detalle de Entrada</p>
                   <div className="space-y-3">
                     {purchaseItems.map(item => {
                       const prod = products.find(p => p.id === item.productId);
                       return (
                         <div key={item.productId} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-4">
                               <p className="font-black text-xs text-slate-800 uppercase">{prod?.name}</p>
                               <p className="text-[9px] text-slate-400">Costo Actual: ${prod?.costPerBaseUnit.toFixed(2)}</p>
                            </div>
                            <div className="col-span-3">
                               <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Cant. Entrada</label>
                               <input 
                                  type="number" 
                                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-black text-xs"
                                  value={item.qty}
                                  onChange={e => updateItem(item.productId, Number(e.target.value), item.cost)}
                               />
                            </div>
                            <div className="col-span-3">
                               <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Costo Compra ($)</label>
                               <input 
                                  type="number" 
                                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-black text-xs text-red-600"
                                  value={item.cost}
                                  onChange={e => updateItem(item.productId, item.qty, Number(e.target.value))}
                               />
                            </div>
                            <div className="col-span-2 text-right">
                               <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Subtotal</p>
                               <p className="font-black text-xs text-slate-900">${item.subtotal.toLocaleString()}</p>
                            </div>
                         </div>
                       );
                     })}
                     {purchaseItems.length === 0 && (
                       <div className="py-20 text-center text-slate-300 italic text-sm">
                          No hay productos seleccionados
                       </div>
                     )}
                   </div>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase">Total de Inversión</p>
                      <p className="text-3xl font-black text-slate-900">${purchaseTotal.toLocaleString()}</p>
                   </div>
                   <button 
                    onClick={handleSavePurchase}
                    disabled={purchaseItems.length === 0}
                    className={`px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all ${purchaseItems.length > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-slate-200 text-slate-400'}`}
                   >
                     Confirmar Recepción
                   </button>
                </div>
             </div>
          </div>
        </div>
      ) : (
        /* VISTA DE HISTORIAL */
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">ID / Fecha</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Proveedor</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Factura</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Items</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Monto Total</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-5">
                    <p className="text-xs font-black text-slate-800">{p.id}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">{p.date.toLocaleString()}</p>
                  </td>
                  <td className="p-5 font-black text-xs text-slate-700 uppercase">{p.supplier}</td>
                  <td className="p-5 font-mono text-xs text-orange-600 font-bold">{p.invoiceNumber || 'S/N'}</td>
                  <td className="p-5 text-center font-bold text-slate-500">{p.items.length}</td>
                  <td className="p-5 text-right font-black text-slate-900 text-base">
                    ${p.total.toLocaleString()}
                  </td>
                  <td className="p-5 text-center">
                    <button className="text-slate-300 hover:text-slate-900">📋 Detalle</button>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr><td colSpan={6} className="p-20 text-center text-slate-300 italic">No hay registros de compras recientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default PurchasesScreen;
