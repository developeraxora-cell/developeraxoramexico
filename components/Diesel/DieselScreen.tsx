import React, { useState, useMemo, useEffect } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import { Pencil, Trash2 } from 'lucide-react';
import { Branch, DieselTank, Vehicle, Driver, DieselLog, User } from '../../types';
import DieselTankCard from './DieselTankCard';
import DeleteLogModal from './DeleteLogModal';
import EditCapacityModal from './EditCapacityModal';
import StatusModal, { StatusType } from '../common/StatusModal';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency, formatNumber } from '../../services/currency';
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
  branches: Branch[];
}

let watermarkPngBytesPromise: Promise<ArrayBuffer | null> | null = null;

const getWatermarkPngBytes = async () => {
  if (!watermarkPngBytesPromise) {
    watermarkPngBytesPromise = fetch('/lopar-watermark.png')
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
  }
  return watermarkPngBytesPromise;
};

const DieselScreen: React.FC<DieselScreenProps> = ({
  tanks, setTanks, vehicles, setVehicles, drivers, setDrivers, logs, setLogs, currentUser, selectedBranchId, branches
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
  const [logsDateFrom, setLogsDateFrom] = useState('');
  const [logsDateTo, setLogsDateTo] = useState('');
  const [isExportingLogs, setIsExportingLogs] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find(b => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );
  const branchIdsForQuery = useMemo(() => {
    const ids = new Set<string>();
    if (selectedBranchId) {
      ids.add(selectedBranchId);
      ids.add(selectedBranchId.toLowerCase());
      ids.add(selectedBranchId.toUpperCase());
    }
    if (selectedBranch?.code) {
      ids.add(selectedBranch.code);
      ids.add(selectedBranch.code.toLowerCase());
      ids.add(selectedBranch.code.toUpperCase());
    }
    if (selectedBranch?.dbId !== undefined) {
      ids.add(String(selectedBranch.dbId));
    }
    return Array.from(ids);
  }, [selectedBranch, selectedBranchId]);

  const normalizeBranchId = (rawId: string) => {
    const raw = String(rawId ?? '');
    const match = branches.find(b =>
      String(b.dbId ?? '') === raw || (b.code && b.code.toLowerCase() === raw.toLowerCase())
    );
    return match?.code || rawId;
  };

  const branchTanks = useMemo(
    () => tanks.filter(t => branchIdsForQuery.includes(String(t.branchId))),
    [tanks, branchIdsForQuery]
  );

  const branchLogs = useMemo(
    () => logs.filter((log) => branchTanks.some((tank) => tank.id === log.tankId)),
    [logs, branchTanks]
  );

  const visibleBranchLogs = useMemo(() => {
    const fromDate = logsDateFrom ? new Date(`${logsDateFrom}T00:00:00`) : null;
    const toDate = logsDateTo ? new Date(`${logsDateTo}T23:59:59.999`) : null;

    return branchLogs.filter((log) => {
      const createdAt = log.createdAt;
      if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return false;
      if (fromDate && createdAt < fromDate) return false;
      if (toDate && createdAt > toDate) return false;
      return true;
    });
  }, [branchLogs, logsDateFrom, logsDateTo]);

  const [cargaData, setCargaData] = useState({ tankId: '', vehicleId: '', driverId: '', amount: 0, odometer: 0, notes: '' });
  const [recepcionData, setRecepcionData] = useState({ tankId: '', amount: 0, costPerLiter: 22.50, supplier: '', invoiceNumber: '', notes: '' });
  const [newVehicle, setNewVehicle] = useState({ plate: '', description: '' });
  const [newDriver, setNewDriver] = useState({ name: '', license: '' });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [isVehicleDeleteConfirmOpen, setIsVehicleDeleteConfirmOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
  const [isDriverDeleteConfirmOpen, setIsDriverDeleteConfirmOpen] = useState(false);
  const [editMaxCapacity, setEditMaxCapacity] = useState(0);
  const [deleteObservation, setDeleteObservation] = useState('');
  const [logToDelete, setLogToDelete] = useState<DieselLog | null>(null);
  const selectedCargaTank = branchTanks.find(t => t.id === cargaData.tankId);
  const selectedRecepcionTank = branchTanks.find(t => t.id === recepcionData.tankId);
  const recepcionMax = selectedRecepcionTank ? selectedRecepcionTank.maxCapacity - selectedRecepcionTank.currentQty : undefined;
  const activeVehicles = useMemo(() => vehicles.filter(v => v.active), [vehicles]);
  const activeDrivers = useMemo(() => drivers.filter(d => d.active), [drivers]);
  const showStatus = (type: StatusType, title: string, description?: string, icon?: string) => {
    setStatusModal({ isOpen: true, type, title, description, icon });
  };

  const toInputDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDieselDate = (date: Date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatDieselDateTime = (date: Date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${formatDieselDate(date)}, ${hh}:${mi}:${ss}`;
  };

  const formatFilterDate = (value: string) => {
    if (!value) return '';
    const [yyyy, mm, dd] = value.split('-');
    if (!yyyy || !mm || !dd) return value;
    return `${dd}/${mm}/${yyyy}`;
  };

  useEffect(() => {
    loadAllData();
  }, [selectedBranchId, branches]);

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
      branchId: normalizeBranchId(t.branch_id),
      name: t.name,
      currentQty: Number(t.current_qty),
      maxCapacity: Number(t.max_capacity)
    })));
  };

  const loadVehicles = async () => {
    // Solo cargar vehículos de esta sucursal
    const data = await vehiclesService.getAll(branchIdsForQuery);
    setVehicles(data.map(v => ({
      id: v.id,
      plate: v.plate,
      description: v.description,
      active: v.active
    })));
  };

  const loadDrivers = async () => {
    // Solo cargar operadores de esta sucursal
    const data = await driversService.getAll(branchIdsForQuery);
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
  }, [branchLogs, branchTanks]);

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (editingVehicleId) {
        await vehiclesService.update(editingVehicleId, {
          plate: newVehicle.plate.toUpperCase(),
          description: newVehicle.description,
        });
      } else {
        await vehiclesService.create({
          plate: newVehicle.plate.toUpperCase(),
          description: newVehicle.description,
          active: true,
          branch_id: selectedBranchId
        });
      }
      await loadVehicles();
      setIsAssetModalOpen(null);
      setNewVehicle({ plate: '', description: '' });
      setEditingVehicleId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateVehicle = () => {
    setEditingVehicleId(null);
    setNewVehicle({ plate: '', description: '' });
    setIsAssetModalOpen('vehicle');
  };

  const handleOpenEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setNewVehicle({ plate: vehicle.plate, description: vehicle.description });
    setIsAssetModalOpen('vehicle');
  };

  const handleAskDeleteVehicle = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setIsVehicleDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    setIsLoading(true);
    showStatus('loading', 'Eliminando unidad', 'Procesando cambios...', '⏳');
    try {
      try {
        await vehiclesService.delete(vehicleToDelete.id);
        showStatus('success', 'Unidad eliminada', 'Se eliminó correctamente del catálogo.', '✅');
      } catch (err: any) {
        const message = String(err?.message || '');
        if (err?.code === '23503' || message.toLowerCase().includes('foreign key')) {
          await vehiclesService.update(vehicleToDelete.id, { active: false });
          showStatus('success', 'Unidad desactivada', 'Tiene historial relacionado, por eso quedó inactiva en lugar de borrarse.', '✅');
        } else {
          throw err;
        }
      }
      await loadVehicles();
      setIsVehicleDeleteConfirmOpen(false);
      setVehicleToDelete(null);
    } catch (err: any) {
      setError(err.message);
      showStatus('error', 'No se pudo eliminar', err.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (editingDriverId) {
        await driversService.update(editingDriverId, {
          name: newDriver.name,
          license: newDriver.license.toUpperCase(),
        });
      } else {
        await driversService.create({
          name: newDriver.name,
          license: newDriver.license.toUpperCase(),
          active: true,
          branch_id: selectedBranchId
        });
      }
      await loadDrivers();
      setIsAssetModalOpen(null);
      setNewDriver({ name: '', license: '' });
      setEditingDriverId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateDriver = () => {
    setEditingDriverId(null);
    setNewDriver({ name: '', license: '' });
    setIsAssetModalOpen('driver');
  };

  const handleOpenEditDriver = (driver: Driver) => {
    setEditingDriverId(driver.id);
    setNewDriver({ name: driver.name, license: driver.license });
    setIsAssetModalOpen('driver');
  };

  const handleAskDeleteDriver = (driver: Driver) => {
    setDriverToDelete(driver);
    setIsDriverDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteDriver = async () => {
    if (!driverToDelete) return;
    setIsLoading(true);
    showStatus('loading', 'Eliminando operador', 'Procesando cambios...', '⏳');
    try {
      try {
        await driversService.delete(driverToDelete.id);
        showStatus('success', 'Operador eliminado', 'Se eliminó correctamente del catálogo.', '✅');
      } catch (err: any) {
        const message = String(err?.message || '');
        if (err?.code === '23503' || message.toLowerCase().includes('foreign key')) {
          await driversService.update(driverToDelete.id, { active: false });
          showStatus('success', 'Operador desactivado', 'Tiene historial relacionado, por eso quedó inactivo en lugar de borrarse.', '✅');
        } else {
          throw err;
        }
      }
      await loadDrivers();
      setIsDriverDeleteConfirmOpen(false);
      setDriverToDelete(null);
    } catch (err: any) {
      setError(err.message);
      showStatus('error', 'No se pudo eliminar', err.message, '❌');
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openPdfPreview = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const previewWindow = window.open('', '_blank');

    if (previewWindow && !previewWindow.closed) {
      try {
        previewWindow.document.title = filename;
        previewWindow.location.href = url;
      } catch {
        downloadBlob(blob, filename);
      }
    } else {
      downloadBlob(blob, filename);
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleExportVisibleLogsPdf = async () => {
    if (visibleBranchLogs.length === 0) {
      showStatus('warning', 'Sin registros', 'No hay movimientos visibles para exportar.', '⚠️');
      return;
    }

    setIsExportingLogs(true);
    showStatus('loading', 'Generando PDF', 'Preparando historial visible...', '⏳');

    try {
      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont('Helvetica');
      const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
      const pageSize: [number, number] = [595.28, 841.89];
      const [pageWidth, pageHeight] = pageSize;
      const marginX = 32;
      const marginBottom = 70;
      const frameHeight = pageHeight - 140;
      const frameY = marginBottom;
      const tableWidth = pageWidth - marginX * 2;

      const branchTitle = (selectedBranch?.name ?? selectedBranchId ?? 'SUCURSAL').toUpperCase();
      const hasDateFilter = Boolean(logsDateFrom || logsDateTo);
      const fromLabel = logsDateFrom ? formatFilterDate(logsDateFrom) : 'INICIO';
      const toLabel = logsDateTo ? formatFilterDate(logsDateTo) : 'HOY';
      const rangeLabel = `${fromLabel} / ${toLabel}`;
      const totalVisibleCost = visibleBranchLogs.reduce((acc, log) => acc + Number(log.totalCost ?? 0), 0);

      let watermarkImage: any = null;
      try {
        const logoBytes = await getWatermarkPngBytes();
        if (logoBytes) watermarkImage = await pdfDoc.embedPng(logoBytes);
      } catch {
        watermarkImage = null;
      }

      const drawWatermark = (targetPage: any) => {
        if (!watermarkImage) return;
        const dims = watermarkImage.scale(0.50);
        targetPage.drawImage(watermarkImage, {
          x: (pageWidth - dims.width) / 2,
          y: (pageHeight - dims.height) / 2,
          width: dims.width,
          height: dims.height,
          opacity: 0.1,
        });
      };

      const truncateText = (text: string, maxWidth: number, font: any, size: number) => {
        if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
        const ellipsis = '...';
        const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size);
        let trimmed = text;
        while (trimmed.length > 0 && font.widthOfTextAtSize(trimmed, size) + ellipsisWidth > maxWidth) {
          trimmed = trimmed.slice(0, -1);
        }
        return `${trimmed}${ellipsis}`;
      };

      const columns = [
        { key: 'fecha', label: 'FECHA', width: 92 },
        { key: 'tipo', label: 'TIPO', width: 52 },
        { key: 'detalle', label: 'DETALLE', width: 112 },
        { key: 'cantidad', label: 'CANT.', width: 62 },
        { key: 'precio', label: 'PRECIO', width: 70 },
        { key: 'observacion', label: 'OBSERVACIÓN', width: 95 },
        { key: 'estado', label: 'ESTADO', width: 48 },
      ] as const;

      const colXs = columns.reduce<number[]>((acc, column, index) => {
        if (index === 0) return [marginX, marginX + column.width];
        return [...acc, acc[acc.length - 1] + column.width];
      }, []);

      const drawCenteredCellText = (
        targetPage: any,
        text: string,
        colIndex: number,
        yPos: number,
        size: number,
        font: any,
        color?: any
      ) => {
        const colStart = colXs[colIndex];
        const colEnd = colXs[colIndex + 1];
        const colWidth = colEnd - colStart;
        const safeText = truncateText(text, colWidth - 8, font, size);
        const textWidth = font.widthOfTextAtSize(safeText, size);
        const x = colStart + Math.max(0, (colWidth - textWidth) / 2);
        targetPage.drawText(safeText, { x, y: yPos, size, font, color });
      };

      const drawCommonFrame = (targetPage: any, pageNumber: number) => {
        drawWatermark(targetPage);

        const title = `DIESEL ${branchTitle}`;
        const titleSize = 14;
        const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
        targetPage.drawText(title, {
          x: (pageWidth - titleWidth) / 2,
          y: pageHeight - 40,
          size: titleSize,
          font: fontBold,
        });

        targetPage.drawRectangle({
          x: marginX,
          y: frameY,
          width: tableWidth,
          height: frameHeight,
          borderWidth: 1,
          borderColor: rgb(0, 0, 0),
        });

        const infoTopY = pageHeight - 105;
        targetPage.drawText(`FECHA REPORTE: ${formatDieselDate(new Date())}`, { x: marginX + 12, y: infoTopY, size: 10, font: fontBold });
        if (hasDateFilter) {
          targetPage.drawText(`RANGO: ${rangeLabel}`, { x: marginX + 12, y: infoTopY - 20, size: 9, font: fontRegular });
        }
        targetPage.drawText('HISTORIAL COMPLETO', { x: pageWidth - marginX - 160, y: infoTopY, size: 10, font: fontBold });
        targetPage.drawText(`REGISTROS: ${visibleBranchLogs.length}`, { x: pageWidth - marginX - 160, y: infoTopY - 20, size: 9, font: fontRegular });
        targetPage.drawText(`PÁGINA: ${pageNumber}`, { x: pageWidth - marginX - 160, y: infoTopY - 38, size: 9, font: fontRegular });
        targetPage.drawText(`Página ${pageNumber}`, { x: pageWidth - marginX - 40, y: 52, size: 7 });
      };

      const drawTableHeader = (targetPage: any, topY: number) => {
        const headerHeight = 20;
        targetPage.drawRectangle({
          x: marginX,
          y: topY - headerHeight,
          width: tableWidth,
          height: headerHeight,
          color: rgb(0, 0, 0),
        });

        columns.forEach((column, colIndex) => {
          drawCenteredCellText(targetPage, column.label, colIndex, topY - 14, 7, fontBold, rgb(1, 1, 1));
        });
      };

      let pageNumber = 1;
      let page = pdfDoc.addPage(pageSize);
      drawCommonFrame(page, pageNumber);
      const firstTableTop = pageHeight - 188;
      drawTableHeader(page, firstTableTop);

      const headerHeight = 20;
      const rowHeight = 18;
      let rowY = firstTableTop - headerHeight - 14;

      for (const log of visibleBranchLogs) {
        if (rowY < 110) {
          pageNumber += 1;
          page = pdfDoc.addPage(pageSize);
          drawCommonFrame(page, pageNumber);
          drawTableHeader(page, firstTableTop);
          rowY = firstTableTop - headerHeight - 14;
        }

        page.drawRectangle({
          x: marginX,
          y: rowY - 4,
          width: tableWidth,
          height: rowHeight,
          borderWidth: 0.5,
          borderColor: rgb(0, 0, 0),
        });

        for (let i = 1; i < colXs.length - 1; i += 1) {
          page.drawLine({
            start: { x: colXs[i], y: rowY - 4 },
            end: { x: colXs[i], y: rowY - 4 + rowHeight },
            thickness: 0.5,
            color: rgb(0, 0, 0),
          });
        }

        const isDeleted = log.status === 'ELIMINADO';
        const detail = log.type === 'CARGA'
          ? (vehicles.find((vehicle) => vehicle.id === log.vehicleId)?.description ?? '—')
          : (log.supplier ?? '—');
        const observation = isDeleted ? (log.deleteObservation || '—') : (log.notes || '—');

        const rowValues = [
          formatDieselDateTime(log.createdAt),
          log.type === 'CARGA' ? 'SALIDA' : 'ENTRADA',
          detail,
          `${formatNumber(log.amount)} L`,
          log.costPerLiter ? formatCurrency(log.costPerLiter) : '—',
          observation,
          log.status || 'ACTIVO',
        ];

        rowValues.forEach((value, index) => {
          drawCenteredCellText(page, value, index, rowY + 4, 7, fontRegular);
        });
        rowY -= rowHeight;
      }

      if (rowY < 108) {
        pageNumber += 1;
        page = pdfDoc.addPage(pageSize);
        drawCommonFrame(page, pageNumber);
      }

      page.drawRectangle({
        x: marginX,
        y: 70,
        width: tableWidth,
        height: 22,
        color: rgb(0, 0, 0),
      });
      page.drawText(`TOTAL ENTRADA: ${formatCurrency(totalVisibleCost)}`, {
        x: pageWidth - marginX - 220,
        y: 74,
        size: 14,
        color: rgb(1, 1, 1),
        font: fontBold,
      });

      const pdfBytes = await pdfDoc.save();
      const safeBranchToken = branchTitle.replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
      const fileName = `DIESEL-${safeBranchToken}-${toInputDate(new Date())}.pdf`;
      openPdfPreview(new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
      showStatus('success', 'PDF generado', 'Se exportó el historial visible.', '✅');
    } catch (error: any) {
      console.error(error);
      showStatus('error', 'Error al exportar', error?.message || 'No se pudo generar el PDF.', '❌');
    } finally {
      setIsExportingLogs(false);
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
              <div className="flex flex-col gap-4 px-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logs de Movimientos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[170px_170px_auto_auto] gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Desde</span>
                      <input
                        type="date"
                        value={logsDateFrom}
                        onChange={(e) => setLogsDateFrom(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Hasta</span>
                      <input
                        type="date"
                        value={logsDateTo}
                        onChange={(e) => setLogsDateTo(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <button
                      onClick={() => {
                        setLogsDateFrom('');
                        setLogsDateTo('');
                      }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={handleExportVisibleLogsPdf}
                      disabled={isExportingLogs}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-slate-300 hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isExportingLogs ? 'Exportando...' : 'Descargar PDF'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleResetCalculations}
                    disabled={isLoading}
                    className="px-4 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-95"
                  >
                    {isLoading ? 'Reiniciando...' : 'Reiniciar Cálculos'}
                  </button>
                </div>
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
                      {visibleBranchLogs.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-sm font-bold text-slate-400">
                            No hay movimientos en el rango seleccionado.
                          </td>
                        </tr>
                      )}
                      {visibleBranchLogs.map(log => {
                        const isDeleted = log.status === 'ELIMINADO';
                        return (
                          <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${isDeleted ? 'opacity-60' : ''}`}>
                            <td className="p-6 text-xs text-slate-500 font-bold">{formatDieselDateTime(log.createdAt)}</td>
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
                            <td className="p-6 text-right font-black text-sm">{formatNumber(log.amount)} L</td>
                            <td className="p-6 text-right font-black text-sm">{log.costPerLiter ? formatCurrency(log.costPerLiter) : '———'}</td>
                            <td className="p-6 text-sm font-black text-slate-800 uppercase">
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
                    {activeVehicles.map(v => (
                      <div key={v.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl">🚛</div>
                          <div>
                            <p className="text-sm font-black">{v.description}</p>
                            <p className="text-[10px] font-mono text-orange-600 font-bold tracking-wider">{v.plate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditVehicle(v)}
                            className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Editar unidad"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAskDeleteVehicle(v)}
                            className="w-9 h-9 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                            title="Eliminar unidad"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className={`px-3 py-1 rounded-full text-[8px] font-black ${v.active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-300'}`}>
                            {v.active ? 'ACTIVO' : 'INACTIVO'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {activeVehicles.length === 0 && (
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 text-center text-xs font-bold text-slate-400">
                        No hay unidades activas registradas en esta sucursal.
                      </div>
                    )}
                    <button onClick={handleOpenCreateVehicle} className="w-full py-4 bg-slate-100 text-slate-500 rounded-3xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-200 hover:bg-slate-200 transition-colors">+ Añadir Unidad</button>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Operadores Registrados</h3>
                  <div className="space-y-3">
                    {activeDrivers.map(d => (
                      <div key={d.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl">👷</div>
                          <div>
                            <p className="text-sm font-black">{d.name}</p>
                            <p className="text-[10px] font-mono text-blue-600 tracking-wider font-bold">{d.license}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditDriver(d)}
                            className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Editar operador"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAskDeleteDriver(d)}
                            className="w-9 h-9 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                            title="Eliminar operador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className={`px-3 py-1 rounded-full text-[8px] font-black ${d.active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-300'}`}>
                            {d.active ? 'OPERANDO' : 'INACTIVO'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {activeDrivers.length === 0 && (
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 text-center text-xs font-bold text-slate-400">
                        No hay operadores activos registrados en esta sucursal.
                      </div>
                    )}
                    <button onClick={handleOpenCreateDriver} className="w-full py-4 bg-slate-100 text-slate-500 rounded-3xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-200 hover:bg-slate-200 transition-colors">+ Añadir Operador</button>
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

      <ConfirmModal
        isOpen={isVehicleDeleteConfirmOpen}
        title="Eliminar unidad"
        description={vehicleToDelete ? `Se eliminará ${vehicleToDelete.description} del listado activo.` : undefined}
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        isProcessing={isLoading}
        onConfirm={handleConfirmDeleteVehicle}
        onCancel={() => {
          setIsVehicleDeleteConfirmOpen(false);
          setVehicleToDelete(null);
        }}
      />

      <ConfirmModal
        isOpen={isDriverDeleteConfirmOpen}
        title="Eliminar operador"
        description={driverToDelete ? `Se eliminará a ${driverToDelete.name} del listado activo.` : undefined}
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        isProcessing={isLoading}
        onConfirm={handleConfirmDeleteDriver}
        onCancel={() => {
          setIsDriverDeleteConfirmOpen(false);
          setDriverToDelete(null);
        }}
      />

      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase tracking-tighter">
                {isAssetModalOpen === 'vehicle'
                  ? editingVehicleId
                    ? 'Editar Vehículo'
                    : 'Nuevo Vehículo'
                  : editingDriverId
                    ? 'Editar Operador'
                    : 'Nuevo Operador'}
              </h3>
              <button onClick={() => {
                setIsAssetModalOpen(null);
                setEditingVehicleId(null);
                setNewVehicle({ plate: '', description: '' });
                setEditingDriverId(null);
                setNewDriver({ name: '', license: '' });
              }} className="text-2xl font-black">&times;</button>
            </div>
            {isAssetModalOpen === 'vehicle' ? (
              <form onSubmit={handleAddVehicle} className="p-8 space-y-4">
                <input required placeholder="PLACA (EX. KW-22-MX)" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs uppercase appearance-none border-2 border-transparent focus:border-orange-500 outline-none" value={newVehicle.plate} onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value })} />
                <input required placeholder="DESCRIPCIÓN" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newVehicle.description} onChange={e => setNewVehicle({ ...newVehicle, description: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-orange-500 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg">
                  {editingVehicleId ? 'GUARDAR CAMBIOS' : 'AGREGAR UNIDAD'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddDriver} className="p-8 space-y-4">
                <input required placeholder="NOMBRE COMPLETO" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} />
                <input required placeholder="LICENCIA / ID" className="w-full p-4 bg-slate-50 rounded-xl font-mono text-sm border-2 border-transparent focus:border-orange-500 outline-none" value={newDriver.license} onChange={e => setNewDriver({ ...newDriver, license: e.target.value })} />
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg">
                  {editingDriverId ? 'GUARDAR CAMBIOS' : 'AGREGAR OPERADOR'}
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
