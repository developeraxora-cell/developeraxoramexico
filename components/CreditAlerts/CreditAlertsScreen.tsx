import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, CreditCard, Search } from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency, formatNumber } from '../../services/currency';
import { creditService as materialsCreditService } from '../../services/credit/credit.service';
import { creditService as concreteCreditService } from '../../services/concretera/credit.service';

interface CreditAlertsScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
  module: 'materiales' | 'concretera' | 'transporteria';
}

interface AlertCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  default_credit_days: number;
  late_tolerance_days: number;
  is_active: boolean;
}

interface AlertNote {
  id: string;
  customer_id: string;
  due_date: string;
  balance: number;
}

type AlertFilter = 'VENCIDOS' | 'POR_VENCER' | 'LIMITE_EXCEDIDO' | 'LIMITE_PREVENTIVO' | 'TODOS';
type AlertLevel = 'CRITICO' | 'PREVENTIVO' | 'NORMAL';

interface AlertRow {
  customerId: string;
  customerName: string;
  phone: string | null;
  address: string | null;
  creditDays: number;
  creditLimit: number;
  debt: number;
  available: number;
  utilizationPct: number;
  nextDueDate: string | null;
  daysToDue: number | null;
  overdueCount: number;
  openNotesCount: number;
  hasOverdue: boolean;
  isNearDue: boolean;
  isNearLimit: boolean;
  isOverLimit: boolean;
  level: AlertLevel;
  alertType: 'TIEMPO' | 'LIMITE' | 'MIXTO' | 'NINGUNO';
  message: string;
}

interface CreditApi {
  listCustomersByBranch(branchId: string, businessUnit?: string): Promise<AlertCustomer[]>;
  listOpenNotesByBranch(branchId: string, businessUnit?: string): Promise<AlertNote[]>;
}

const PAGE_SIZE = 10;
const DUE_SOON_DAYS = 7;
const LIMIT_WARNING_THRESHOLD = 80;

