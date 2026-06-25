import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Edit3, FileText, LockKeyhole, PackageSearch, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Branch, User } from '../../types';
import { formatNumber } from '../../services/currency';
import { catalogService, type Product, type Uom } from '../../services/inventory/catalog.service';
import {
  physicalInventoryService,
  type PhysicalInventory,
  type PhysicalInventoryItem,
} from '../../services/inventory/physicalInventory.service';
import { generatePhysicalInventoryReportPdf } from '../../services/pdf/physicalInventoryPdf';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';

interface PhysicalInventoryScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

const today = () => new Date().toISOString().slice(0, 10);

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseQuantity = (value: string) => Number(String(value || '0').replace(',', '.'));

type ScreenMode = 'list' | 'new' | 'edit' | 'capture';

interface DraftInventoryItem {
  product: Product;
  systemQty: number;
  physicalQty: string;
  observation: string;
  baseUom: string;
}

interface PhysicalInventoryReportRow {
  product_name: string;
  base_uom_code: string;
  system_qty: number;
  physical_qty: number;
  difference_qty: number;
  observation: string | null;
}

const toFiniteNumber = (value: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateProductReliability = (systemQty: number, physicalQty: number) => {
  const system = toFiniteNumber(systemQty);
  const physical = toFiniteNumber(physicalQty);

  if (system === 0) return physical === 0 ? 100 : 0;

  const imbalancePercent = (Math.abs(physical - system) / Math.abs(system)) * 100;
  return Math.min(100, Math.max(0, 100 - imbalancePercent));
};

const calculateRingReliability = (rows: PhysicalInventoryReportRow[]) => {
  const ringItems = rows.filter((item) => normalize(item.product_name).includes('anillo'));
  if (ringItems.length === 0) return 0;

  const totalReliability = ringItems.reduce((acc, item) => (
    acc + calculateProductReliability(item.system_qty, item.physical_qty)
  ), 0);

  return totalReliability / ringItems.length;
};

const buildReportRowsFromItems = (rows: PhysicalInventoryItem[]): PhysicalInventoryReportRow[] =>
  rows.map((item) => ({
    product_name: item.product_name,
    base_uom_code: item.base_uom_code || '-',
    system_qty: Number(item.system_qty),
    physical_qty: Number(item.physical_qty),
    difference_qty: Number(item.difference_qty),
    observation: item.observation,
  }));

const buildSummaryFromRows = (rows: PhysicalInventoryReportRow[]) => {
  const total = rows.length;
  const exact = rows.filter((item) => Number(item.difference_qty) === 0).length;
  const missing = rows.filter((item) => Number(item.difference_qty) < 0).length;
  const surplus = rows.filter((item) => Number(item.difference_qty) > 0).length;
  const reliability = calculateRingReliability(rows);
  return { total, exact, missing, surplus, reliability };
};

const PhysicalInventoryScreen: React.FC<PhysicalInventoryScreenProps> = ({ selectedBranchId, currentUser, branches }) => {
  const [mode, setMode] = useState<ScreenMode>('list');
  const [inventories, setInventories] = useState<PhysicalInventory[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [items, setItems] = useState<PhysicalInventoryItem[]>([]);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newStartDate, setNewStartDate] = useState(today());
  const [newEndDate, setNewEndDate] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [inventorySearch, setInventorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [draftItems, setDraftItems] = useState<DraftInventoryItem[]>([]);
  const [pendingDeleteItemIds, setPendingDeleteItemIds] = useState<string[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('error');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');

  const branchId = useMemo(() => {
    const match = branches.find((branch) => branch.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const selectedInventory = useMemo(
    () => inventories.find((inventory) => inventory.id === selectedInventoryId) ?? null,
    [inventories, selectedInventoryId]
  );

  const visibleItems = useMemo(
    () => items.filter((item) => !pendingDeleteItemIds.includes(item.id)),
    [items, pendingDeleteItemIds]
  );

  const searchedProducts = useMemo(() => {
    const term = normalize(productSearch);
    if (term.length < 3) return [];
    return productResults;
  }, [productSearch, productResults]);

  const filteredInventories = useMemo(() => {
    const term = normalize(inventorySearch);
    if (!term) return inventories;
    return inventories.filter((inventory) =>
      normalize(`${inventory.name} ${inventory.start_date} ${inventory.end_date ?? ''} ${inventory.status}`).includes(term)
    );
  }, [inventories, inventorySearch]);

  const reportRows = useMemo<PhysicalInventoryReportRow[]>(() => {
    const draftRows = draftItems.map((item) => ({
      product_name: item.product.name,
      base_uom_code: item.baseUom,
      system_qty: item.systemQty,
      physical_qty: parseQuantity(item.physicalQty),
      difference_qty: parseQuantity(item.physicalQty) - item.systemQty,
      observation: item.observation?.trim() || null,
    }));
    const savedRows = visibleItems.map((item) => ({
      product_name: item.product_name,
      base_uom_code: item.base_uom_code || '-',
      system_qty: Number(item.system_qty),
      physical_qty: Number(item.physical_qty),
      difference_qty: Number(item.difference_qty),
      observation: item.observation,
    }));
    return [...draftRows, ...savedRows];
  }, [draftItems, visibleItems]);

  const summary = useMemo(() => {
    const rows = reportRows;
    const total = rows.length;
    const exact = rows.filter((item) => Number(item.difference_qty) === 0).length;
    const missing = rows.filter((item) => Number(item.difference_qty) < 0).length;
    const surplus = rows.filter((item) => Number(item.difference_qty) > 0).length;
    const reliability = calculateRingReliability(rows);
    return { total, exact, missing, surplus, reliability };
  }, [reportRows]);

  const getProductBaseUom = useCallback((product: Product) => {
    if (!product.base_uom_id) return '-';
    const uom = uoms.find((row) => String(row.id) === String(product.base_uom_id));
    return uom ? `${uom.code || uom.name}` : '-';
  }, [uoms]);

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  };

  const loadData = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [inventoryRows, stockRows, uomRows] = await Promise.all([
        physicalInventoryService.listInventories(branchId),
        catalogService.listStockByBranch(branchId),
        catalogService.listUoms(),
      ]);
      setInventories(inventoryRows);
      setUoms(uomRows);
      setStockByProduct(
        stockRows.reduce<Record<string, number>>((acc, row) => {
          acc[row.product_id] = Number(row.qty_base ?? 0);
          return acc;
        }, {})
      );
    } catch (err) {
      showFeedback('error', 'No se pudo cargar inventarios', err instanceof Error ? err.message : 'No se pudo cargar inventarios.');
    } finally {
      setIsLoading(false);
    }
  }, [branchId, selectedInventoryId]);

  const loadItems = useCallback(async () => {
    if (!selectedInventoryId) {
      setItems([]);
      return;
    }
    try {
      const rows = await physicalInventoryService.listItems(selectedInventoryId);
      setItems(rows);
      setPendingDeleteItemIds([]);
    } catch (err) {
      showFeedback('error', 'No se pudo cargar la captura', err instanceof Error ? err.message : 'No se pudo cargar la captura.');
    }
  }, [selectedInventoryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const term = productSearch.trim();
    if (!branchId || term.length < 3) {
      setProductResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await catalogService.searchProductsByBranch(branchId, 'materiales', term, 20);
        if (!cancelled) setProductResults(rows);
      } catch (err) {
        if (!cancelled) showFeedback('error', 'No se pudo buscar productos', err instanceof Error ? err.message : 'No se pudo buscar productos.');
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [branchId, productSearch]);

  const handleCreateInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId) return;
    if (!newName.trim()) {
      showFeedback('error', 'Dato obligatorio', 'El nombre del inventario es obligatorio.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const created = await physicalInventoryService.createInventory({
        branch_id: branchId,
        name: newName,
        start_date: newStartDate,
        end_date: newEndDate || null,
        is_active: newIsActive,
        created_by: currentUser.name || currentUser.username || currentUser.id,
      });
      setNewName('');
      setNewStartDate(today());
      setNewEndDate('');
      setNewIsActive(true);
      await loadData();
      setSelectedInventoryId(created.id);
      setMode('capture');
      showFeedback('success', 'Inventario creado');
    } catch (err) {
      showFeedback('error', 'No se pudo crear', err instanceof Error ? err.message : 'No se pudo crear inventario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInventoryId) return;
    if (!newName.trim()) {
      showFeedback('error', 'Dato obligatorio', 'El nombre del inventario es obligatorio.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const updated = await physicalInventoryService.updateInventory({
        id: selectedInventoryId,
        name: newName,
        start_date: newStartDate,
        end_date: newEndDate || null,
        is_active: newIsActive,
      });
      setInventories((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setMode('list');
      setSelectedInventoryId('');
      setNewName('');
      setNewStartDate(today());
      setNewEndDate('');
      setNewIsActive(true);
      showFeedback('success', 'Inventario actualizado');
    } catch (err) {
      showFeedback('error', 'No se pudo actualizar', err instanceof Error ? err.message : 'No se pudo actualizar inventario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseInventory = async (inventory: PhysicalInventory) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await physicalInventoryService.updateInventoryStatus(inventory.id, false);
      setInventories((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      showFeedback('success', 'Inventario cerrado');
    } catch (err) {
      showFeedback('error', 'No se pudo cerrar', err instanceof Error ? err.message : 'No se pudo cerrar inventario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInventory = async (inventory: PhysicalInventory) => {
    const ok = window.confirm(`Eliminar el inventario "${inventory.name}"? Esta accion tambien eliminara sus productos capturados.`);
    if (!ok) return;
    setIsSaving(true);
    setError(null);
    try {
      await physicalInventoryService.deleteInventory(inventory.id);
      setInventories((prev) => prev.filter((row) => row.id !== inventory.id));
      if (selectedInventoryId === inventory.id) {
        setSelectedInventoryId('');
        setItems([]);
      }
      showFeedback('success', 'Inventario eliminado');
    } catch (err) {
      showFeedback('error', 'No se pudo eliminar', err instanceof Error ? err.message : 'No se pudo eliminar inventario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCapture = async () => {
    if (!selectedInventory) {
      showFeedback('error', 'Inventario no seleccionado', 'No se encontro un inventario activo para guardar la captura.');
      return;
    }
    if (draftItems.length === 0 && pendingDeleteItemIds.length === 0) {
      showFeedback('error', 'Sin cambios', 'Agrega, modifica o elimina al menos un producto antes de guardar.');
      return;
    }

    const invalidQty = draftItems.find((item) => {
      const parsedPhysical = parseQuantity(item.physicalQty);
      return !Number.isFinite(parsedPhysical) || parsedPhysical < 0;
    });
    if (invalidQty) {
      showFeedback('error', 'Stock fisico invalido', `El stock fisico de ${invalidQty.product.name} debe ser un numero valido.`);
      return;
    }

    const missingObservation = draftItems.find((item) => {
      const parsedPhysical = parseQuantity(item.physicalQty);
      return parsedPhysical !== item.systemQty && !item.observation.trim();
    });
    if (missingObservation) {
      showFeedback('error', 'Observacion obligatoria', `La observacion es obligatoria para ${missingObservation.product.name}.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await Promise.all([
        ...pendingDeleteItemIds.map((itemId) => physicalInventoryService.deleteItem(itemId)),
        ...draftItems.map((item) => {
          const parsedPhysical = parseQuantity(item.physicalQty);
          return physicalInventoryService.upsertItem({
            inventory_id: selectedInventory.id,
            product_id: item.product.id,
            product_name: item.product.name,
            product_sku: item.product.sku,
            product_barcode: item.product.barcode,
            base_uom_id: item.product.base_uom_id,
            base_uom_code: item.baseUom,
            system_qty: item.systemQty,
            physical_qty: parsedPhysical,
            observation: parsedPhysical === item.systemQty ? null : item.observation,
            counted_by: currentUser.name || currentUser.username || currentUser.id,
          });
        }),
      ]);
      setDraftItems([]);
      setPendingDeleteItemIds([]);
      setProductSearch('');
      await loadItems();
      showFeedback('success', 'Productos capturados', 'Los cambios fueron guardados correctamente.');
    } catch (err) {
      showFeedback('error', 'No se pudo guardar', err instanceof Error ? err.message : 'No se pudo guardar captura.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    setPendingDeleteItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
  };

  const handlePrintReport = async (inventory: PhysicalInventory) => {
    const previewWindow = window.open('', '_blank');
    try {
      const rows = await physicalInventoryService.listItems(inventory.id);
      const reportData = buildReportRowsFromItems(rows);
      await generatePhysicalInventoryReportPdf({
        moduleLabel: 'MATERIALES',
        branchName: selectedBranch?.name ?? 'SUCURSAL',
        branchId,
        inventoryName: inventory.name,
        startDate: inventory.start_date,
        endDate: inventory.end_date,
        status: inventory.is_active ? 'ACTIVO' : 'CERRADO',
        summary: buildSummaryFromRows(reportData),
        rows: reportData,
        previewWindow,
      });
    } catch (err) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      showFeedback('error', 'No se pudo imprimir', err instanceof Error ? err.message : 'No se pudo generar el reporte.');
    }
  };

  const handleFinishInventory = async () => {
    if (!selectedInventory) return;
    setIsSaving(true);
    try {
      const updated = await physicalInventoryService.updateInventoryStatus(selectedInventory.id, !selectedInventory.is_active);
      setInventories((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSelectedInventoryId(updated.id);
      showFeedback('success', updated.is_active ? 'Inventario activado' : 'Inventario finalizado');
    } catch (err) {
      showFeedback('error', 'No se pudo actualizar', err instanceof Error ? err.message : 'No se pudo actualizar inventario.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {mode === 'list' && (
        <InventoryListView
          inventories={filteredInventories}
          inventorySearch={inventorySearch}
          isLoading={isLoading}
          onSearch={setInventorySearch}
          onNew={() => {
            setError(null);
            setMode('new');
          }}
          onCapture={(inventory) => {
            setSelectedInventoryId(inventory.id);
            setItems([]);
            setDraftItems([]);
            setPendingDeleteItemIds([]);
            setMode('capture');
          }}
          onEdit={(inventory) => {
            setSelectedInventoryId(inventory.id);
            setNewName(inventory.name);
            setNewStartDate(inventory.start_date);
            setNewEndDate(inventory.end_date ?? '');
            setNewIsActive(inventory.is_active);
            setError(null);
            setMode('edit');
          }}
          onClose={handleCloseInventory}
          onDelete={handleDeleteInventory}
          onPrint={handlePrintReport}
        />
      )}

      {mode === 'new' && (
        <NewInventoryView
          title="Nuevo Inventario"
          submitLabel="Guardar Inventario"
          name={newName}
          startDate={newStartDate}
          endDate={newEndDate}
          isActive={newIsActive}
          isSaving={isSaving}
          onNameChange={setNewName}
          onStartDateChange={setNewStartDate}
          onEndDateChange={setNewEndDate}
          onActiveChange={setNewIsActive}
          onBack={() => setMode('list')}
          onSubmit={handleCreateInventory}
        />
      )}

      {mode === 'edit' && (
        <NewInventoryView
          title="Editar Inventario"
          submitLabel="Guardar Cambios"
          name={newName}
          startDate={newStartDate}
          endDate={newEndDate}
          isActive={newIsActive}
          isSaving={isSaving}
          onNameChange={setNewName}
          onStartDateChange={setNewStartDate}
          onEndDateChange={setNewEndDate}
          onActiveChange={setNewIsActive}
          onBack={() => {
            setMode('list');
            setSelectedInventoryId('');
          }}
          onSubmit={handleUpdateInventory}
        />
      )}

      {mode === 'capture' && (
        <CaptureInventoryView
          selectedInventory={selectedInventory}
          summary={summary}
          productSearch={productSearch}
          draftItems={draftItems}
          searchedProducts={searchedProducts}
          stockByProduct={stockByProduct}
          isSaving={isSaving}
          items={visibleItems}
          hasPendingChanges={draftItems.length > 0 || pendingDeleteItemIds.length > 0}
          onBack={() => {
            setMode('list');
            setSelectedInventoryId('');
            setDraftItems([]);
            setPendingDeleteItemIds([]);
          }}
          onToggleInventory={handleFinishInventory}
          onProductSearch={(value) => {
            setProductSearch(value);
            if (value.trim().length < 3) setProductResults([]);
          }}
          onSelectProduct={(product) => {
            const pendingDeletedItem = items.find((item) => (
              pendingDeleteItemIds.includes(item.id) && String(item.product_id) === String(product.id)
            ));
            if (pendingDeletedItem) {
              setPendingDeleteItemIds((prev) => prev.filter((itemId) => itemId !== pendingDeletedItem.id));
              setProductSearch('');
              setProductResults([]);
              return;
            }
            const alreadyCaptured = visibleItems.some((item) => String(item.product_id) === String(product.id));
            const alreadyPending = draftItems.some((item) => String(item.product.id) === String(product.id));
            if (alreadyCaptured || alreadyPending) {
              showFeedback('alert', 'Producto ya agregado', 'Ese producto ya esta en el inventario.');
              setProductSearch('');
              setProductResults([]);
              return;
            }
            const systemQty = Number(stockByProduct[product.id] ?? 0);
            setDraftItems((prev) => [
              ...prev,
              {
                product,
                systemQty,
                physicalQty: String(systemQty),
                observation: '',
                baseUom: getProductBaseUom(product),
              },
            ]);
            setProductSearch('');
            setProductResults([]);
          }}
          onDraftPhysicalQtyChange={(productId, value) => {
            setDraftItems((prev) => prev.map((item) => (
              String(item.product.id) === String(productId)
                ? { ...item, physicalQty: value, observation: parseQuantity(value) === item.systemQty ? '' : item.observation }
                : item
            )));
          }}
          onDraftObservationChange={(productId, value) => {
            setDraftItems((prev) => prev.map((item) => (
              String(item.product.id) === String(productId) ? { ...item, observation: value } : item
            )));
          }}
          onRemoveDraftItem={(productId) => {
            setDraftItems((prev) => prev.filter((item) => String(item.product.id) !== String(productId)));
          }}
          onSaveProducts={handleSaveCapture}
          onDeleteItem={handleDeleteItem}
        />
      )}

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string | number; tone: 'blue' | 'green' | 'amber' | 'cyan' | 'red' }> = ({ label, value, tone }) => {
  const colors = {
    blue: 'text-slate-800 bg-slate-100',
    green: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    cyan: 'text-orange-600 bg-orange-50',
    red: 'text-red-500 bg-red-50',
  };
  return (
    <div className={`rounded-2xl px-4 py-3 text-center ${colors[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
};

const getReliabilityTone = (value: number) => {
  if (value <= 80) return 'red';
  if (value <= 90) return 'amber';
  return 'green';
};

const Input: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <label className="block">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-600"
    />
  </label>
);

const ReadOnlyBox: React.FC<{ label: string; value: string; tone?: 'red' | 'green' | 'cyan' }> = ({ label, value, tone }) => {
  const toneClass = tone === 'red' ? 'text-red-500' : tone === 'cyan' ? 'text-orange-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
};

const InventoryActionButton: React.FC<{
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: 'blue' | 'amber' | 'slate' | 'red';
  disabled?: boolean;
}> = ({ title, onClick, icon, tone = 'slate', disabled = false }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700',
    slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    red: 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${colors[tone]} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
    </button>
  );
};

const InventoryListView: React.FC<{
  inventories: PhysicalInventory[];
  inventorySearch: string;
  isLoading: boolean;
  onSearch: (value: string) => void;
  onNew: () => void;
  onCapture: (inventory: PhysicalInventory) => void;
  onEdit: (inventory: PhysicalInventory) => void;
  onClose: (inventory: PhysicalInventory) => void;
  onDelete: (inventory: PhysicalInventory) => void;
  onPrint: (inventory: PhysicalInventory) => void;
}> = ({ inventories, inventorySearch, isLoading, onSearch, onNew, onCapture, onEdit, onClose, onDelete, onPrint }) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <ClipboardList size={21} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">Historial de Inventarios</h1>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Sucursal activa</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800"
      >
        <Plus size={16} />
        Nuevo Inventario
      </button>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <input
        value={inventorySearch}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Buscar inventario por nombre, fecha o estado..."
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
      />

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-slate-900 text-left text-[10px] font-black uppercase tracking-widest text-white">
              <tr>
                <th className="px-5 py-4">Nombre</th>
                <th className="px-5 py-4">Fecha Inicio</th>
                <th className="px-5 py-4">Fecha Fin</th>
                <th className="px-5 py-4">Estado</th>
                <th className="px-5 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">
                    Cargando inventarios...
                  </td>
                </tr>
              )}
              {!isLoading && inventories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">
                    No hay inventarios registrados.
                  </td>
                </tr>
              )}
              {!isLoading && inventories.map((inventory) => (
                <tr key={inventory.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-5 py-4 font-black text-slate-900">{inventory.name}</td>
                  <td className="px-5 py-4 font-bold text-slate-600">{inventory.start_date}</td>
                  <td className="px-5 py-4 font-bold text-slate-600">{inventory.end_date ?? '-'}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${inventory.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {inventory.is_active ? 'Activo' : 'Cerrado'}
                    </span>
                </td>
                <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <InventoryActionButton
                        title="Capturar productos"
                        onClick={() => onCapture(inventory)}
                        icon={<PackageSearch size={16} />}
                        tone="blue"
                      />
                      <InventoryActionButton
                        title="Imprimir reporte"
                        onClick={() => onPrint(inventory)}
                        icon={<FileText size={16} />}
                        tone="slate"
                      />
                      <InventoryActionButton
                        title="Editar inventario"
                        onClick={() => onEdit(inventory)}
                        icon={<Edit3 size={16} />}
                        tone="slate"
                      />
                      <InventoryActionButton
                        title="Cerrar inventario"
                        onClick={() => onClose(inventory)}
                        icon={<LockKeyhole size={16} />}
                        tone="amber"
                        disabled={!inventory.is_active}
                      />
                      <InventoryActionButton
                        title="Eliminar inventario"
                        onClick={() => onDelete(inventory)}
                        icon={<Trash2 size={16} />}
                        tone="red"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
          <span>Mostrando {inventories.length} de {inventories.length} inventarios</span>
          <div className="flex gap-2">
            <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400" type="button">Anterior</button>
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-white" type="button">1</button>
            <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400" type="button">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const NewInventoryView: React.FC<{
  title: string;
  submitLabel: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onBack: () => void;
  onSubmit: (event?: React.FormEvent | React.MouseEvent) => void;
}> = ({ title, submitLabel, name, startDate, endDate, isActive, isSaving, onNameChange, onStartDateChange, onEndDateChange, onActiveChange, onBack, onSubmit }) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <ClipboardList size={21} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">{title}</h1>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Sucursal activa</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200"
      >
        <ArrowLeft size={16} />
        Volver al Historial
      </button>
    </div>

    <form onSubmit={onSubmit} className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-5">
        <Input label="Nombre" value={name} onChange={onNameChange} placeholder="Ej. Inventario Agosto 2025" />
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Fecha Inicio" type="date" value={startDate} onChange={onStartDateChange} />
          <Input label="Fecha Fin" type="date" value={endDate} onChange={onEndDateChange} />
        </div>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</span>
          <select
            value={isActive ? 'ACTIVE' : 'INACTIVE'}
            onChange={(event) => onActiveChange(event.target.value === 'ACTIVE')}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          >
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Cerrado</option>
          </select>
          <span className="mt-2 block text-xs font-semibold text-slate-500">Solo un inventario debe estar activo a la vez.</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
        <button type="button" onClick={onBack} className="rounded-xl bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Save size={16} />
          {submitLabel}
        </button>
      </div>
    </form>
  </div>
);

const CaptureInventoryView: React.FC<{
  selectedInventory: PhysicalInventory | null;
  summary: { total: number; exact: number; missing: number; surplus: number; reliability: number };
  productSearch: string;
  draftItems: DraftInventoryItem[];
  searchedProducts: Product[];
  stockByProduct: Record<string, number>;
  isSaving: boolean;
  items: PhysicalInventoryItem[];
  hasPendingChanges: boolean;
  onBack: () => void;
  onToggleInventory: () => void;
  onProductSearch: (value: string) => void;
  onSelectProduct: (product: Product) => void;
  onDraftPhysicalQtyChange: (productId: string, value: string) => void;
  onDraftObservationChange: (productId: string, value: string) => void;
  onRemoveDraftItem: (productId: string) => void;
  onSaveProducts: () => void;
  onDeleteItem: (itemId: string) => void;
}> = ({
  selectedInventory,
  summary,
  productSearch,
  draftItems,
  searchedProducts,
  stockByProduct,
  isSaving,
  items,
  hasPendingChanges,
  onBack,
  onToggleInventory,
  onProductSearch,
  onSelectProduct,
  onDraftPhysicalQtyChange,
  onDraftObservationChange,
  onRemoveDraftItem,
  onSaveProducts,
  onDeleteItem,
}) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <PackageSearch size={21} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">{selectedInventory?.name ?? 'Captura de Inventario'}</h1>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Captura de productos</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">
          <ArrowLeft size={16} />
          Volver a Inventarios
        </button>
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <InfoPanel label="Fecha Inicio" value={selectedInventory?.start_date ?? '-'} />
      <InfoPanel label="Fecha Fin" value={selectedInventory?.end_date ?? '-'} />
      <div className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-500">Estado</p>
        <button type="button" onClick={onToggleInventory} disabled={!selectedInventory || isSaving} className={`mt-2 rounded px-3 py-1 text-xs font-black text-white ${selectedInventory?.is_active ? 'bg-emerald-500' : 'bg-slate-500'}`}>
          {selectedInventory?.is_active ? 'Activo' : 'Cerrado'}
        </button>
      </div>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-5">
        <Metric label="Total Productos" value={summary.total} tone="blue" />
        <Metric label="Sin Diferencias" value={summary.exact} tone="green" />
        <Metric label="Con Faltante" value={summary.missing} tone="amber" />
        <Metric label="Con Sobrante" value={summary.surplus} tone="cyan" />
        <Metric
          label="Porcentaje de Fiabilidad en Produccion"
          value={`${summary.reliability.toFixed(2)}%`}
          tone={getReliabilityTone(summary.reliability)}
        />
      </div>
    </div>

    <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Search className="text-orange-600" size={42} />
          <h2 className="text-xl font-black text-slate-900">Captura de Productos</h2>
        </div>
        <label className="text-sm font-black text-slate-700">Buscar Producto:</label>
        <div className="relative mt-2 max-w-3xl">
          <div className="flex">
            <div className="flex w-10 items-center justify-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-orange-500">
              <Search size={17} />
            </div>
            <input
              value={productSearch}
              onChange={(event) => onProductSearch(event.target.value)}
              disabled={!selectedInventory?.is_active}
              placeholder="Escriba minimo 3 letras, nombre o codigo de barras..."
              className="min-w-0 flex-1 rounded-r-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>
          {productSearch.trim().length > 0 && productSearch.trim().length < 3 && (
            <p className="mt-2 text-xs font-bold text-slate-400">Escribe al menos 3 caracteres para buscar.</p>
          )}
          {productSearch.trim().length >= 3 && (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
              {searchedProducts.length > 0 ? searchedProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left last:border-b-0 hover:bg-orange-50"
                >
                  <span className="text-sm font-black text-slate-800">{product.name}</span>
                  <span className="text-[11px] font-black text-slate-500">
                    Stock: {formatNumber(Number(stockByProduct[product.id] ?? 0), undefined, { maximumFractionDigits: 3 })}
                  </span>
                </button>
              )) : (
                <div className="px-4 py-4 text-center text-xs font-bold text-slate-400">
                  Sin productos encontrados.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="bg-slate-900 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white">Productos en Inventario</div>
        <div className="overflow-x-auto p-5">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-center">Unidad Base</th>
                <th className="px-4 py-3 text-center">Stock Sistema</th>
                <th className="px-4 py-3 text-center">Stock Fisico</th>
                <th className="px-4 py-3 text-center">Diferencia</th>
                <th className="px-4 py-3 text-left">Comentario</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {draftItems.map((draft, index) => {
                const physicalQty = parseQuantity(draft.physicalQty);
                const difference = physicalQty - draft.systemQty;
                return (
                  <tr key={draft.product.id} className="bg-orange-50">
                    <td className="px-4 py-3 font-bold">{index + 1}</td>
                    <td className="px-4 py-3 font-bold">{draft.product.name}</td>
                    <td className="px-4 py-3 text-center font-black text-slate-600">{draft.baseUom}</td>
                    <td className="px-4 py-3 text-center font-bold">{formatNumber(draft.systemQty, undefined, { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.physicalQty}
                        onChange={(event) => onDraftPhysicalQtyChange(draft.product.id, event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-900 outline-none focus:border-orange-500"
                      />
                    </td>
                    <td className={`px-4 py-3 text-center font-black ${difference < 0 ? 'text-red-500' : difference > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {formatNumber(difference, undefined, { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={difference === 0 ? '' : draft.observation}
                        onChange={(event) => onDraftObservationChange(draft.product.id, event.target.value)}
                        disabled={difference === 0}
                        placeholder={difference === 0 ? 'Sin diferencia' : 'Comentario obligatorio'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => onRemoveDraftItem(draft.product.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.map((item, index) => (
                <tr key={item.id} className="odd:bg-slate-50">
                  <td className="px-4 py-3">{draftItems.length + index + 1}</td>
                  <td className="px-4 py-3">{item.product_name}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-600">{item.base_uom_code || '-'}</td>
                  <td className="px-4 py-3 text-center">{formatNumber(Number(item.system_qty), undefined, { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900">{formatNumber(Number(item.physical_qty), undefined, { maximumFractionDigits: 3 })}</td>
                  <td className={`px-4 py-3 text-center font-bold ${Number(item.difference_qty) < 0 ? 'text-red-500' : Number(item.difference_qty) > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                    {formatNumber(Number(item.difference_qty), undefined, { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-4 py-3">{item.observation || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" onClick={() => onDeleteItem(item.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && draftItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center font-semibold text-slate-400">
                    Sin productos capturados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hasPendingChanges && (
            <div className="flex justify-end border-t border-slate-100 px-2 py-4">
              <button
                type="button"
                onClick={() => onSaveProducts()}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Save size={16} />
                Guardar Productos
              </button>
            </div>
          )}
          <div className="border-t border-slate-300 px-2 py-3 text-sm font-semibold">
            Mostrando {items.length + draftItems.length} de {items.length + draftItems.length} registros
          </div>
        </div>
      </div>
    </div>
  </div>
);

const InfoPanel: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm">
    <p className="text-lg font-semibold text-slate-500">{label}</p>
    <p className="mt-2 text-sm font-bold text-slate-600">{value}</p>
  </div>
);

export default PhysicalInventoryScreen;
