import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Clock } from 'lucide-react';
import { Branch, User } from '../../types';
import { vinosCashRegisterService } from '../../services/vinos/cashRegister.service';
import { generateVinosCashRegisterReceipt } from '../../services/vinos/cashRegisterReceiptPdf';
import { vinosCustomersService } from '../../services/vinos/customers.service';
import { supabase } from '../../services/supabaseClient';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface CashierOption {
  id: string;
  name: string;
  roleKey: string;
}

const toLocalDateTimeInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getBranchName = (branch?: Branch | null) => branch?.name ?? 'CASA TAHONA';

const PanelCard: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-5">
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Corte personalizado</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const VinosCustomCutScreen: React.FC<Props> = ({ selectedBranchId, branches, currentUser }) => {
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0] ?? null;
  const branchName = useMemo(() => getBranchName(selectedBranch), [selectedBranch]);

  const [branchDbId, setBranchDbId] = useState<number | null>(null);
  const [cashierOptions, setCashierOptions] = useState<CashierOption[]>([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCashierOptions = useCallback(async () => {
    setCashiersLoading(true);
    try {
      const [profilesRes, unitsRes, permissionsRes] = await Promise.all([
        supabase
          .from('app_user_profiles')
          .select('id, full_name, username, email, role_key, active')
          .eq('active', true)
          .order('full_name'),
        supabase
          .from('app_user_business_unit_access')
          .select('user_id, business_unit')
          .eq('business_unit', 'vinos'),
        supabase
          .from('app_user_permissions')
          .select('user_id, permission_key, is_allowed')
          .eq('is_allowed', true)
          .like('permission_key', 'vinos.%'),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (unitsRes.error) throw unitsRes.error;
      if (permissionsRes.error) throw permissionsRes.error;

      const vinosUnitUsers = new Set((unitsRes.data ?? []).map((row: { user_id: string }) => row.user_id));
      const vinosPermissionUsers = new Set((permissionsRes.data ?? []).map((row: { user_id: string }) => row.user_id));
      const rows = (profilesRes.data ?? [])
        .filter((profile: { id: string; role_key: string | null }) => {
          const roleKey = String(profile.role_key ?? '').toLowerCase();
          return (
            roleKey === 'superadmin' ||
            roleKey === 'admin' ||
            roleKey === 'vinos_admin' ||
            vinosUnitUsers.has(profile.id) ||
            vinosPermissionUsers.has(profile.id)
          );
        })
        .map((profile: { id: string; full_name: string | null; username: string | null; email: string | null; role_key: string | null }) => ({
          id: profile.id,
          name: profile.full_name || profile.username || profile.email || 'Usuario sin nombre',
          roleKey: profile.role_key ?? '',
        }));

      setCashierOptions(rows);
    } catch (err) {
      console.error(err);
      setCashierOptions([]);
    } finally {
      setCashiersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCashierOptions();
  }, [loadCashierOptions]);

  useEffect(() => {
    let cancelled = false;
    setBranchDbId(null);
    vinosCustomersService.getBranchId(selectedBranch?.code ?? selectedBranchId)
      .then((id) => {
        if (!cancelled) setBranchDbId(id);
      })
      .catch(() => {
        if (!cancelled) setBranchDbId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBranch?.code, selectedBranchId]);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(17, 0, 0, 0);
    if (start > now) start.setDate(start.getDate() - 1);
    setStartAt(toLocalDateTimeInputValue(start));
    setEndAt(toLocalDateTimeInputValue(now));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!branchDbId) {
      setError('No se encontró la sucursal de Casa Tahona en la base de datos.');
      return;
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!startAt || !endAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Selecciona fecha y hora de inicio y fin.');
      return;
    }
    if (end <= start) {
      setError('La fecha y hora fin debe ser posterior al inicio.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.title = 'Corte personalizado';
      printWindow.blur();
      window.focus();
    }

    setLoading(true);
    setError('');
    try {
      const selectedCashier = cashierOptions.find((cashier) => cashier.id === cashierId) ?? null;
      const session = await vinosCashRegisterService.buildCustomCut({
        branch_id: branchDbId,
        branch_code: selectedBranch?.code ?? selectedBranchId,
        branch_name: branchName,
        start_at: startAt,
        end_at: endAt,
        generated_by: currentUser.name,
        cashier_user_id: selectedCashier?.id ?? null,
        cashier_name: selectedCashier?.name ?? null,
      });

      await generateVinosCashRegisterReceipt(
        { session, branchName },
        { mode: 'print', targetWindow: printWindow },
      );
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close();
      setError(err instanceof Error ? err.message : 'No se pudo generar el corte personalizado.');
    } finally {
      setLoading(false);
    }
  }, [branchDbId, branchName, cashierOptions, cashierId, currentUser.name, endAt, selectedBranch?.code, selectedBranchId, startAt]);

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
            <Printer size={20} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-orange-600">Casa Tahona</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Corte personalizado</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Reconstruye un corte para cualquier rango de fecha y hora, aunque cruce medianoche.
            </p>
          </div>
        </div>
      </div>

      <PanelCard title="Reimprimir corte de caja" subtitle="Genera e imprime el mismo ticket del corte normal usando cualquier rango personalizado.">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
              <p className="text-sm font-bold leading-relaxed text-orange-800">
                Este corte reconstruye las ventas dentro del rango seleccionado. No modifica las cajas guardadas ni el cierre automático.
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha y hora de inicio</span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha y hora de fin</span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Cajero / empleado</span>
              <select
                value={cashierId}
                onChange={(event) => setCashierId(event.target.value)}
                disabled={cashiersLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
              >
                <option value="">{cashiersLoading ? 'Cargando empleados...' : 'Todos los cajeros'}</option>
                {cashierOptions.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.name}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Clock size={16} />
              <p className="text-[11px] font-black uppercase tracking-[0.24em]">Resumen</p>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-bold text-slate-500">Sucursal</span>
                <span className="font-black text-slate-900">{branchName}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-bold text-slate-500">Cajero</span>
                <span className="font-black text-slate-900">{cashierId ? (cashierOptions.find((item) => item.id === cashierId)?.name ?? '—') : 'Todos los cajeros'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-bold text-slate-500">Inicio</span>
                <span className="font-black text-slate-900">{startAt ? new Date(startAt).toLocaleString('es-MX') : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-bold text-slate-500">Fin</span>
                <span className="font-black text-slate-900">{endAt ? new Date(endAt).toLocaleString('es-MX') : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex min-w-[240px] items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Generar e imprimir
          </button>
        </div>
      </PanelCard>
    </div>
  );
};

export default VinosCustomCutScreen;
