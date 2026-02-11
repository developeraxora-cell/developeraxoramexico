
import React, { useState } from 'react';
import { Branch, User, Role } from '../../types';
import { branchesService, isSupabaseConfigured } from '../../services/supabaseClient';
import StatusModal, { StatusType } from '../common/StatusModal';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency } from '../../services/currency';

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
  const [isSaving, setIsSaving] = useState(false);
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean;
    type: StatusType;
    title: string;
    description?: string;
    icon?: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
  });
  const [confirmToggle, setConfirmToggle] = useState<{
    isOpen: boolean;
    branch: Branch | null;
    nextActive: boolean;
  }>({ isOpen: false, branch: null, nextActive: true });

  const showStatus = (type: StatusType, title: string, description?: string, icon?: string) => {
    setStatusModal({ isOpen: true, type, title, description, icon });
  };
  const closeStatus = () => setStatusModal((prev) => ({ ...prev, isOpen: false }));

  const mapDbBranch = (b: any): Branch => ({
    id: b.code,
    code: b.code,
    dbId: Number(b.id),
    name: b.name,
    address: b.address,
    isActive: b.is_active,
    createdAt: b.created_at
  });

  const getNextBranchCode = (existing: Branch[]) => {
    const maxNum = existing.reduce((max, b) => {
      const match = b.code?.match(/\d+/);
      const num = match ? Number(match[0]) : 0;
      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 0);
    return `B${maxNum + 1}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) {
      showStatus('warning', 'Campos incompletos', 'Nombre y dirección son obligatorios.', '⚠️');
      return;
    }
    setIsSaving(true);
    showStatus('loading', editingBranch ? 'Actualizando sucursal...' : 'Creando sucursal...', 'Procesando cambios...', '⏳');
    try {
      if (isSupabaseConfigured) {
        if (editingBranch) {
          const updated = editingBranch.dbId !== undefined
            ? await branchesService.updateById(editingBranch.dbId, {
              name: formData.name,
              address: formData.address
            })
            : await branchesService.updateByCode(editingBranch.code, {
              name: formData.name,
              address: formData.address
            });
          const updatedBranch = mapDbBranch(updated);
          setBranches(branches.map(b => b.id === editingBranch.id ? updatedBranch : b));
          if (selectedBranchId === editingBranch.id && updatedBranch.id !== editingBranch.id) {
            setSelectedBranchId(updatedBranch.id);
          } else if (selectedBranchId === updatedBranch.id && updatedBranch.isActive === false) {
            const nextSelected = branches.find(b => b.id !== updatedBranch.id && b.isActive !== false)?.id || '';
            if (nextSelected) setSelectedBranchId(nextSelected);
          }
        } else {
          const newCode = getNextBranchCode(branches);
          const created = await branchesService.create({
            code: newCode,
            name: formData.name,
            address: formData.address,
            is_active: true
          });
          setBranches([...branches, mapDbBranch(created)]);
        }
      } else {
        if (editingBranch) {
          setBranches(branches.map(b => b.id === editingBranch.id ? {
            ...b,
            name: formData.name,
            address: formData.address
          } : b));
        } else {
          const newCode = getNextBranchCode(branches);
          const newBranch: Branch = {
            id: newCode,
            code: newCode,
            name: formData.name,
            address: formData.address,
            isActive: true
          };
          setBranches([...branches, newBranch]);
        }
      }

      closeModal();
      showStatus('success', editingBranch ? 'Sucursal actualizada' : 'Sucursal creada', 'Se guardaron los cambios.', '✅');
    } catch (err) {
      console.error('Error guardando sucursal:', err);
      showStatus('error', 'No se pudo guardar', 'Revisa la consola para más detalles.', '❌');
    } finally {
      setIsSaving(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBranch(null);
    setFormData({ name: '', address: '' });
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address
    });
    setIsModalOpen(true);
  };

  const handleSwitchBranch = (branchId: string) => {
    if (currentUser.role !== Role.ADMIN && currentUser.branchId !== branchId) {
      showStatus('warning', 'Acceso restringido', 'No tienes permisos para entrar a esta sucursal.', '🔒');
      return;
    }
    const target = branches.find(b => b.id === branchId);
    if (target && target.isActive === false) {
      showStatus('warning', 'Sucursal inactiva', 'No es posible cambiar a esta sucursal.', '⚠️');
      return;
    }
    setSelectedBranchId(branchId);
    showStatus('success', 'Sucursal seleccionada', `Ahora estás en ${branches.find(b => b.id === branchId)?.name}.`, '🌐');
  };

  const handleToggleActive = (branch: Branch) => {
    const nextActive = branch.isActive === false;
    setConfirmToggle({ isOpen: true, branch, nextActive });
  };

  const confirmToggleBranch = async () => {
    const branch = confirmToggle.branch;
    if (!branch) {
      setConfirmToggle({ isOpen: false, branch: null, nextActive: true });
      return;
    }
    setConfirmToggle({ isOpen: false, branch: null, nextActive: true });
    try {
      showStatus('loading', branch.isActive === false ? 'Activando sucursal...' : 'Desactivando sucursal...', 'Procesando cambios...', '⏳');
      if (isSupabaseConfigured) {
        if (branch.dbId !== undefined) {
          await branchesService.updateById(branch.dbId, { is_active: branch.isActive === false });
        } else {
          await branchesService.updateByCode(branch.code, { is_active: branch.isActive === false });
        }
      }
      const nextBranches = branches.map(b => b.id === branch.id ? { ...b, isActive: branch.isActive === false } : b);
      setBranches(nextBranches);
      if (selectedBranchId === branch.id && branch.isActive !== false) {
        const nextSelected = nextBranches.find(b => b.isActive !== false)?.id || '';
        setSelectedBranchId(nextSelected);
      }
      showStatus('success', branch.isActive === false ? 'Sucursal activada' : 'Sucursal desactivada', 'Se guardaron los cambios.', '✅');
    } catch (err) {
      console.error('Error actualizando sucursal:', err);
      showStatus('error', 'No se pudo actualizar', 'Revisa la consola para más detalles.', '❌');
    }
    setConfirmToggle({ isOpen: false, branch: null, nextActive: true });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <StatusModal
        isOpen={statusModal.isOpen}
        type={statusModal.type}
        title={statusModal.title}
        description={statusModal.description}
        icon={statusModal.icon}
        onClose={statusModal.type === 'loading' ? undefined : closeStatus}
      />
      <ConfirmModal
        isOpen={confirmToggle.isOpen}
        title={confirmToggle.nextActive ? 'Activar sucursal' : 'Desactivar sucursal'}
        description={`¿Deseas ${confirmToggle.nextActive ? 'activar' : 'desactivar'} la sucursal "${confirmToggle.branch?.name}"?`}
        icon={confirmToggle.nextActive ? '✅' : '⛔'}
        confirmText={confirmToggle.nextActive ? 'Activar' : 'Desactivar'}
        cancelText="Cancelar"
        onConfirm={confirmToggleBranch}
        onCancel={() => setConfirmToggle({ isOpen: false, branch: null, nextActive: true })}
      />
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

          const isInactive = branch.isActive === false;

          return (
            <div
              key={branch.id}
              className={`group rounded-[2.5rem] border-2 transition-all duration-500 relative overflow-hidden ${isActive
                  ? 'border-orange-500 shadow-2xl shadow-orange-500/10 scale-[1.02]'
                  : isInactive
                    ? 'bg-red-50 border-red-300 shadow-lg shadow-red-200/40'
                    : 'bg-white border-slate-100 hover:border-slate-300'
                }`}
            >
              {/* Indicador de Activa */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 bg-orange-500 py-1.5 text-center">
                  <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Ubicación Seleccionada</span>
                </div>
              )}

              <div className="p-8 pt-10">
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${isActive
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                    : isInactive
                      ? 'bg-red-500 text-white shadow-lg shadow-red-400/30'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'
                    }`}>
                    {branch.name.includes('Bodega') ? '📦' : '🏗️'}
                  </div>
                  <div className="text-right space-y-2">
                    {branch.isActive === false && (
                      <span className="block mt-1 text-[9px] font-black text-red-600 uppercase tracking-[0.2em]">Inactiva</span>
                    )}
                    {currentUser.role === Role.ADMIN && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(branch)}
                          className="w-10 h-10 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-all rounded-xl flex items-center justify-center text-base"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleToggleActive(branch)}
                          className={`w-10 h-10 transition-all rounded-xl flex items-center justify-center text-base ${isInactive
                            ? 'bg-green-50 text-green-600 hover:bg-green-100'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          title={isInactive ? 'Activar' : 'Desactivar'}
                        >
                          {isInactive ? '✅' : '⛔'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className={`text-2xl font-black mb-2 tracking-tight uppercase ${isInactive ? 'text-red-700' : 'text-slate-900'}`}>{branch.name}</h3>
                <p className={`text-xs font-medium leading-relaxed mb-8 flex items-start gap-2 h-10 overflow-hidden ${isInactive ? 'text-red-400' : 'text-slate-400'}`}>
                  <span className={isInactive ? 'text-red-500' : 'text-orange-500'}>📍</span> {branch.address}
                </p>

                {/* Métricas Simuladas por Sucursal */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Valorizado</p>
                    <p className="text-sm font-black text-slate-700">{formatCurrency(Math.random() * 500000 + 100000)}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ventas Hoy</p>
                    <p className="text-sm font-black text-green-600">{formatCurrency(Math.random() * 45000 + 5000)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSwitchBranch(branch.id)}
                    disabled={isActive || isInactive}
                    className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isActive
                      ? 'bg-green-50 text-green-600 border border-green-100 cursor-default'
                      : isInactive
                        ? 'bg-red-100 text-red-500 border border-red-200 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-orange-600 shadow-lg'
                      }`}
                  >
                    {isActive ? '✅ Estás Aquí' : isInactive ? '⛔ Inactiva' : '🚀 Entrar a Sucursal'}
                  </button>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Alta/Edición */}
      {isModalOpen && !statusModal.isOpen && (
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
                <button type="submit" disabled={isSaving} className="flex-1 py-5 bg-orange-500 text-white font-black rounded-2xl shadow-xl shadow-orange-500/20 uppercase tracking-widest text-[10px] disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesScreen;
