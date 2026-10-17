import AppIcon from '../common/AppIcon';

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
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-400  tracking-wide mb-1">Total Unidades</p>
          <p className="text-3xl font-semibold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 p-5 rounded-2xl border border-green-100 shadow-sm">
          <p className="text-xs font-semibold text-green-600  tracking-wide mb-1">Disponibles</p>
          <p className="text-3xl font-semibold text-green-700">{stats.available}</p>
        </div>
        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm">
          <p className="text-xs font-semibold text-blue-600  tracking-wide mb-1">En Tránsito</p>
          <p className="text-3xl font-semibold text-blue-700">{stats.onRoute}</p>
        </div>
        <div className="bg-brand-50 p-5 rounded-2xl border border-brand-100 shadow-sm">
          <p className="text-xs font-semibold text-brand-600  tracking-wide mb-1">Mantenimiento</p>
          <p className="text-3xl font-semibold text-brand-700">{stats.maintenance}</p>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800  tracking-tight">Torre de Control Logístico</h2>
          <p className="text-xs text-slate-400 font-bold  tracking-wide">Seguimiento de Unidades Mixer en Tiempo Real</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {mixers.map(mixer => {
          const activeOrder = getActiveOrderInfo(mixer.currentOrderId);
          
          return (
            <div key={mixer.id} className={`bg-white rounded-2xl border-2 transition-all p-6 ${
              mixer.status === 'DISPONIBLE' ? 'border-green-100' :
              mixer.status === 'CARGANDO' ? 'border-brand-500' :
              mixer.status === 'EN_RUTA' ? 'border-blue-500 shadow-sm' :
              'border-slate-100'
            }`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl"><AppIcon name="truck" /></span>
                    <h3 className="text-2xl font-semibold text-slate-900 tracking-tight">{mixer.plate}</h3>
                  </div>
                  <p className="text-xs font-semibold text-slate-400  tracking-wide">Capacidad: {mixer.capacityM3} m³</p>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-[11px] font-semibold  ${
                  mixer.status === 'DISPONIBLE' ? 'bg-green-100 text-green-700' :
                  mixer.status === 'CARGANDO' ? 'bg-brand-500 text-white animate-pulse' :
                  mixer.status === 'EN_RUTA' ? 'bg-blue-600 text-white' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {mixer.status}
                </span>
              </div>

              {activeOrder ? (
                <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400  mb-2">Orden Activa</p>
                  <p className="font-bold text-slate-800 text-sm">{activeOrder.id}</p>
                  <p className="text-xs text-slate-500 font-medium">Carga: {activeOrder.qtyM3} m³ de Concreto</p>
                </div>
              ) : (
                <div className="mb-6 h-[72px] flex items-center justify-center border-2 border-dashed border-slate-50 rounded-xl text-xs font-bold text-slate-300  tracking-wide">
                  Sin Carga Asignada
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {mixer.status === 'EN_RUTA' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'REGRESANDO')}
                    className="col-span-2 bg-green-600 text-white py-3 rounded-xl font-semibold text-xs  tracking-wide shadow-lg shadow-green-600/20 mb-2"
                  >
                    <AppIcon name="pin" /> Confirmar Entrega y Retorno
                  </button>
                )}
                
                {mixer.status === 'REGRESANDO' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'DISPONIBLE')}
                    className="col-span-2 bg-slate-900 text-white py-3 rounded-xl font-semibold text-xs  tracking-wide shadow-lg mb-2"
                  >
                    <AppIcon name="building" /> Llegada a Planta (Disponible)
                  </button>
                )}

                {mixer.status === 'DISPONIBLE' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'MANTENIMIENTO')}
                    className="py-2 bg-red-50 text-red-600 rounded-lg text-[11px] font-semibold  tracking-wide border border-red-100"
                  >
                    <AppIcon name="wrench" /> Taller
                  </button>
                )}

                {mixer.status === 'MANTENIMIENTO' && (
                  <button 
                    onClick={() => updateStatus(mixer.id, 'DISPONIBLE')}
                    className="py-2 bg-green-50 text-green-600 rounded-lg text-[11px] font-semibold  tracking-wide border border-green-100"
                  >
                    <AppIcon name="success" /> Liberar
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
