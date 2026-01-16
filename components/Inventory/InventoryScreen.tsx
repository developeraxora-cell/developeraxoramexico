
import React, { useState, useMemo } from 'react';
import { Product, User, AuditItem, AuditReason } from '../../types';
import { UNITS } from '../../constants';

interface InventoryScreenProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  selectedBranchId: string;
  currentUser: User;
}

const InventoryScreen: React.FC<InventoryScreenProps> = ({ products, setProducts, selectedBranchId, currentUser }) => {
  const [viewMode, setViewMode] = useState<'VIEW' | 'AUDIT'>('VIEW');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'OK'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');

  // Estado para la sesión de Auditoría Activa
  const [auditSession, setAuditSession] = useState<Record<string, { physical: number, snapshot: number, reason: AuditReason }>>({});

  const categories = useMemo(() => ['TODAS', ...new Set(products.map(p => p.category))], [products]);

  // Procesamiento de datos para la vista normal
  const inventoryData = useMemo(() => {
    return products.map(p => {
      const currentStock = p.stocks.find(s => s.branchId === selectedBranchId)?.qty || 0;
      const health = currentStock <= p.minStock ? 'CRITICAL' : 
                     currentStock <= p.minStock * 1.5 ? 'WARNING' : 'OK';
      const percent = Math.min(100, (currentStock / (p.maxStock || currentStock || 1)) * 100);
      
      return { ...p, currentStock, health, percent };
    }).filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'TODAS' || p.category === selectedCategory;
      const matchesStatus = filterStatus === 'ALL' || p.health === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchTerm, selectedCategory, filterStatus, selectedBranchId]);

  // LÓGICA DE AUDITORÍA (El "Efecto Oxxo")
  const startAuditForItem = (productId: string, currentQty: number) => {
    if (auditSession[productId]) return;
    setAuditSession(prev => ({
      ...prev,
      [productId]: { physical: 0, snapshot: currentQty, reason: 'CONTEO_CORRECTO' }
    }));
  };

  const updateAuditQty = (productId: string, val: number) => {
    setAuditSession(prev => ({
      ...prev,
      [productId]: { ...prev[productId], physical: val }
    }));
  };

  const finalizeAudit = () => {
    const confirmFinalize = window.confirm(`¿Desea aplicar los ajustes de ${Object.keys(auditSession).length} productos? El stock se actualizará según el conteo físico.`);
    if (!confirmFinalize) return;

    setProducts(prev => prev.map(p => {
      const audit = auditSession[p.id];
      if (audit) {
        return {
          ...p,
          stocks: p.stocks.map(s => s.branchId === selectedBranchId ? { ...s, qty: audit.physical } : s)
        };
      }
      return p;
    }));

    setAuditSession({});
    setViewMode('VIEW');
    alert("✅ Inventario conciliado correctamente. Los ajustes han sido aplicados.");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER DE CONTROL */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            {viewMode === 'VIEW' ? '📦 Control de Existencias' : '📝 Modo Auditoría Cíclica'}
            {viewMode === 'AUDIT' && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">VIVO</span>}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {viewMode === 'VIEW' ? 'Monitoreo de niveles y salud de stock' : 'Conciliación física vs sistema (Sin detener ventas)'}
          </p>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
          {viewMode === 'VIEW' ? (
            <button 
              onClick={() => setViewMode('AUDIT')}
              className="w-full lg:w-auto bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
            >
              <span>📊</span> Iniciar Arqueo de Pasillo
            </button>
          ) : (
            <div className="flex gap-2 w-full">
              <button onClick={() => { setAuditSession({}); setViewMode('VIEW'); }} className="flex-1 lg:flex-none bg-slate-100 text-slate-500 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancelar</button>
              <button 
                onClick={finalizeAudit}
                disabled={Object.keys(auditSession).length === 0}
                className={`flex-1 lg:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all ${Object.keys(auditSession).length > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
              >
                Aplicar Ajustes ({Object.keys(auditSession).length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Escriba SKU o nombre para filtrar rápidamente..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 lg:pb-0">
          <select 
            className="bg-slate-50 border-none rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {viewMode === 'VIEW' && (
            <div className="flex bg-slate-100 p-1 rounded-2xl whitespace-nowrap">
              {(['ALL', 'CRITICAL', 'WARNING', 'OK'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${filterStatus === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {s === 'ALL' ? 'Todos' : s === 'CRITICAL' ? 'Crítico' : s === 'WARNING' ? 'Aviso' : 'Óptimo'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TABLA PRINCIPAL - MODO HÍBRIDO */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-5 text-[10px] font-black uppercase tracking-widest">Producto</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Sistema</th>
                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">
                  {viewMode === 'VIEW' ? 'Indicador' : 'Conteo Físico'}
                </th>
                {viewMode === 'AUDIT' && (
                  <>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Diferencia</th>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Acción</th>
                  </>
                )}
                {viewMode === 'VIEW' && <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Estado</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryData.map(item => {
                const audit = auditSession[item.id];
                const diff = audit ? audit.physical - audit.snapshot : 0;

                return (
                  <tr key={item.id} className={`transition-colors ${audit ? 'bg-orange-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="p-5">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 uppercase text-xs tracking-tight">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">{item.sku}</span>
                      </div>
                    </td>
                    <td className="p-5 text-right font-bold text-slate-500 text-sm">
                      {item.currentStock.toLocaleString()}
                      <span className="ml-1 text-[9px] uppercase">{UNITS.find(u => u.id === item.baseUnitId)?.symbol}</span>
                    </td>
                    
                    <td className="p-5 text-center">
                      {viewMode === 'VIEW' ? (
                        <div className="w-32 mx-auto h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-700 ${item.health === 'CRITICAL' ? 'bg-red-500' : 'bg-green-500'}`} 
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                      ) : (
                        audit ? (
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => updateAuditQty(item.id, Math.max(0, audit.physical - 1))} className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 font-black hover:bg-slate-300">-</button>
                            <input 
                              type="number" 
                              className="w-20 p-2 bg-white border-2 border-orange-400 rounded-xl text-center font-black text-sm outline-none focus:ring-2 focus:ring-orange-500"
                              value={audit.physical}
                              onChange={(e) => updateAuditQty(item.id, Number(e.target.value))}
                            />
                            <button onClick={() => updateAuditQty(item.id, audit.physical + 1)} className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 font-black hover:bg-slate-300">+</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => startAuditForItem(item.id, item.currentStock)}
                            className="bg-orange-100 text-orange-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-orange-600 hover:text-white transition-all"
                          >
                            ➕ Agregar al Arqueo
                          </button>
                        )
                      )}
                    </td>

                    {viewMode === 'AUDIT' && (
                      <>
                        <td className="p-5 text-right">
                          {audit && (
                            <span className={`font-black text-sm ${diff === 0 ? 'text-slate-300' : diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </td>
                        <td className="p-5 text-center">
                          {audit && (
                            <button 
                              onClick={() => {
                                const newSession = { ...auditSession };
                                delete newSession[item.id];
                                setAuditSession(newSession);
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </>
                    )}

                    {viewMode === 'VIEW' && (
                      <td className="p-5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                          item.health === 'CRITICAL' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${item.health === 'CRITICAL' ? 'bg-red-600 animate-pulse' : 'bg-green-600'}`}></span>
                          {item.health === 'CRITICAL' ? 'Agotado' : 'Óptimo'}
                        </span>
                      </td>
                    )}
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
           <span>Sucursal: <span className="text-orange-400">{selectedBranchId}</span></span>
           <span>SKUs en Vista: <span className="text-white">{inventoryData.length}</span></span>
        </div>
        {viewMode === 'AUDIT' && (
           <div className="flex items-center gap-2 text-orange-400">
             <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
             Sesión de auditoría iniciada por {currentUser.name}
           </div>
        )}
      </div>
    </div>
  );
};

export default InventoryScreen;
