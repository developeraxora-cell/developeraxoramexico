
import React, { useState, useMemo } from 'react';
import { ConcreteOrder, ConcreteFormula, MixerTruck, Product, Customer } from '../../types';

interface ConcreteOpsProps {
  orders: ConcreteOrder[];
  setOrders: React.Dispatch<React.SetStateAction<ConcreteOrder[]>>;
  formulas: ConcreteFormula[];
  mixers: MixerTruck[];
  setMixers: React.Dispatch<React.SetStateAction<MixerTruck[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  customers: Customer[];
  selectedBranchId: string;
}

const ConcreteOps: React.FC<ConcreteOpsProps> = ({
  orders, setOrders, formulas, mixers, setMixers, products, setProducts, customers, selectedBranchId
}) => {
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customerId: '',
    formulaId: '',
    qtyM3: 1,
    scheduledDate: new Date().toISOString().slice(0, 16)
  });

  const branchOrders = useMemo(() => 
    orders.filter(o => o.branchId === selectedBranchId), 
  [orders, selectedBranchId]);

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const formula = formulas.find(f => f.id === newOrder.formulaId);
    if (!formula) return;

    const order: ConcreteOrder = {
      id: `CONC-${Date.now()}`,
      customerId: newOrder.customerId,
      formulaId: newOrder.formulaId,
      qtyM3: newOrder.qtyM3,
      branchId: selectedBranchId,
      scheduledDate: new Date(newOrder.scheduledDate),
      status: 'PENDIENTE',
      totalAmount: newOrder.qtyM3 * 2150 // Precio promedio base por m3
    };

    setOrders([order, ...orders]);
    setIsNewOrderModalOpen(false);
    alert("✅ Pedido programado con éxito.");
  };

  const processBatching = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const formula = formulas.find(f => f.id === order?.formulaId);
    const availableMixer = mixers.find(m => m.status === 'DISPONIBLE');

    if (!order || !formula) return;
    if (!availableMixer) {
      alert("❌ No hay ollas (mixers) disponibles para cargar.");
      return;
    }

    // 1. Validar Stock de todos los componentes
    const missingMaterials = formula.materials.filter(m => {
      const product = products.find(p => p.id === m.productId);
      const branchStock = product?.stocks.find(s => s.branchId === selectedBranchId)?.qty || 0;
      return branchStock < (m.qtyPerM3 * order.qtyM3);
    });

    if (missingMaterials.length > 0) {
      const names = missingMaterials.map(m => products.find(p => p.id === m.productId)?.name).join(", ");
      alert(`❌ Inventario insuficiente para: ${names}`);
      return;
    }

    // 2. Consumir Stock
    setProducts(prev => prev.map(p => {
      const needed = formula.materials.find(m => m.productId === p.id);
      if (needed) {
        return {
          ...p,
          stocks: p.stocks.map(s => 
            s.branchId === selectedBranchId 
              ? { ...s, qty: s.qty - (needed.qtyPerM3 * order.qtyM3) } 
              : s
          )
        };
      }
      return p;
    }));

    // 3. Actualizar Estado de Olla y Pedido
    setMixers(prev => prev.map(m => 
      m.id === availableMixer.id ? { ...m, status: 'CARGANDO', currentOrderId: order.id } : m
    ));

    setOrders(prev => prev.map(o => 
      o.id === orderId ? { ...o, status: 'PRODUCIENDO', mixerId: availableMixer.id } : o
    ));

    alert(`🏗️ Producción iniciada. Olla ${availableMixer.plate} cargando ${order.qtyM3}m³.`);
  };

  const dispatchTruck = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.mixerId) return;

    setMixers(prev => prev.map(m => 
      m.id === order.mixerId ? { ...m, status: 'EN_RUTA' } : m
    ));

    setOrders(prev => prev.map(o => 
      o.id === orderId ? { ...o, status: 'EN_TRANSITO' } : o
    ));
    
    alert("🚚 Unidad en ruta a obra.");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Panel de Batching</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Control de Producción y Despacho</p>
        </div>
        <button 
          onClick={() => setIsNewOrderModalOpen(true)}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-orange-600 transition-all"
        >
          + Programar Colado
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna de Pedidos Pendientes */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Pedidos en Espera</h3>
          <div className="grid grid-cols-1 gap-4">
            {branchOrders.map(order => {
              const customer = customers.find(c => c.id === order.customerId);
              const formula = formulas.find(f => f.id === order.formulaId);
              return (
                <div key={order.id} className={`bg-white p-5 rounded-3xl border-2 transition-all ${order.status === 'PRODUCIENDO' ? 'border-orange-500 bg-orange-50/10' : 'border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-black text-orange-500 uppercase">{formula?.name}</p>
                      <h4 className="text-lg font-black text-slate-800 tracking-tighter">{customer?.name}</h4>
                      <p className="text-xs text-slate-400 font-bold uppercase">{order.qtyM3} m³ • {new Date(order.scheduledDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} hrs</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${
                      order.status === 'PENDIENTE' ? 'bg-slate-100 text-slate-500' : 
                      order.status === 'PRODUCIENDO' ? 'bg-orange-500 text-white animate-pulse' : 
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {order.status === 'PENDIENTE' && (
                      <button 
                        onClick={() => processBatching(order.id)}
                        className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest"
                      >
                        ⚡ Iniciar Carga (Batch)
                      </button>
                    )}
                    {order.status === 'PRODUCIENDO' && (
                      <button 
                        onClick={() => dispatchTruck(order.id)}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest"
                      >
                        🚚 Salida de Planta
                      </button>
                    )}
                    <button className="px-4 py-3 bg-slate-50 text-slate-400 rounded-xl">📄</button>
                  </div>
                </div>
              );
            })}
            {branchOrders.length === 0 && <div className="p-12 text-center text-slate-300 italic">No hay colados programados para hoy.</div>}
          </div>
        </div>

        {/* Columna de Flota Mixer */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Estado de Ollas</h3>
          <div className="space-y-3">
            {mixers.map(mixer => (
              <div key={mixer.id} className="bg-slate-900 p-4 rounded-2xl text-white shadow-lg border border-slate-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xl font-black tracking-tighter">{mixer.plate}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Capacidad: {mixer.capacityM3}m³</p>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${
                    mixer.status === 'DISPONIBLE' ? 'bg-green-500 text-white' : 
                    mixer.status === 'CARGANDO' ? 'bg-orange-500 text-white' : 
                    'bg-blue-500 text-white'
                  }`}>
                    {mixer.status}
                  </div>
                </div>
                {mixer.currentOrderId && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2">
                    <span className="text-xs">🏗️</span>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Orden Activa: {mixer.currentOrderId.slice(-6)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Nuevo Colado */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center shadow-lg">
              <h3 className="text-xl font-black uppercase tracking-tighter">Programar Colado</h3>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-8 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Cliente</label>
                <select 
                  required className="w-full p-3 bg-gray-50 rounded-xl outline-none font-bold"
                  value={newOrder.customerId}
                  onChange={e => setNewOrder({...newOrder, customerId: e.target.value})}
                >
                  <option value="">Seleccione...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Fórmula</label>
                  <select 
                    required className="w-full p-3 bg-gray-50 rounded-xl outline-none font-bold"
                    value={newOrder.formulaId}
                    onChange={e => setNewOrder({...newOrder, formulaId: e.target.value})}
                  >
                    <option value="">Seleccione...</option>
                    {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Volumen (m³)</label>
                  <input 
                    type="number" required step="0.5" min="1"
                    className="w-full p-3 bg-gray-50 rounded-xl outline-none font-black text-center"
                    value={newOrder.qtyM3}
                    onChange={e => setNewOrder({...newOrder, qtyM3: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fecha y Hora de Salida</label>
                <input 
                  type="datetime-local" required
                  className="w-full p-3 bg-gray-50 rounded-xl outline-none font-bold"
                  value={newOrder.scheduledDate}
                  onChange={e => setNewOrder({...newOrder, scheduledDate: e.target.value})}
                />
              </div>
              <button type="submit" className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest text-xs mt-4">Confirmar Agenda</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConcreteOps;
