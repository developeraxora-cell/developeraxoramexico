import React, { useState, useMemo, useEffect } from 'react';
import { DieselTank, Vehicle, Driver, DieselLog, User } from '../../types';
import DieselTankCard from './DieselTankCard';
import DeleteLogModal from './DeleteLogModal';
import EditCapacityModal from './EditCapacityModal';
import StatusModal, { StatusType } from '../common/StatusModal';
import ConfirmModal from '../common/ConfirmModal';
import {
  dieselTanksService,
  vehiclesService,
  driversService,
  dieselLogsService,
  subscriptions,
  supabase,
} from '../../services/supabaseClient';

interface DieselScreenProps {
  tanks: DieselTank[];
  setTanks: React.Dispatch<React.SetStateAction<DieselTank[]>>;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  drivers: Driver[];
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>;
  logs: DieselLog[];
  setLogs: React.Dispatch<React.SetStateAction<DieselLog[]>>;
  currentUser: User;
  selectedBranchId: string;
}

const DieselScreen: React.FC<DieselScreenProps> = ({
  tanks, setTanks, vehicles, setVehicles, drivers, setDrivers, logs, setLogs, currentUser, selectedBranchId
}) => {
  const [activeView, setActiveView] = useState<'status' | 'logs' | 'assets'>('status');
  const [isCargaModalOpen, setIsCargaModalOpen] = useState(false);
  const [isRecepcionModalOpen, setIsRecepcionModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState<'vehicle' | 'driver' | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditCapacityOpen, setIsEditCapacityOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const branchTanks = useMemo(() => tanks.filter(t => t.branchId === selectedBranchId), [tanks, selectedBranchId]);

  const [cargaData, setCargaData] = useState({ tankId: '', vehicleId: '', driverId: '', amount: 0, odometer: 0, notes: '' });
  const [recepcionData, setRecepcionData] = useState({ tankId: '', amount: 0, costPerLiter: 22.50, supplier: '', invoiceNumber: '', notes: '' });
  const [newVehicle, setNewVehicle] = useState({ plate: '', description: '' });
  const [newDriver, setNewDriver] = useState({ name: '', license: '' });
  const [editMaxCapacity, setEditMaxCapacity] = useState(0);
  const [deleteObservation, setDeleteObservation] = useState('');
  const [logToDelete, setLogToDelete] = useState<DieselLog | null>(null);
  const selectedCargaTank = branchTanks.find(t => t.id === cargaData.tankId);
  const selectedRecepcionTank = branchTanks.find(t => t.id === recepcionData.tankId);
  const recepcionMax = selectedRecepcionTank ? selectedRecepcionTank.maxCapacity - selectedRecepcionTank.currentQty : undefined;
  const showStatus = (type: StatusType, title: string, description?: string, icon?: string) => {
    setStatusModal({ isOpen: true, type, title, description, icon });
  };

  useEffect(() => {
    loadAllData();
  }, [selectedBranchId]);

  useEffect(() => {
    const tanksChannel = subscriptions.subscribeTanks(() => loadTanks());
    const logsChannel = subscriptions.subscribeLogs(() => loadLogs());
    return () => {
      tanksChannel.unsubscribe();
      logsChannel.unsubscribe();
    };
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadTanks(), loadVehicles(), loadDrivers(), loadLogs()]);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError(err.message || 'Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTanks = async () => {
    const data = await dieselTanksService.getAll();
    setTanks(data.map(t => ({
      id: t.id,
      branchId: t.branch_id,
      name: t.name,
      currentQty: Number(t.current_qty),
      maxCapacity: Number(t.max_capacity)
    })));
  };

  const loadVehicles = async () => {
    // Solo cargar vehículos de esta sucursal
    const data = await vehiclesService.getAll(selectedBranchId);
    setVehicles(data.map(v => ({
      id: v.id,
      plate: v.plate,
      description: v.description,
      active: v.active
    })));
  };

  const loadDrivers = async () => {
    // Solo cargar operadores de esta sucursal
    const data = await driversService.getAll(selectedBranchId);
    setDrivers(data.map(d => ({
      id: d.id,
      name: d.name,
      license: d.license,
      active: d.active
    })));
  };

  const loadLogs = async () => {
    // Solo cargar logs de tanques que pertenecen a esta sucursal
    const data = await dieselLogsService.getAll(200);
    console.log("logs", data);
    setLogs(data.map(l => ({
      id: l.id,
      type: l.type,
      tankId: l.tank_id,
      amount: Number(l.amount),
      vehicleId: l.vehicle_id || undefined,
      driverId: l.driver_id || undefined,
      odometerReading: l.odometer_reading || undefined,
      supplier: l.supplier || undefined,
      invoiceNumber: l.invoice_number || undefined,
      costPerLiter: l.cost_per_liter ? Number(l.cost_per_liter) : undefined,
      totalCost: l.total_cost ? Number(l.total_cost) : undefined,
      userId: l.user_id,
      createdAt: new Date(l.created_at),
      notes: l.notes || undefined,
      status: typeof l.status === 'string' ? l.status : (l.status === false ? 'ELIMINADO' : 'ACTIVO'),
      deleteObservation: l.observacion || undefined
    })));
  };

  useEffect(() => {
    if (branchTanks.length > 0) {
      setCargaData(prev => ({ ...prev, tankId: branchTanks[0].id }));
      setRecepcionData(prev => ({ ...prev, tankId: branchTanks[0].id }));
    }
  }, [selectedBranchId, branchTanks]);

  const analytics = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const branchLogs = logs.filter(l => {
      const logTank = tanks.find(t => t.id === l.tankId);
      return logTank?.branchId === selectedBranchId;
    });
    console.log("branchLogs", branchLogs);
    const monthlySupplies = branchLogs
      .filter(l => l.type === 'RECEPCION' && l.createdAt >= startOfMonth && l.status === "ACTIVO")
      .reduce((acc, l) => acc + l.amount, 0);

    const monthlyDispatches = branchLogs
      .filter(l => l.type === 'CARGA' && l.createdAt >= startOfMonth && l.status === "ACTIVO")
      .reduce((acc, l) => acc + l.amount, 0);

    const totalCapacity = branchTanks.reduce((acc, t) => acc + t.maxCapacity, 0);
    const currentQty = branchTanks.reduce((acc, t) => acc + t.currentQty, 0);
    const globalStatus = totalCapacity > 0 ? (currentQty / totalCapacity) * 100 : 0;

    return { globalStatus, monthlySupplies, monthlyDispatches };
  }, [logs, branchTanks, tanks, selectedBranchId]);

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await vehiclesService.create({
        plate: newVehicle.plate.toUpperCase(),
        description: newVehicle.description,
        active: true,
        branch_id: selectedBranchId
      });
      await loadVehicles();
      setIsAssetModalOpen(null);
      setNewVehicle({ plate: '', description: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await driversService.create({
        name: newDriver.name,
        license: newDriver.license.toUpperCase(),
        active: true,
        branch_id: selectedBranchId
      });
      await loadDrivers();
      setIsAssetModalOpen(null);
      setNewDriver({ name: '', license: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMaxCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    const tank = branchTanks[0];
    if (!tank) return;
    setIsLoading(true);
    showStatus('loading', 'Actualizando capacidad', 'Procesando cambios...', '⏳');
    try {
      await dieselTanksService.update(tank.id, { max_capacity: editMaxCapacity });
      await loadTanks();
      setIsEditCapacityOpen(false);
      showStatus('success', 'Capacidad actualizada', 'Se guardó correctamente.', '✅');
    } catch (err: any) {
      setError(err.message);
      showStatus('error', 'Error al actualizar', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCarga = async (e: React.FormEvent) => {
    e.preventDefault();
    const tank = branchTanks.find(t => t.id === cargaData.tankId);
    if (!tank) return;
    if (cargaData.amount <= 0) {
      showStatus('warning', 'Cantidad inválida', 'La cantidad debe ser mayor a 0.', '⚠️');
      return;
    }
    if (cargaData.amount > tank.currentQty) {
      showStatus('warning', 'Diésel insuficiente', `Disponible: ${tank.currentQty} L.`, '⛽');
      return;
    }
    setIsLoading(true);
    showStatus('loading', 'Despachando diésel', 'Registrando salida...', '⏳');
    try {
      await dieselLogsService.processDispatch({
        tankId: cargaData.tankId,
        vehicleId: cargaData.vehicleId,
        driverId: cargaData.driverId,
        amount: cargaData.amount,
        odometer: cargaData.odometer,
        userId: currentUser.id,
        notes: cargaData.notes || undefined
      });
      await loadAllData();
      setIsCargaModalOpen(false);
      setCargaData(prev => ({ ...prev, amount: 0, odometer: 0, notes: '' }));
      showStatus('success', 'Despacho guardado', 'El registro se guardó correctamente.', '✅');
    } catch (err: any) {
      showStatus('error', 'Error al despachar', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecepcion = async (e: React.FormEvent) => {
    e.preventDefault();
    const tank = branchTanks.find(t => t.id === recepcionData.tankId);
    if (!tank) return;
    if (recepcionData.amount <= 0) {
      showStatus('warning', 'Cantidad inválida', 'La cantidad debe ser mayor a 0.', '⚠️');
      return;
    }
    const availableSpace = tank.maxCapacity - tank.currentQty;
    if (recepcionData.amount > availableSpace) {
      showStatus('warning', 'Sin espacio', `Espacio disponible: ${availableSpace} L.`, '🛢️');
      return;
    }
    setIsLoading(true);
    showStatus('loading', 'Recibiendo diésel', 'Registrando entrada...', '⏳');
    try {
      await dieselLogsService.processReception({
        tankId: recepcionData.tankId,
        amount: recepcionData.amount,
        supplier: recepcionData.supplier,
        costPerLiter: recepcionData.costPerLiter,
        invoiceNumber: recepcionData.invoiceNumber,
        userId: currentUser.id,
        notes: recepcionData.notes || undefined
      });
      await loadAllData();
      setIsRecepcionModalOpen(false);
      setRecepcionData(prev => ({ ...prev, amount: 0, supplier: '', invoiceNumber: '', notes: '' }));
      showStatus('success', 'Recepción registrada', 'El ingreso se guardó correctamente.', '✅');
    } catch (err: any) {
      showStatus('error', 'Error al recibir', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLog = (log: DieselLog) => {
    setLogToDelete(log);
    setDeleteObservation('');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logToDelete) return;

    setIsLoading(true);
    showStatus('loading', 'Eliminando registro', 'Guardando observación...', '⏳');
    try {
      await dieselLogsService.markDeleted({
        logId: logToDelete.id,
        observation: deleteObservation.trim(),
        userId: currentUser.id,
        type: logToDelete.type,
        monto: logToDelete.amount,
        tankId: logToDelete.tankId
      });
      setLogs(prev => prev.map(l => l.id === logToDelete.id ? {
        ...l,
        status: 'ELIMINADO',
        deleteObservation: deleteObservation.trim() || undefined
      } : l));
      setIsDeleteModalOpen(false);
      setLogToDelete(null);
      setDeleteObservation('');
      await loadAllData();
      showStatus('success', 'Registro eliminado', 'Se marcó como eliminado correctamente.', '✅');
    } catch (err: any) {
      showStatus('error', 'Error al eliminar', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetCalculations = async () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    setIsResetConfirmOpen(false);
    setIsLoading(true);
    showStatus('loading', 'Reiniciando logística', 'Actualizando niveles...', '⏳');

    try {
      // 1. Eliminar todos los logs
      const { error: logsError } = await supabase
        .from('diesel_logs')
        .delete()
        .not('id', 'is', null);

      if (logsError) throw logsError;

      // 2. Restablecer niveles de tanques (2500L por defecto)
      for (const tank of branchTanks) {
        await supabase
          .from('diesel_tanks')
          .update({ current_qty: 0 })
          .eq('id', tank.id);
      }

      await loadAllData();
      showStatus('success', 'Reinicio completo', 'Cálculos y tanques reiniciados.', '✅');
    } catch (err: any) {
      console.error('Error al reiniciar:', err);
      showStatus('error', 'Error al reiniciar', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans antialiased text-slate-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        .font-outfit { font-family: 'Outfit', sans-serif; }
        @keyframes diesel-wave { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-diesel-wave { animation: diesel-wave 4s linear infinite; }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* STATS GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8">
          <div className="bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-lg shadow-slate-100 border border-slate-100 animate-in zoom-in duration-500 delay-200">
            <p className="text-[8px] md:text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] mb-1">Estatus</p>
            <p className="text-2xl md:text-3xl lg:text-5xl font-black font-outfit">{analytics.globalStatus.toFixed(1)}%</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-lg shadow-slate-100 border border-slate-100 animate-in zoom-in duration-500 delay-300">
            <p className="text-[8px] md:text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] mb-1">Entradas</p>
            <p className="text-2xl md:text-3xl lg:text-5xl font-black font-outfit text-blue-600">+{analytics.monthlySupplies.toLocaleString()}</p>
          </div>
          <div className="col-span-2 md:col-span-1 bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-lg shadow-slate-100 border border-slate-100 animate-in zoom-in duration-500 delay-400">
            <p className="text-[8px] md:text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] mb-1">Despachos</p>
            <p className="text-2xl md:text-3xl lg:text-5xl font-black font-outfit text-orange-600">-{analytics.monthlyDispatches.toLocaleString()}L</p>
          </div>
        </div>

        {/* PRIMARY ACTIONS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          <button
            onClick={() => setIsRecepcionModalOpen(true)}
            className="group bg-blue-600 hover:bg-blue-700 text-white p-6 rounded-3xl flex items-center justify-center gap-4 shadow-xl shadow-blue-200 transition-all active:scale-95 duration-300"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🚚</span>
            <div className="text-left">
              <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">Recibir Diésel</span>
              <span className="text-sm font-black uppercase">Registrar Entrada</span>
            </div>
          </button>
          <button
            onClick={() => setIsCargaModalOpen(true)}
            className="group bg-slate-900 hover:bg-black text-white p-6 rounded-3xl flex items-center justify-center gap-4 shadow-xl shadow-slate-300 transition-all active:scale-95 duration-300"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">⛽</span>
            <div className="text-left">
              <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">Despachar Diésel</span>
              <span className="text-sm font-black uppercase">Nueva Carga</span>
            </div>
          </button>
        </div>

        {/* Navigation Tabs (Centered for Desktop) */}
        <div className="flex justify-center mb-8 sticky top-[10px] md:top-[20px] z-20">
          <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-[2.5rem] flex shadow-2xl border border-slate-100 w-full max-w-2xl mx-auto">
            {[
              { id: 'status', label: 'Niveles de Tanque' },
              { id: 'logs', label: 'Historial Completo' },
              { id: 'assets', label: 'Flota y Personal' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`flex-1 py-4 px-2 sm:px-6 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeView === tab.id
                  ? 'bg-slate-900 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-slate-50'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT AREA GRID */}
        <div className="pb-20">
          {activeView === 'status' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="col-span-full">
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (branchTanks[0]) {
                        setEditMaxCapacity(branchTanks[0].maxCapacity);
                        setIsEditCapacityOpen(true);
                      }
                    }}
                    className="bg-slate-900 text-[12px] font-black flex items-center gap-2 text-white px-4 py-2 rounded-lg shadow-lg shadow-slate-200 transition-all active:scale-95 duration-300"
                  >
                    EDITAR CAPACIDAD
                    <span className="grayscale-0">⛽</span>
                  </button>
                </div>
              </div>
              {branchTanks.map(tank => (
                <DieselTankCard
                  key={tank.id}
                  tank={tank}
                />
              ))}
              {branchTanks.length === 0 && (
                <div className="col-span-full bg-white p-12 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
                  <p className="text-slate-400 font-bold">No hay tanques registrados en esta ubicación.</p>
                </div>
              )}
            </div>
          )}

          {activeView === 'logs' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center px-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logs de Movimientos</h3>
                <button
                  onClick={handleResetCalculations}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-95"
                >
                  {isLoading ? 'Reiniciando...' : 'Reiniciar Cálculos'}
                </button>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em]">
                      <tr>
                        <th className="p-6">Fecha</th>
                        <th className="p-6">Tipo</th>
                        <th className="p-6">Detalle / Proveedor</th>
                        <th className="p-6 text-right">Cantidad</th>
                        <th className="p-6 text-right">Precio</th>
                        <th className="p-6">Observación</th>
                        <th className="p-6">Estado</th>
                        <th className="p-6 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.filter(l => branchTanks.some(t => t.id === l.tankId)).map(log => {
                        const isDeleted = log.status === 'ELIMINADO';
                        return (
                          <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${isDeleted ? 'opacity-60' : ''}`}>
                            <td className="p-6 text-xs text-slate-500 font-bold">{log.createdAt.toLocaleDateString()}</td>
                            <td className="p-6">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${log.type === 'CARGA' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                {log.type === 'CARGA' ? 'Salida' : 'Entrada'}
                              </span>
                            </td>
                            <td className="p-6">
                              <p className="text-sm font-black text-slate-800 uppercase">
                                {log.type === 'CARGA' ? vehicles.find(v => v.id === log.vehicleId)?.description : log.supplier}
                              </p>
                            </td>
                            <td className="p-6 text-right font-black text-sm">{log.amount.toLocaleString()} L</td>
                            <td className="p-6 text-right font-black text-sm">{log.costPerLiter ? `$ ${log.costPerLiter?.toLocaleString()}` : '———'}</td>
                            <td className="text-sm font-black text-slate-800 uppercase">
                              {isDeleted ? (log.deleteObservation || '—') : (log.notes || '———')}
                            </td>
                            <td className="p-6 text-right font-black text-sm">{log.status || 'ACTIVO'}</td>
                            <td className="p-6 text-right">
                              <button
                                onClick={() => handleDeleteLog(log)}
                                disabled={isLoading || isDeleted}
                                className="px-3 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-95"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeView === 'assets' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-end px-4">
                <button
                  onClick={handleResetCalculations}
                  disabled={isLoading}
                  className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-red-600 transition-all active:scale-95"
                >
                  {isLoading ? 'Reiniciando...' : 'Reiniciar Historial de Logística'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Flota Activa</h3>
                  <div className="space-y-3">
                    {vehicles.map(v => (
                      <div key={v.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl">🚛</div>
                          <div>
                            <p className="text-sm font-black">{v.description}</p>
                            <p className="text-[10px] font-mono text-orange-600 font-bold tracking-wider">{v.plate}</p>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black ${v.active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-300'}`}>
                          {v.active ? 'ACTIVO' : 'INACTIVO'}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setIsAssetModalOpen('vehicle')} className="w-full py-4 bg-slate-100 text-slate-500 rounded-3xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-200 hover:bg-slate-200 transition-colors">+ Añadir Unidad</button>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Operadores Registrados</h3>
                  <div className="space-y-3">
                    {drivers.map(d => (
                      <div key={d.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl">👷</div>
                          <div>
                            <p className="text-sm font-black">{d.name}</p>
                            <p className="text-[10px] font-mono text-blue-600 tracking-wider font-bold">{d.license}</p>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black ${d.active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-300'}`}>
                          {d.active ? 'OPERANDO' : 'INACTIVO'}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setIsAssetModalOpen('driver')} className="w-full py-4 bg-slate-100 text-slate-500 rounded-3xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-200 hover:bg-slate-200 transition-colors">+ Añadir Operador</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {isCargaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in my-auto">
            <div className="bg-orange-500 p-8 text-white flex justify-between items-center shadow-lg shadow-orange-500/20">
              <h3 className="text-xl font-black uppercase tracking-tighter">Despachar Diésel</h3>
              <button onClick={() => setIsCargaModalOpen(false)} className="bg-white/10 w-10 h-10 rounded-xl text-xl font-black">×</button>
            </div>
            <form onSubmit={handleCarga} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanque</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.tankId} onChange={e => setCargaData({ ...cargaData, tankId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {branchTanks.map(tank => <option key={tank.id} value={tank.id}>{tank.name} ({tank.currentQty} L)</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidad</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.vehicleId} onChange={e => setCargaData({ ...cargaData, vehicleId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {vehicles.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.description} - {v.plate}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Litros</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={selectedCargaTank?.currentQty || undefined}
                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-black text-center text-lg"
                    value={cargaData.amount || ''}
                    onChange={e => setCargaData({ ...cargaData, amount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Km</label>
                  <input type="number" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-black text-center text-lg text-orange-600" value={cargaData.odometer || ''} onChange={e => setCargaData({ ...cargaData, odometer: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operador</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.driverId} onChange={e => setCargaData({ ...cargaData, driverId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={isLoading} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-orange-600 transition-colors">
                {isLoading ? 'Procesando...' : 'Validar y Cargar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isRecepcionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in my-auto">
            <div className="bg-blue-600 p-8 text-white flex justify-between items-center shadow-lg shadow-blue-600/20">
              <h3 className="text-xl font-black uppercase tracking-tighter">Recibir Combustible</h3>
              <button onClick={() => setIsRecepcionModalOpen(false)} className="bg-white/10 w-10 h-10 rounded-xl text-xl font-black">×</button>
            </div>
            <form onSubmit={handleRecepcion} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanque de Destino</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={recepcionData.tankId} onChange={e => setRecepcionData({ ...recepcionData, tankId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {branchTanks.map(tank => <option key={tank.id} value={tank.id}>{tank.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Proveedor</label>
                <input type="text" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold text-sm" value={recepcionData.supplier} onChange={e => setRecepcionData({ ...recepcionData, supplier: e.target.value })} placeholder="Nombre del proveedor" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Litros</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={recepcionMax}
                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-black text-center text-lg"
                    value={recepcionData.amount || ''}
                    onChange={e => setRecepcionData({ ...recepcionData, amount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">$/Litro</label>
                  <input type="number" step="0.01" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-black text-center text-lg text-blue-600" value={recepcionData.costPerLiter || ''} onChange={e => setRecepcionData({ ...recepcionData, costPerLiter: Number(e.target.value) })} />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-colors">
                {isLoading ? 'Procesando...' : 'Registrar Recepción'}
              </button>
            </form>
          </div>
        </div>
      )}

      <DeleteLogModal
        isOpen={isDeleteModalOpen && Boolean(logToDelete)}
        isLoading={isLoading}
        observation={deleteObservation}
        onObservationChange={setDeleteObservation}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setLogToDelete(null);
          setDeleteObservation('');
        }}
        onConfirm={handleConfirmDelete}
      />

      <EditCapacityModal
        isOpen={isEditCapacityOpen}
        isLoading={isLoading}
        value={editMaxCapacity}
        onChange={setEditMaxCapacity}
        onCancel={() => setIsEditCapacityOpen(false)}
        onSubmit={handleUpdateMaxCapacity}
      />

      <StatusModal
        isOpen={statusModal.isOpen}
        type={statusModal.type}
        title={statusModal.title}
        description={statusModal.description}
        icon={statusModal.icon}
        onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="¿Reiniciar cálculos?"
        description={'Esto eliminará todo el historial de movimientos y reiniciará los niveles de tanque.\nLA FLOTA Y PERSONAL PERMANECERÁN INTACTOS.\n\n¿Continuar?'}
        icon="⚠️"
        confirmText="Aceptar"
        cancelText="Cancelar"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />

      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase tracking-tighter">Nuevo {isAssetModalOpen === 'vehicle' ? 'Vehículo' : 'Operador'}</h3>
              <button onClick={() => setIsAssetModalOpen(null)} className="text-2xl font-black">&times;</button>
            </div>
            {isAssetModalOpen === 'vehicle' ? (
              <form onSubmit={handleAddVehicle} className="p-8 space-y-4">
                <input required placeholder="PLACA (EX. KW-22-MX)" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs uppercase appearance-none border-2 border-transparent focus:border-orange-500 outline-none" value={newVehicle.plate} onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value })} />
                <input required placeholder="DESCRIPCIÓN" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newVehicle.description} onChange={e => setNewVehicle({ ...newVehicle, description: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-orange-500 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg">AGREGAR UNIDAD</button>
              </form>
            ) : (
              <form onSubmit={handleAddDriver} className="p-8 space-y-4">
                <input required placeholder="NOMBRE COMPLETO" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} />
                <input required placeholder="LICENCIA / ID" className="w-full p-4 bg-slate-50 rounded-xl font-mono text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newDriver.license} onChange={e => setNewDriver({ ...newDriver, license: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg">AGREGAR OPERADOR</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DieselScreen;
