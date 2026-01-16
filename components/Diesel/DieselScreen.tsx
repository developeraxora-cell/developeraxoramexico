import React, { useState, useMemo, useEffect } from 'react';
import { DieselTank, Vehicle, Driver, DieselLog, User } from '../../types';
import {
  dieselTanksService,
  vehiclesService,
  driversService,
  dieselLogsService,
  analyticsService,
  subscriptions,
  supabase,
  type DieselTankDB,
  type VehicleDB,
  type DriverDB,
  type DieselLogDB
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

const DieselTankContainer: React.FC<{ tank: DieselTank }> = ({ tank }) => {
  const percent = (tank.currentQty / tank.maxCapacity) * 100;
  const isCritical = percent < 15;

  return (
    <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all duration-700 border-b-8 border-b-slate-900">
      <div className="flex justify-between items-start mb-8">
        <div>
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-1 block">Depósito Estacionario</span>
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{tank.name}</h3>
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${isCritical ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
          {isCritical ? '⚠️' : '⛽'}
        </div>
      </div>

      <div className="relative mx-auto w-48 h-64 bg-slate-100 rounded-[2.5rem] border-8 border-slate-900 overflow-hidden shadow-[inset_0_10px_30px_rgba(0,0,0,0.1)] group-hover:scale-105 transition-transform duration-500">
        <div className="absolute right-3 inset-y-8 flex flex-col justify-between z-20 opacity-30">
          {[100, 75, 50, 25, 0].map(val => (
            <div key={val} className="flex items-center gap-2">
              <span className="text-[7px] font-black text-slate-600">{val}%</span>
              <div className="w-2 h-0.5 bg-slate-900"></div>
            </div>
          ))}
        </div>

        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-in-out bg-gradient-to-t ${isCritical ? 'from-red-600 to-red-400' : 'from-orange-600 to-amber-400'
            }`}
          style={{ height: `${percent}%` }}
        >
          <div className="absolute -top-5 left-0 w-[200%] h-10 opacity-30">
            <svg viewBox="0 0 120 28" className="w-full h-full animate-diesel-wave fill-current text-white">
              <path d="M0 15 Q30 0 60 15 T120 15 V28 H0 Z" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-700 shadow-2xl">
            <p className={`text-2xl font-mono font-black ${isCritical ? 'text-red-400' : 'text-orange-400'}`}>
              {percent.toFixed(1)}%
            </p>
          </div>
          <p className="text-[8px] font-black text-white/50 uppercase tracking-[0.3em] mt-2 shadow-sm">Sensor Activo</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Volumen Actual</p>
          <p className="text-xl font-black text-slate-900">{tank.currentQty.toLocaleString()} <span className="text-xs text-slate-400">L</span></p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CAPACIDAD</p>
          <p className="text-xl font-black text-slate-900">{tank.maxCapacity.toLocaleString()} <span className="text-xs text-slate-400">L</span></p>
        </div>
      </div>
    </div>
  );
};

const DieselScreen: React.FC<DieselScreenProps> = ({
  tanks, setTanks, vehicles, setVehicles, drivers, setDrivers, logs, setLogs, currentUser, selectedBranchId
}) => {
  const [activeView, setActiveView] = useState<'status' | 'logs' | 'assets'>('status');
  const [isCargaModalOpen, setIsCargaModalOpen] = useState(false);
  const [isRecepcionModalOpen, setIsRecepcionModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState<'vehicle' | 'driver' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchTanks = useMemo(() => tanks.filter(t => t.branchId === selectedBranchId), [tanks, selectedBranchId]);

  // Form states
  const [cargaData, setCargaData] = useState({ tankId: '', vehicleId: '', driverId: '', amount: 0, odometer: 0, notes: '' });
  const [recepcionData, setRecepcionData] = useState({ tankId: '', amount: 0, costPerLiter: 22.50, supplier: '', invoiceNumber: '', notes: '' });
  const [newVehicle, setNewVehicle] = useState({ plate: '', description: '' });
  const [newDriver, setNewDriver] = useState({ name: '', license: '' });

  // ============================================================================
  // CARGA INICIAL DE DATOS
  // ============================================================================
  useEffect(() => {
    loadAllData();

    // Suscribirse a cambios en tiempo real
    const tanksChannel = subscriptions.subscribeTanks(() => {
      loadTanks();
    });

    const logsChannel = subscriptions.subscribeLogs(() => {
      loadLogs();
    });

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
    const mappedTanks: DieselTank[] = data.map(t => ({
      id: t.id,
      branchId: t.branch_id,
      name: t.name,
      currentQty: Number(t.current_qty),
      maxCapacity: Number(t.max_capacity)
    }));
    setTanks(mappedTanks);
  };

  const loadVehicles = async () => {
    const data = await vehiclesService.getAll();
    const mappedVehicles: Vehicle[] = data.map(v => ({
      id: v.id,
      plate: v.plate,
      description: v.description,
      active: v.active
    }));
    setVehicles(mappedVehicles);
  };

  const loadDrivers = async () => {
    const data = await driversService.getAll();
    const mappedDrivers: Driver[] = data.map(d => ({
      id: d.id,
      name: d.name,
      license: d.license,
      active: d.active
    }));
    setDrivers(mappedDrivers);
  };

  const loadLogs = async () => {
    const data = await dieselLogsService.getAll(100);
    const mappedLogs: DieselLog[] = data.map(l => ({
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
      notes: l.notes || undefined
    }));
    setLogs(mappedLogs);
  };

  useEffect(() => {
    if (branchTanks.length > 0) {
      setCargaData(prev => ({ ...prev, tankId: branchTanks[0].id }));
      setRecepcionData(prev => ({ ...prev, tankId: branchTanks[0].id }));
    }
  }, [selectedBranchId, branchTanks]);

  const analytics = useMemo(() => {
    const loads = logs.filter(l => l.type === 'CARGA');
    const vehicleConsumption = vehicles.map(v => {
      const total = loads.filter(l => l.vehicleId === v.id).reduce((acc, l) => acc + l.amount, 0);
      return { ...v, total };
    }).sort((a, b) => b.total - a.total).slice(0, 5);

    const currentBranchStock = branchTanks.reduce((acc, t) => acc + t.currentQty, 0);
    const avgDaily = loads.length > 0 ? loads.reduce((acc, l) => acc + l.amount, 0) / 30 : 0;

    return { vehicleConsumption, daysOfAutonomy: avgDaily > 0 ? Math.floor(currentBranchStock / avgDaily) : 'N/A' };
  }, [logs, branchTanks, vehicles]);

  // ============================================================================
  // GESTIÓN DE VEHÍCULOS
  // ============================================================================
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await vehiclesService.create({
        plate: newVehicle.plate.toUpperCase(),
        description: newVehicle.description,
        active: true
      });
      await loadVehicles();
      setIsAssetModalOpen(null);
      setNewVehicle({ plate: '', description: '' });
    } catch (err: any) {
      console.error('Error creando vehículo:', err);
      setError(err.message || 'Error al crear vehículo');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVehicle = async (id: string) => {
    setIsLoading(true);
    try {
      await vehiclesService.toggleActive(id);
      await loadVehicles();
    } catch (err: any) {
      console.error('Error actualizando vehículo:', err);
      setError(err.message || 'Error al actualizar vehículo');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // GESTIÓN DE CONDUCTORES
  // ============================================================================
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await driversService.create({
        name: newDriver.name,
        license: newDriver.license.toUpperCase(),
        active: true
      });
      await loadDrivers();
      setIsAssetModalOpen(null);
      setNewDriver({ name: '', license: '' });
    } catch (err: any) {
      console.error('Error creando conductor:', err);
      setError(err.message || 'Error al crear conductor');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDriver = async (id: string) => {
    setIsLoading(true);
    try {
      await driversService.toggleActive(id);
      await loadDrivers();
    } catch (err: any) {
      console.error('Error actualizando conductor:', err);
      setError(err.message || 'Error al actualizar conductor');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // LIMPIAR DATOS DE PRUEBA
  // ============================================================================
  const handleResetTestData = async () => {
    const confirmReset = window.confirm(
      '⚠️ ¿Estás seguro de limpiar TODOS los datos de prueba?\n\n' +
      'Esto eliminará:\n' +
      '• Todos los vehículos de prueba\n' +
      '• Todos los conductores de prueba\n' +
      '• Todo el historial de movimientos\n\n' +
      'Los tanques NO se eliminarán, solo se restablecerán a su capacidad inicial.\n\n' +
      '¿Continuar?'
    );

    if (!confirmReset) return;

    setIsLoading(true);
    setError(null);

    try {
      // Eliminar todos los logs
      const { error: logsError } = await supabase
        .from('diesel_logs')
        .delete()
        .not('id', 'is', null);

      if (logsError) throw logsError;

      // Eliminar todos los vehículos
      const { error: vehiclesError } = await supabase
        .from('vehicles')
        .delete()
        .not('id', 'is', null);

      if (vehiclesError) throw vehiclesError;

      // Eliminar todos los conductores
      const { error: driversError } = await supabase
        .from('drivers')
        .delete()
        .not('id', 'is', null);

      if (driversError) throw driversError;

      // Restablecer tanques a valores iniciales
      await supabase
        .from('diesel_tanks')
        .update({ current_qty: 1500 })
        .eq('name', 'TANQUE DEGOLLADO');

      // Recargar todos los datos
      await loadAllData();

      alert('✅ Datos limpiados exitosamente.\n\nAhora puedes hacer pruebas desde cero.');
    } catch (err: any) {
      console.error('Error limpiando datos:', err);
      alert(`❌ Error al limpiar datos: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // DESPACHO DE DIESEL
  // ============================================================================
  const handleCarga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cargaData.tankId) {
      alert("❌ Error: Debes seleccionar un tanque.");
      setIsLoading(false);
      return;
    }

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

      // Recargar datos
      await Promise.all([loadTanks(), loadLogs()]);

      setIsCargaModalOpen(false);
      // Mantener el tankId para el siguiente registro
      setCargaData(prev => ({ ...prev, amount: 0, odometer: 0, notes: '' }));
      alert("✅ Despacho exitoso.");
    } catch (err: any) {
      console.error('Error en despacho:', err);
      // Extraer mensaje de error de Postgres si existe
      const errorMsg = err.details || err.message || 'Error desconocido';
      alert(`❌ Error del Servidor: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // RECEPCIÓN DE DIESEL
  // ============================================================================
  const handleRecepcion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recepcionData.tankId) {
      alert("❌ Error: Debes seleccionar un tanque de destino.");
      return;
    }

    setIsLoading(true);
    setError(null);
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

      // Recargar datos
      await Promise.all([loadTanks(), loadLogs()]);

      setIsRecepcionModalOpen(false);
      // Mantener el tankId para el siguiente registro pero limpiar lo demás
      setRecepcionData(prev => ({ ...prev, amount: 0, supplier: '', invoiceNumber: '', notes: '' }));
      alert("✅ Recepción registrada exitosamente.");
    } catch (err: any) {
      console.error('Error en recepción:', err);
      // Extraer mensaje de error de Postgres si existe
      const errorMsg = err.details || err.message || 'Error desconocido';
      alert(`❌ Error del Servidor: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes diesel-wave { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-diesel-wave { animation: diesel-wave 4s linear infinite; }
      `}</style>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <p className="text-red-700 text-sm font-bold">⚠️ {error}</p>
        </div>
      )}

      {/* Analytics Header */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Días de Autonomía</p>
          <p className="text-3xl font-black text-slate-900">{analytics.daysOfAutonomy}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unidades Activas</p>
          <p className="text-3xl font-black text-slate-900">{vehicles.filter(v => v.active).length}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Operadores en Turno</p>
          <p className="text-3xl font-black text-slate-900">{drivers.filter(d => d.active).length}</p>
        </div>
        <div className="bg-slate-900 p-5 rounded-3xl shadow-xl flex items-center justify-center">
          <button onClick={() => setIsCargaModalOpen(true)} className="w-full h-full text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2" disabled={isLoading}>
            <span>⛽</span> Nuevo Despacho
          </button>
        </div>
        <div className="bg-blue-600 p-5 rounded-3xl shadow-xl flex items-center justify-center">
          <button onClick={() => setIsRecepcionModalOpen(true)} className="w-full h-full text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2" disabled={isLoading}>
            <span>🚚</span> Recibir Combustible
          </button>
        </div>
        <div className="bg-red-600 p-5 rounded-3xl shadow-xl flex items-center justify-center">
          <button
            onClick={handleResetTestData}
            className="w-full h-full text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
            disabled={isLoading}
            title="Limpia vehículos, conductores y logs de prueba"
          >
            <span>🗑️</span> Limpiar Datos
          </button>
        </div>
      </div>

      {/* View Switcher Sticky */}
      <div className="sticky top-[-1px] z-20 flex bg-white/95 backdrop-blur-md p-2 rounded-2xl border border-slate-200 gap-2 shadow-md">
        {(['status', 'logs', 'assets'] as const).map(v => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`flex-1 py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeView === v ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            {v === 'status' ? 'Niveles' : v === 'logs' ? 'Historial' : 'Flota'}
          </button>
        ))}
      </div>

      {activeView === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
          {branchTanks.map(tank => <DieselTankContainer key={tank.id} tank={tank} />)}
          <div className="bg-slate-900 rounded-[3rem] p-8 text-white flex flex-col">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400 mb-6">Unidades de Alto Consumo</h3>
            <div className="space-y-6">
              {analytics.vehicleConsumption.map(v => (
                <div key={v.id}>
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                    <span>{v.description}</span>
                    <span className="text-orange-400">{v.total} L</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${(v.total / (analytics.vehicleConsumption[0].total || 1)) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeView === 'assets' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
          {/* VEHICLES SECTION */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Unidades de Transporte</h3>
              <button onClick={() => setIsAssetModalOpen('vehicle')} className="bg-slate-900 text-white p-2 rounded-lg text-xs" disabled={isLoading}>+</button>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Unidad</th>
                    <th className="p-4">Placa</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4 font-bold text-slate-800 text-xs">{v.description}</td>
                      <td className="p-4 font-mono text-xs text-orange-600 font-black">{v.plate}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleVehicle(v.id)}
                          disabled={isLoading}
                          className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${v.active ? 'bg-green-100 text-green-600 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-slate-100 text-slate-400'}`}
                        >
                          {v.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DRIVERS SECTION */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Cuerpo de Operadores</h3>
              <button onClick={() => setIsAssetModalOpen('driver')} className="bg-slate-900 text-white p-2 rounded-lg text-xs" disabled={isLoading}>+</button>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Licencia</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drivers.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-800 text-xs">{d.name}</td>
                      <td className="p-4 font-mono text-xs text-blue-600">{d.license}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleDriver(d.id)}
                          disabled={isLoading}
                          className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${d.active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
                        >
                          {d.active ? 'Disponible' : 'Baja'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeView === 'logs' && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-5">Fecha</th>
                <th className="p-5">Tipo</th>
                <th className="p-5">Unidad / Suministro</th>
                <th className="p-5 text-right">Litros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="p-5 text-[10px] text-slate-500 font-bold">{log.createdAt.toLocaleString()}</td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 w-fit ${log.type === 'CARGA' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                      {log.type === 'CARGA' ? (
                        <><span>⬇️</span> SALIDA</>
                      ) : (
                        <><span>⬆️</span> ENTRADA</>
                      )}
                    </span>
                  </td>
                  <td className="p-5">
                    <p className="text-xs font-black text-slate-800 uppercase">
                      {log.type === 'CARGA' ? vehicles.find(v => v.id === log.vehicleId)?.description : log.supplier}
                    </p>
                    {log.type === 'CARGA' && <p className="text-[9px] font-mono text-slate-400">KM: {log.odometerReading}</p>}
                    {log.type === 'RECEPCION' && <p className="text-[9px] font-mono text-slate-400">Factura: {log.invoiceNumber}</p>}
                  </td>
                  <td className="p-5 text-right font-black text-slate-900">{log.amount.toLocaleString()} L</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DESPACHO */}
      {isCargaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in my-auto">
            <div className="bg-orange-500 p-8 text-white flex justify-between items-center shadow-lg shadow-orange-500/20">
              <h3 className="text-xl font-black uppercase tracking-tighter">Despachar Diésel</h3>
              <button onClick={() => setIsCargaModalOpen(false)} className="bg-white/10 w-10 h-10 rounded-xl text-xl font-black">×</button>
            </div>
            <form onSubmit={handleCarga} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanque de Origen</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.tankId} onChange={e => setCargaData({ ...cargaData, tankId: e.target.value })}>
                  <option value="">Seleccionar Tanque...</option>
                  {branchTanks.map(tank => <option key={tank.id} value={tank.id}>{tank.name} ({tank.currentQty} L)</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidad de Transporte (Activa)</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.vehicleId} onChange={e => setCargaData({ ...cargaData, vehicleId: e.target.value })}>
                  <option value="">Seleccionar Unidad...</option>
                  {vehicles.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.description} - {v.plate}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Litros</label>
                  <input type="number" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-black text-center text-lg" value={cargaData.amount || ''} onChange={e => setCargaData({ ...cargaData, amount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Km Actual</label>
                  <input type="number" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-black text-center text-lg text-orange-600" value={cargaData.odometer || ''} onChange={e => setCargaData({ ...cargaData, odometer: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operador</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={cargaData.driverId} onChange={e => setCargaData({ ...cargaData, driverId: e.target.value })}>
                  <option value="">Seleccionar Operador...</option>
                  {drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={isLoading} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-orange-600 transition-colors disabled:opacity-50">
                {isLoading ? 'Procesando...' : 'Validar y Cargar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RECEPCIÓN */}
      {isRecepcionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in my-auto">
            <div className="bg-blue-600 p-8 text-white flex justify-between items-center shadow-lg shadow-blue-600/20">
              <h3 className="text-xl font-black uppercase tracking-tighter">Recibir Combustible</h3>
              <button onClick={() => setIsRecepcionModalOpen(false)} className="bg-white/10 w-10 h-10 rounded-xl text-xl font-black">×</button>
            </div>
            <form onSubmit={handleRecepcion} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanque de Destino</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-black text-xs uppercase appearance-none" value={recepcionData.tankId} onChange={e => setRecepcionData({ ...recepcionData, tankId: e.target.value })}>
                  <option value="">Seleccionar Tanque...</option>
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
                  <input type="number" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-black text-center text-lg" value={recepcionData.amount || ''} onChange={e => setRecepcionData({ ...recepcionData, amount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">$/Litro</label>
                  <input type="number" step="0.01" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-black text-center text-lg text-blue-600" value={recepcionData.costPerLiter || ''} onChange={e => setRecepcionData({ ...recepcionData, costPerLiter: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Factura</label>
                <input type="text" required className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-mono text-sm text-center" value={recepcionData.invoiceNumber} onChange={e => setRecepcionData({ ...recepcionData, invoiceNumber: e.target.value })} placeholder="FC-0000" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notas (Opcional)</label>
                <textarea className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl text-sm resize-none" rows={2} value={recepcionData.notes} onChange={e => setRecepcionData({ ...recepcionData, notes: e.target.value })} placeholder="Observaciones adicionales..." />
              </div>
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total a Pagar</p>
                <p className="text-2xl font-black text-blue-600">${(recepcionData.amount * recepcionData.costPerLiter).toFixed(2)} MXN</p>
              </div>
              <button type="submit" disabled={isLoading} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-colors disabled:opacity-50">
                {isLoading ? 'Procesando...' : 'Registrar Recepción'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ADD ASSET (VEHICLE / DRIVER) */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in my-auto">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase tracking-tighter">Nuevo {isAssetModalOpen === 'vehicle' ? 'Vehículo' : 'Operador'}</h3>
              <button onClick={() => setIsAssetModalOpen(null)} className="text-2xl">&times;</button>
            </div>
            {isAssetModalOpen === 'vehicle' ? (
              <form onSubmit={handleAddVehicle} className="p-8 space-y-4">
                <input required placeholder="Placas (Ej. MX-8899)" className="w-full p-4 bg-slate-50 rounded-xl font-black text-sm uppercase tracking-widest outline-none border-2 border-transparent focus:border-orange-500" value={newVehicle.plate} onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value })} />
                <input required placeholder="Descripción (Ej. Torton Kenworth #5)" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-orange-500" value={newVehicle.description} onChange={e => setNewVehicle({ ...newVehicle, description: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-orange-500 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg disabled:opacity-50">
                  {isLoading ? 'Registrando...' : 'Registrar Unidad'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddDriver} className="p-8 space-y-4">
                <input required placeholder="Nombre Completo" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-orange-500" value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} />
                <input required placeholder="Licencia / Identificador" className="w-full p-4 bg-slate-50 rounded-xl font-mono text-sm outline-none border-2 border-transparent focus:border-orange-500" value={newDriver.license} onChange={e => setNewDriver({ ...newDriver, license: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg disabled:opacity-50">
                  {isLoading ? 'Registrando...' : 'Registrar Operador'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DieselScreen;