const formatDate = (value: string | null) => {
  if (!value) return 'Sin notas';
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('es-PE', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const getDayDiff = (dateValue: string, today: Date) => {
  const dueDate = new Date(`${dateValue}T00:00:00Z`);
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return Math.floor((dueDate.getTime() - todayUtc.getTime()) / (1000 * 60 * 60 * 24));
};

const buildAlertRow = (customer: AlertCustomer, notes: AlertNote[], today: Date): AlertRow => {
  const debt = notes.reduce((acc, note) => acc + Number(note.balance ?? 0), 0);
  const creditLimit = Number(customer.credit_limit ?? 0);
  const available = creditLimit - debt;
  const utilizationPct = creditLimit > 0 ? (debt / creditLimit) * 100 : 0;
  const sortedNotes = [...notes].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const nextDueDate = sortedNotes[0]?.due_date ?? null;
  const daysToDue = nextDueDate ? getDayDiff(nextDueDate, today) : null;
  const toleranceDays = Number(customer.late_tolerance_days ?? 0);
  const overdueCount = sortedNotes.filter((note) => getDayDiff(note.due_date, today) < -toleranceDays).length;
  const hasOverdue = overdueCount > 0;
  const isNearDue = !hasOverdue && daysToDue !== null && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS;
  const isOverLimit = creditLimit > 0 && debt >= creditLimit;
  const isNearLimit = !isOverLimit && creditLimit > 0 && utilizationPct >= LIMIT_WARNING_THRESHOLD;

  let level: AlertLevel = 'NORMAL';
  let alertType: AlertRow['alertType'] = 'NINGUNO';
  let message = 'Sin alertas inmediatas';

  if (hasOverdue && isOverLimit) {
    level = 'CRITICO';
    alertType = 'MIXTO';
    message = `Tiene ${overdueCount} nota(s) vencida(s) y superó su límite.`;
  } else if (hasOverdue) {
    level = 'CRITICO';
    alertType = 'TIEMPO';
    message = `Tiene ${overdueCount} nota(s) vencida(s).`;
  } else if (isOverLimit) {
    level = 'CRITICO';
    alertType = 'LIMITE';
    message = 'Alcanzó o superó su límite de crédito.';
  } else if (isNearDue && isNearLimit) {
    level = 'PREVENTIVO';
    alertType = 'MIXTO';
    message = `Vence en ${daysToDue} día(s) y ya usa ${formatNumber(utilizationPct, 'en-US', { maximumFractionDigits: 0 })}% del límite.`;
  } else if (isNearDue) {
    level = 'PREVENTIVO';
    alertType = 'TIEMPO';
    message = `Su siguiente nota vence en ${daysToDue} día(s).`;
  } else if (isNearLimit) {
    level = 'PREVENTIVO';
    alertType = 'LIMITE';
    message = `Usa ${formatNumber(utilizationPct, 'en-US', { maximumFractionDigits: 0 })}% del límite.`;
  }

  return {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    address: customer.address,
    creditDays: Number(customer.default_credit_days ?? 0),
    creditLimit,
    debt,
    available,
    utilizationPct,
    nextDueDate,
    daysToDue,
    overdueCount,
    openNotesCount: sortedNotes.length,
    hasOverdue,
    isNearDue,
    isNearLimit,
    isOverLimit,
    level,
    alertType,
    message,
  };
};

const rowMatchesFilter = (row: AlertRow, filter: AlertFilter) => {
  switch (filter) {
    case 'VENCIDOS':
      return row.hasOverdue;
    case 'POR_VENCER':
      return !row.hasOverdue && row.isNearDue;
    case 'LIMITE_EXCEDIDO':
      return row.isOverLimit;
    case 'LIMITE_PREVENTIVO':
      return !row.isOverLimit && row.isNearLimit;
    case 'TODOS':
    default:
      return true;
  }
};

const getLevelBadge = (level: AlertLevel) => {
  if (level === 'CRITICO') {
    return 'bg-red-100 text-red-700 border border-red-200';
  }
  if (level === 'PREVENTIVO') {
    return 'bg-amber-100 text-amber-700 border border-amber-200';
  }
  return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
};

const getAlertTypeBadge = (type: AlertRow['alertType']) => {
  switch (type) {
    case 'TIEMPO':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'LIMITE':
      return 'bg-orange-50 text-orange-700 border border-orange-200';
    case 'MIXTO':
      return 'bg-violet-50 text-violet-700 border border-violet-200';
    default:
      return 'bg-slate-100 text-slate-500 border border-slate-200';
  }
};

const CreditAlertsScreen: React.FC<CreditAlertsScreenProps> = ({ selectedBranchId, branches, currentUser, module }) => {
  const [customers, setCustomers] = useState<AlertCustomer[]>([]);
  const [openNotes, setOpenNotes] = useState<AlertNote[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filter, setFilter] = useState<AlertFilter>('TODOS');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const branchId = useMemo(() => {
    const match = branches.find((branch) => branch.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  const creditApi: CreditApi = useMemo(
    () => (module === 'concretera' ? concreteCreditService : materialsCreditService),
    [module]
  );

  const businessUnit = module === 'transporteria' ? 'transporteria' : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim().toLowerCase());
      setCurrentPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!branchId) {
        if (isMounted) {
          setCustomers([]);
          setOpenNotes([]);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [customerRows, noteRows] = await Promise.all([
          creditApi.listCustomersByBranch(branchId, businessUnit),
          creditApi.listOpenNotesByBranch(branchId, businessUnit),
        ]);

        if (!isMounted) return;
        setCustomers((customerRows ?? []).filter((customer) => customer.is_active !== false));
        setOpenNotes(noteRows ?? []);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'No se pudieron cargar las alertas.';
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [branchId, creditApi, businessUnit]);

  const alertRows = useMemo(() => {
    const today = new Date();
    const notesByCustomer = openNotes.reduce<Record<string, AlertNote[]>>((acc, note) => {
      if (!acc[note.customer_id]) acc[note.customer_id] = [];
      acc[note.customer_id].push(note);
      return acc;
    }, {});

    return customers
      .map((customer) => buildAlertRow(customer, notesByCustomer[customer.id] ?? [], today))
      .sort((left, right) => {
        const priority = { CRITICO: 0, PREVENTIVO: 1, NORMAL: 2 };
        const levelDiff = priority[left.level] - priority[right.level];
        if (levelDiff !== 0) return levelDiff;

        if (left.hasOverdue !== right.hasOverdue) return left.hasOverdue ? -1 : 1;
        if (left.isOverLimit !== right.isOverLimit) return left.isOverLimit ? -1 : 1;

        if (left.daysToDue === null && right.daysToDue !== null) return 1;
        if (left.daysToDue !== null && right.daysToDue === null) return -1;
        if (left.daysToDue !== null && right.daysToDue !== null && left.daysToDue !== right.daysToDue) {
          return left.daysToDue - right.daysToDue;
        }

        if (left.utilizationPct !== right.utilizationPct) return right.utilizationPct - left.utilizationPct;
        return left.customerName.localeCompare(right.customerName);
      });
  }, [customers, openNotes]);

  const filteredRows = useMemo(() => {
    const baseRows = alertRows.filter((row) => rowMatchesFilter(row, filter));
    if (!debouncedSearchTerm) return baseRows;

    return baseRows.filter((row) =>
      [
        row.customerName,
        row.phone ?? '',
        row.address ?? '',
        row.message,
      ]
        .join(' ')
        .toLowerCase()
        .includes(debouncedSearchTerm)
    );
  }, [alertRows, debouncedSearchTerm, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredRows]);

  const kpis = useMemo(() => {
    const criticalTime = alertRows.filter((row) => row.hasOverdue).length;
    const warningTime = alertRows.filter((row) => !row.hasOverdue && row.isNearDue).length;
    const criticalLimit = alertRows.filter((row) => row.isOverLimit).length;
    const warningLimit = alertRows.filter((row) => !row.isOverLimit && row.isNearLimit).length;
    const openNotesCount = openNotes.length;
    const totalActiveDebt = openNotes.reduce((acc, note) => acc + Number(note.balance ?? 0), 0);

    return {
      criticalTime,
      warningTime,
      criticalLimit,
      warningLimit,
      openNotesCount,
      totalActiveDebt,
    };
  }, [alertRows, openNotes]);

  const filterCounters = useMemo(
    () => ({
      VENCIDOS: alertRows.filter((row) => row.hasOverdue).length,
      POR_VENCER: alertRows.filter((row) => !row.hasOverdue && row.isNearDue).length,
      LIMITE_EXCEDIDO: alertRows.filter((row) => row.isOverLimit).length,
      LIMITE_PREVENTIVO: alertRows.filter((row) => !row.isOverLimit && row.isNearLimit).length,
      TODOS: alertRows.length,
    }),
    [alertRows]
  );

  const filterAmounts = useMemo(
    () => ({
      VENCIDOS: alertRows.filter((row) => row.hasOverdue).reduce((acc, row) => acc + row.debt, 0),
      POR_VENCER: alertRows.filter((row) => !row.hasOverdue && row.isNearDue).reduce((acc, row) => acc + row.debt, 0),
      LIMITE_EXCEDIDO: alertRows.filter((row) => row.isOverLimit).reduce((acc, row) => acc + row.debt, 0),
      LIMITE_PREVENTIVO: alertRows.filter((row) => !row.isOverLimit && row.isNearLimit).reduce((acc, row) => acc + row.debt, 0),
      TODOS: alertRows.reduce((acc, row) => acc + row.debt, 0),
    }),
    [alertRows]
  );

  const moduleLabel = module === 'concretera' ? 'CONCRETERA' : module === 'transporteria' ? 'TRANSPORTERÍA' : 'MATERIALES';

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_42%,#f8fafc_100%)] px-6 py-7">
          <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">Deudas activas</p>
                <p className="mt-1.5 text-[2rem] font-black leading-none text-slate-900">{kpis.openNotesCount}</p>
                <p className="mt-1 text-xs font-semibold text-sky-700">Cartera actualmente abierta</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Deuda activa</p>
                <p className="mt-1.5 text-[1.9rem] font-black leading-none text-slate-900">{formatCurrency(kpis.totalActiveDebt)}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-700">Saldo total pendiente</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500">Vencidos</p>
                <p className="mt-1.5 text-[2rem] font-black leading-none text-slate-900">{kpis.criticalTime}</p>
                <p className="mt-1 text-xs font-semibold text-red-500">Con nota ya fuera de plazo</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Por vencer 7 días</p>
                <p className="mt-1.5 text-[2rem] font-black leading-none text-slate-900">{kpis.warningTime}</p>
                <p className="mt-1 text-xs font-semibold text-amber-600">Seguimiento preventivo</p>
              </div>
              <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">Límite excedido</p>
                <p className="mt-1.5 text-[2rem] font-black leading-none text-white">{kpis.criticalLimit}</p>
                <p className="mt-1 text-xs font-semibold text-white/70">Bloqueo recomendado</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Límite preventivo</p>
                <p className="mt-1.5 text-[2rem] font-black leading-none text-slate-900">{kpis.warningLimit}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Desde {LIMIT_WARNING_THRESHOLD}% de uso</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'VENCIDOS', label: 'Vencidos' },
                { id: 'POR_VENCER', label: 'Por vencer 7 días' },
                { id: 'LIMITE_EXCEDIDO', label: 'Límite excedido' },
                { id: 'LIMITE_PREVENTIVO', label: 'Límite preventivo' },
                { id: 'TODOS', label: 'Todos' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setFilter(option.id as AlertFilter);
                    setCurrentPage(1);
                  }}
                  className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${filter === option.id
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                    : 'border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-orange-500'
                    }`}
                >
                  <span className="block">
                    {option.label} <span className="ml-1 opacity-70">({filterCounters[option.id as AlertFilter]})</span>
                  </span>
                  {module === 'materiales' && (
                    <span className={`mt-1 block text-[10px] font-bold normal-case tracking-normal ${filter === option.id ? 'text-white/75' : 'text-slate-400'}`}>
                      {formatCurrency(filterAmounts[option.id as AlertFilter])}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="relative w-full xl:max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por cliente, teléfono o observación..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-300"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em]">
                  <th className="px-5 py-4">Cliente</th>
                  <th className="px-5 py-4 text-right">Límite</th>
                  <th className="px-5 py-4 text-right">Deuda</th>
                  <th className="px-5 py-4 text-right">Disponible</th>
                  <th className="px-5 py-4 text-center">% Uso</th>
                  <th className="px-5 py-4 text-center">Próx. vence</th>
                  <th className="px-5 py-4 text-center">Días</th>
                  <th className="px-5 py-4 text-center">Notas</th>
                  <th className="px-5 py-4">Alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-sm font-semibold text-slate-400">
                      Cargando alertas de crédito...
                    </td>
                  </tr>
                )}
                {!isLoading && error && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-sm font-semibold text-red-500">
                      {error}
                    </td>
                  </tr>
                )}
                {!isLoading && !error && pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-sm font-semibold text-slate-400">
                      No hay clientes que coincidan con los filtros actuales.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  !error &&
                  pagedRows.map((row) => (
                    <tr key={row.customerId} className="align-top hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black uppercase tracking-tight text-slate-900">{row.customerName}</p>
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                              {row.creditDays} días
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400">
                            {row.phone || row.address || 'Sin dato adicional'}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-900">{formatCurrency(row.creditLimit)}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-900">{formatCurrency(row.debt)}</td>
                      <td className={`px-5 py-4 text-right font-bold ${row.available < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(row.available)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="mx-auto flex w-[100px] flex-col gap-2">
                          <div className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {formatNumber(row.utilizationPct, 'en-US', { maximumFractionDigits: 0 })}%
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${row.isOverLimit ? 'bg-red-500' : row.isNearLimit ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, Math.max(0, row.utilizationPct))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center font-semibold text-slate-700">{formatDate(row.nextDueDate)}</td>
                      <td className="px-5 py-4 text-center">
                        {row.daysToDue === null ? (
                          <span className="text-xs font-semibold text-slate-400">Sin deuda</span>
                        ) : row.daysToDue < 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-black text-red-600">
                            <Clock3 size={12} /> {Math.abs(row.daysToDue)} atraso
                          </span>
                        ) : (
                          <span className="text-xs font-black text-slate-700">{row.daysToDue} día(s)</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="space-y-1 text-xs font-semibold text-slate-500">
                          <p>{row.openNotesCount} abiertas</p>
                          <p className={row.overdueCount > 0 ? 'font-black text-red-600' : ''}>{row.overdueCount} vencidas</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getLevelBadge(row.level)}`}>
                              {row.level}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getAlertTypeBadge(row.alertType)}`}>
                              {row.alertType}
                            </span>
                          </div>
                          <p className="max-w-sm text-xs font-semibold leading-5 text-slate-500">{row.message}</p>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold">
              {filteredRows.length} cliente(s) encontrados · vista de {Math.min(PAGE_SIZE, pagedRows.length)} registro(s)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-black text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              <span className="rounded-xl bg-slate-900 px-3 py-2 font-black text-white">
                {currentPage}
              </span>
              <span className="font-semibold text-slate-400">/ {totalPages}</span>
              <button
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-black text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditAlertsScreen;
