
import React, { useState } from 'react';
import { Branch, User, Role } from '../../types';

interface BranchesScreenProps {
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  currentUser: User;
}

const BranchesScreen: React.FC<BranchesScreenProps> = ({
  branches, setBranches, selectedBranchId, setSelectedBranchId, currentUser
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '' });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) return;

    if (editingBranch) {
      setBranches(branches.map(b => b.id === editingBranch.id ? { ...b, ...formData } : b));
    } else {
      const newBranch: Branch = {
        id: `b-${Date.now()}`,
        name: formData.name,
        address: formData.address
      };
      setBranches([...branches, newBranch]);
    }

    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBranch(null);
    setFormData({ name: '', address: '' });
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({ name: branch.name, address: branch.address });
    setIsModalOpen(true);
  };

  const handleSwitchBranch = (branchId: string) => {
    if (currentUser.role !== Role.ADMIN && currentUser.branchId !== branchId) {
      alert("⚠️ No tiene permisos para acceder a esta sucursal.");
      return;
    }
    setSelectedBranchId(branchId);
    alert(`🌐 Cambiando contexto a: ${branches.find(b => b.id === branchId)?.name}`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header de Gestión */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Centro de Expansión</h2>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión de Puntos de Venta y Logística</p>
        </div>
        {currentUser.role === Role.ADMIN && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 active:scale-95 flex items-center gap-2"
          >
            <span>🏢</span> Nueva Sucursal
          </button>
        )}
      </div>

      {/* Grid de Sucursales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {branches.map((branch) => {
          const isActive = branch.id === selectedBranchId;

          return (
            <div
              key={branch.id}
              className={`group bg-white rounded-[2.5rem] border-2 transition-all duration-500 relative overflow-hidden ${isActive
                  ? 'border-orange-500 shadow-2xl shadow-orange-500/10 scale-[1.02]'
                  : 'border-slate-100 hover:border-slate-300'
                }`}
            >
              {/* Indicador de Activa */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 bg-orange-500 py-1.5 text-center">
                  <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Ubicación Seleccionada</span>
                </div>
              )}

              <div className="p-8 pt-10">
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'
                    }`}>
                    {branch.name.includes('Bodega') ? '📦' : '🏗️'}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ID: {branch.id}</span>
                  </div>
                </div>

                <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight uppercase">{branch.name}</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed mb-8 flex items-start gap-2 h-10 overflow-hidden">
                  <span className="text-orange-500">📍</span> {branch.address}
                </p>

                {/* Métricas Simuladas por Sucursal */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Valorizado</p>
                    <p className="text-sm font-black text-slate-700">${(Math.random() * 500000 + 100000).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ventas Hoy</p>
                    <p className="text-sm font-black text-green-600">${(Math.random() * 45000 + 5000).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSwitchBranch(branch.id)}
                    disabled={isActive}
                    className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isActive
                        ? 'bg-green-50 text-green-600 border border-green-100 cursor-default'
                        : 'bg-slate-900 text-white hover:bg-orange-600 shadow-lg'
                      }`}
                  >
                    {isActive ? '✅ Estás Aquí' : '🚀 Entrar a Sucursal'}
                  </button>

                  {currentUser.role === Role.ADMIN && (
                    <button
                      onClick={() => handleEdit(branch)}
                      className="w-14 h-14 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-all rounded-xl flex items-center justify-center text-lg"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Alta/Edición */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Configurar Sucursal</h3>
                <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mt-1">Defina el Punto de Operación</p>
              </div>
              <button onClick={closeModal} className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl hover:bg-red-500 transition-all">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de la Ubicación</label>
                <input
                  type="text" required placeholder="Ej. Sucursal Poniente"
                  className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-bold text-slate-800 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Física</label>
                <textarea
                  required placeholder="Calle, Número, Colonia, CP..."
                  className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-medium text-slate-600 h-28 resize-none transition-all"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
                <button type="submit" className="flex-1 py-5 bg-orange-500 text-white font-black rounded-2xl shadow-xl shadow-orange-500/20 uppercase tracking-widest text-[10px]">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesScreen;
