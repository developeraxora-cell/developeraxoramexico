
import React, { useMemo } from 'react';
import { MixerTruck, ConcreteOrder, MixerStatus } from '../../types';

interface ConcreteFleetProps {
  mixers: MixerTruck[];
  setMixers: React.Dispatch<React.SetStateAction<MixerTruck[]>>;
  orders: ConcreteOrder[];
  setOrders: React.Dispatch<React.SetStateAction<ConcreteOrder[]>>;
}

const ConcreteFleet: React.FC<ConcreteFleetProps> = ({ mixers, setMixers, orders, setOrders }) => {
  
  const updateStatus = (mixerId: string, newStatus: MixerStatus) => {
    const mixer = mixers.find(m => m.id === mixerId);
    if (!mixer) return;

    // Si la olla regresa a Disponible, liberamos el pedido actual
    const currentOrderId = (newStatus === 'DISPONIBLE') ? undefined : mixer.currentOrderId;

    setMixers(prev => prev.map(m => 
      m.id === mixerId ? { ...m, status: newStatus, currentOrderId } : m
    ));

    // Si el estado es REGRESANDO, marcamos el pedido vinculado como ENTREGADO
    if (newStatus === 'REGRESANDO' && mixer.currentOrderId) {
      setOrders(prev => prev.map(o => 
        o.id === mixer.currentOrderId ? { ...o, status: 'ENTREGADO' } : o
      ));
    }
  };

  const getActiveOrderInfo = (orderId?: string) => {
    if (!orderId) return null;
    return orders.find(o => o.id === orderId);
  };

  const stats = useMemo(() => ({
    total: mixers.length,
    available: mixers.filter(m => m.status === 'DISPONIBLE').length,
    onRoute: mixers.filter(m => m.status === 'EN_RUTA').length,
    maintenance: mixers.filter(m => m.status === 'MANTENIMIENTO').length,
  }), [mixers]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Resumen de Flota */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Unidades</p>
          <p className="text-3xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 p-5 rounded-3xl border border-green-100 shadow-sm">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Disponibles</p>
          <p className="text-3xl font-black text-green-700">{stats.available}</p>
        </div>
        <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 shadow-sm">
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">En Tránsito</p>
          <p className="text-3xl font-black text-blue-700">{stats.onRoute}</p>
        </div>
        <div className="bg-orange-50 p-5 rounded-3xl border border-orange-100 shadow-sm">
          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Mantenimiento</p>
          <p className="text-3xl font-black text-orange-700">{stats.maintenance}</p>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Torre de Control Logístico</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Seguimiento de Unidades Mixer en Tiempo Real</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {mixers.map(mixer => {
          const activeOrder = getActiveOrderInfo(mixer.currentOrderId);
          
          return (
            <div key={mixer.id} className={`bg-white rounded-3xl border-2 transition-all p-6 ${
              mixer.status === 'DISPONIBLE' ? 'border-green-100' :
              mixer.status === 'CARGANDO' ? 'border-orange-500' :
              mixer.status === 'EN_RUTA' ? 'border-blue-500 shadow-xl' :
              'border-slate-100'
            }`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚚</span>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{mixer.plate}</h3>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capacidad: {mixer.capacityM3} m³</p>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${
                  mixer.status === 'DISPONIBLE' ? 'bg-green-100 text-green-700' :
                  mixer.status === 'CARGANDO' ? 'bg-orange-500 text-white animate-pulse' :
                  mixer.status === 'EN_RUTA' ? 'bg-blue-600 text-white' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {mixer.status}
                </span>
              </div>

              {activeOrder ? (
                <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Orden Activa</p>
                  <p className="font-bold text-slate-800 text-sm">{activeOrder.id}</p>
                  <p className="text-xs text-slate-500 font-medium">Carga: {activeOrder.qtyM3} m³ de Concreto</p>
                </div>
              ) : (
                <div className="mb-6 h-[72px] flex items-center justify-center border-2 border-dashed border-slate-50 rounded-2xl text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Sin Carga Asignada
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {mixer.status === 'EN_RUTA' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'REGRESANDO')}
                    className="col-span-2 bg-green-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-green-600/20 mb-2"
                  >
                    📍 Confirmar Entrega y Retorno
                  </button>
                )}
                
                {mixer.status === 'REGRESANDO' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'DISPONIBLE')}
                    className="col-span-2 bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg mb-2"
                  >
                    🏢 Llegada a Planta (Disponible)
                  </button>
                )}

                {mixer.status === 'DISPONIBLE' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'MANTENIMIENTO')}
                    className="py-2 bg-red-50 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-100"
                  >
                    🔧 Taller
                  </button>
                )}

                {mixer.status === 'MANTENIMIENTO' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'DISPONIBLE')}
                    className="py-2 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-green-100"
                  >
                    ✅ Liberar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConcreteFleet;
