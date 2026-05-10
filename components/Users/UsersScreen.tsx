import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye, EyeOff, KeyRound, Pencil, Plus,
  RefreshCw, Search, Trash2, UserCheck, UserCog, Users, UserX, X,
} from 'lucide-react';
import { Branch, BusinessUnit } from '../../types';
import { supabase } from '../../services/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagedUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role_key: string;
  active: boolean;
  default_branch_id: number | null;
  session_minutes: number;
  branch_ids: number[];
  business_units: BusinessUnit[];
}

interface UserFormState {
  id?: string;
  email: string;
  username: string;
  full_name: string;
  role_key: string;
  active: boolean;
  session_minutes: number;
  branch_ids: number[];
  business_units: BusinessUnit[];
  password: string;
}

const SESSION_MINUTES = 600; // 10 horas — fijo, no editable

const EMPTY_FORM: UserFormState = {
  email: '',
  username: '',
  full_name: '',
  role_key: 'superadmin',
  active: true,
  session_minutes: SESSION_MINUTES,
  branch_ids: [],
  business_units: [],
  password: '',
};

// ─── Constants ────────────────────────────────────────────────────────────────

interface RoleOption {
  value: string;
  label: string;
  color: string;
  modules: string[];
  note?: string;
  suggestedUnits: BusinessUnit[];
}

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  materials_user: [
    'materiales.sales.view', 'materiales.sales.create', 'materiales.sales.delete',
    'materiales.purchases.view', 'materiales.purchases.create', 'materiales.purchases.delete',
    'materiales.products.view',
    'materiales.customers.view', 'materiales.customers.create', 'materiales.customers.edit', 'materiales.customers.delete',
    'materiales.alerts.view',
  ],
  concrete_user: [
    'concretera.sales.view', 'concretera.sales.create', 'concretera.sales.delete',
    'concretera.purchases.view', 'concretera.purchases.create', 'concretera.purchases.delete',
    'concretera.products.view',
    'concretera.customers.view', 'concretera.customers.create', 'concretera.customers.edit', 'concretera.customers.delete',
    'concretera.alerts.view', 'concretera.audit.view', 'concretera.reports.view',
  ],
  transport_user: [
    'transporteria.sales.view', 'transporteria.sales.create', 'transporteria.sales.delete',
    'transporteria.purchases.view', 'transporteria.purchases.create', 'transporteria.purchases.delete',
    'transporteria.products.view',
    'transporteria.customers.view', 'transporteria.customers.create', 'transporteria.customers.edit', 'transporteria.customers.delete',
    'transporteria.alerts.view', 'transporteria.audit.view', 'transporteria.reports.view',
  ],
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'superadmin',
    label: 'Superadministrador',
    color: 'bg-red-100 text-red-700',
    modules: ['Acceso completo — todas las sucursales, módulos y unidades de negocio'],
    suggestedUnits: [],
  },
  {
    value: 'materials_user',
    label: 'Usuario Materiales',
    color: 'bg-blue-100 text-blue-700',
    modules: ['Materiales · Ventas, Entradas, Productos, Clientes / Créditos, Alertas'],
    note: '🔒 Solo ve su sucursal asignada — sin Reportes, Auditorías, Sucursales ni Usuarios',
    suggestedUnits: ['materiales'],
  },
  {
    value: 'concrete_user',
    label: 'Usuario Concretera',
    color: 'bg-green-100 text-green-700',
    modules: ['Concretera · Ventas, Compras, Entradas, Productos, Clientes, Alertas'],
    note: '🔒 Solo ve su sucursal asignada — sin Reportes ni Auditorías',
    suggestedUnits: ['concretera'],
  },
  {
    value: 'socio',
    label: 'Socio',
    color: 'bg-purple-100 text-purple-700',
    modules: [
      'Materiales · Ventas, Compras, Productos, Clientes, Alertas, Reportes, Auditorías, Sucursales, Personal',
      'Concretera · Ventas, Entradas, Productos, Clientes, Alertas, Reportes, Auditorías, Logística, Diésel',
    ],
    note: '🔒 Asignar ÚNICAMENTE la sucursal Jesús María',
    suggestedUnits: ['materiales', 'concretera', 'logistica', 'global'],
  },
  {
    value: 'transport_user',
    label: 'Usuario Transportería',
    color: 'bg-yellow-100 text-yellow-700',
    modules: ['Transportería · Ventas, Compras, Productos, Clientes, Alertas, Auditorías'],
    note: '🔒 Solo ve la sucursal de Transportería',
    suggestedUnits: ['transporteria'],
  },
];

const BUSINESS_UNITS: { value: BusinessUnit; label: string }[] = [
  { value: 'materiales',   label: 'Materiales'   },
  { value: 'concretera',   label: 'Concretera'   },
  { value: 'logistica',    label: 'Logística'    },
  { value: 'transporteria', label: 'Transportería' },
  { value: 'global',       label: 'Global'       },
];

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/10';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RoleBadge: React.FC<{ roleKey: string }> = ({ roleKey }) => {
  const role = ROLE_OPTIONS.find(r => r.value === roleKey);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${role?.color ?? 'bg-slate-100 text-slate-600'}`}>
      {role?.label ?? roleKey}
    </span>
  );
};

const Avatar: React.FC<{ name: string; active: boolean }> = ({ name, active }) => {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-sm text-white shadow-sm ${active ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-slate-400'}`}>
      {initials}
      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    {children}
  </label>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-white">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-0' : '-translate-x-5'}`} />
    </button>
    <span className="text-sm font-medium text-slate-700">{label}</span>
  </label>
);

// ─── Access checkboxes shared between modals ──────────────────────────────────

const AccessSection: React.FC<{
  branches: Branch[];
  branchIds: number[];
  businessUnits: BusinessUnit[];
  roleKey: string;
  onToggleBranch: (id: number) => void;
  onToggleUnit: (u: BusinessUnit) => void;
}> = ({ branches, branchIds, businessUnits, roleKey, onToggleBranch, onToggleUnit }) => {
  const isTransportRole = roleKey === 'transport_user';
  const isSuperAdmin    = roleKey === 'superadmin';

  const isBranchDisabled = (b: Branch) => {
    if (isSuperAdmin) return false;
    const isDegollado = b.name?.toUpperCase().includes('DEGOLLADO') ?? false;
    if (isTransportRole) return !isDegollado;
    return false;
  };

  const isUnitDisabled = (u: BusinessUnit) => {
    if (isSuperAdmin) return false;
    if (isTransportRole) return u !== 'transporteria';
    return u === 'transporteria';
  };

  return (
    <>
      <div>
        <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Sucursales permitidas</p>
        <div className="grid gap-3 md:grid-cols-2">
          {branches.filter(b => b.dbId !== undefined).map(b => {
            const checked   = branchIds.includes(Number(b.dbId));
            const disabled  = isBranchDisabled(b);
            return (
              <label
                key={b.id}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition
                  ${disabled ? 'cursor-not-allowed opacity-40 bg-slate-100 border-slate-200' :
                    checked  ? 'cursor-pointer border-orange-300 bg-orange-50' :
                               'cursor-pointer border-slate-200 bg-slate-50 hover:bg-white'}`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition
                  ${disabled ? 'border-slate-300 bg-slate-200' :
                    checked  ? 'border-orange-600 bg-orange-600' : 'border-slate-300'}`}>
                  {checked && !disabled && <span className="text-[10px] font-black text-white">✓</span>}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => !disabled && onToggleBranch(Number(b.dbId))}
                />
                <div>
                  <p className="text-sm font-black text-slate-800">{b.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{b.code}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Áreas de negocio</p>
        <div className="grid gap-3 md:grid-cols-2">
          {BUSINESS_UNITS.map(u => {
            const checked  = businessUnits.includes(u.value);
            const disabled = isUnitDisabled(u.value);
            return (
              <label
                key={u.value}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition
                  ${disabled ? 'cursor-not-allowed opacity-40 bg-slate-100 border-slate-200' :
                    checked  ? 'cursor-pointer border-orange-300 bg-orange-50' :
                               'cursor-pointer border-slate-200 bg-slate-50 hover:bg-white'}`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition
                  ${disabled ? 'border-slate-300 bg-slate-200' :
                    checked  ? 'border-orange-600 bg-orange-600' : 'border-slate-300'}`}>
                  {checked && !disabled && <span className="text-[10px] font-black text-white">✓</span>}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => !disabled && onToggleUnit(u.value)}
                />
                <span className="text-sm font-black text-slate-800">{u.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ─── Modal: Create / Edit User ────────────────────────────────────────────────

interface UserFormModalProps {
  mode: 'create' | 'edit';
  form: UserFormState;
  branches: Branch[];
  onChange: (u: Partial<UserFormState>) => void;
  onToggleBranch: (id: number) => void;
  onToggleUnit: (u: BusinessUnit) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
  saving: boolean;
  error: string | null;
  showPassword: boolean;
  onToggleShowPassword: () => void;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  mode, form, branches, onChange, onToggleBranch, onToggleUnit,
  onSave, onClose, saving, error, showPassword, onToggleShowPassword,
}) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">

      {/* Header */}
      <div className="flex shrink-0 items-start justify-between bg-slate-900 px-7 py-6 text-white">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-orange-400">
            {mode === 'create' ? 'Nuevo empleado' : 'Editar empleado'}
          </p>
          <h3 className="mt-1 text-xl font-black tracking-tight">
            {mode === 'create' ? 'Registrar usuario' : (form.full_name || 'Editar usuario')}
          </h3>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto p-7">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
        )}

        {/* Datos básicos */}
        <section className="space-y-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Datos del empleado</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre completo" className="md:col-span-2">
              <input value={form.full_name} onChange={e => onChange({ full_name: e.target.value })} className={inputCls} placeholder="Ej. Carlos García Ruiz" />
            </Field>
            {mode === 'edit' && (
              <Field label="Correo electrónico">
                <input type="email" value={form.email} onChange={e => onChange({ email: e.target.value })} className={inputCls} placeholder="correo@empresa.com" autoComplete="off" />
              </Field>
            )}
            <Field label="Usuario (username)">
              <input value={form.username} onChange={e => onChange({ username: e.target.value })} className={inputCls} placeholder="carlos.garcia" autoComplete="off" />
            </Field>
            {mode === 'create' && (
              <Field label="Contraseña inicial" className="md:col-span-2">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-orange-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/10">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => onChange({ password: e.target.value })}
                    className="flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={onToggleShowPassword} className="text-slate-400 transition hover:text-slate-700">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            )}
          </div>
        </section>

        {/* Rol y config */}
        <section className="space-y-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rol y configuración</p>
          <Field label="Rol asignado">
            <select
              value={form.role_key}
              onChange={e => onChange({ role_key: e.target.value })}
              className={`${inputCls} cursor-pointer`}
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>

          {/* Permisos del rol seleccionado */}
          {(() => {
            const info = ROLE_OPTIONS.find(r => r.value === form.role_key);
            if (!info) return null;
            return (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Módulos que incluye este rol</p>
                <ul className="space-y-1.5">
                  {info.modules.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs font-bold text-slate-600">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      {m}
                    </li>
                  ))}
                </ul>
                {info.note && (
                  <p className="pt-1 text-[10px] font-black text-orange-600">{info.note}</p>
                )}
              </div>
            );
          })()}

          <Toggle checked={form.active} onChange={v => onChange({ active: v })} label={form.active ? 'Usuario activo — puede iniciar sesión' : 'Usuario inactivo — acceso bloqueado'} />
        </section>

        {/* Accesos */}
        <AccessSection
          branches={branches}
          branchIds={form.branch_ids}
          businessUnits={form.business_units}
          roleKey={form.role_key}
          onToggleBranch={onToggleBranch}
          onToggleUnit={onToggleUnit}
        />
      </div>

      {/* Footer */}
      <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-slate-50 px-7 py-5">
        <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-100">
          Cancelar
        </button>
        <button
          disabled={saving}
          onClick={() => void onSave()}
          className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : mode === 'create' ? '+ Crear usuario' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  </div>
);

// ─── Modal: Cambiar contraseña ────────────────────────────────────────────────

const PasswordModal: React.FC<{ userId: string; userName: string; onClose: () => void }> = ({ userId, userName, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const save = async () => {
    setError(null);
    if (!password.trim())       { setError('Ingresa la nueva contraseña.'); return; }
    if (password.length < 6)    { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirm)   { setError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('app_set_user_password', { p_user_id: userId, p_password: password });
      if (rpcError) throw rpcError;
      setSuccess(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-slate-900 px-7 py-6 text-white">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-orange-400">Seguridad de acceso</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Cambiar contraseña</h3>
            <p className="mt-1 text-xs font-bold text-slate-400 truncate max-w-[260px]">{userName}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-7">
          {error   && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">✓ Contraseña actualizada correctamente</div>}

          <Field label="Nueva contraseña">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-orange-500 focus-within:bg-white">
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShow(p => !p)} className="text-slate-400 transition hover:text-slate-700">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field label="Confirmar contraseña">
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void save()}
              className={inputCls}
              placeholder="Repite la nueva contraseña"
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-7 py-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-100">
            Cancelar
          </button>
          <button
            disabled={saving || success}
            onClick={() => void save()}
            className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-600 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal: Eliminar / Desactivar ─────────────────────────────────────────────

const DeleteModal: React.FC<{
  user: { id: string; name: string };
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}> = ({ user, onDeactivate, onDelete, onClose, saving, error }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-7 py-6">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-red-500">Acción sobre usuario</p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">Gestionar acceso</h3>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-7 py-6">
        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
        <p className="text-sm font-bold text-slate-500">
          ¿Qué deseas hacer con <span className="font-black text-slate-900">{user.name}</span>?
        </p>

        <div className="mt-5 space-y-3">
          <button
            disabled={saving}
            onClick={() => void onDeactivate()}
            className="flex w-full items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left transition hover:bg-amber-100 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <UserX className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-800">Desactivar usuario</p>
              <p className="text-[10px] font-bold text-amber-600">No puede iniciar sesión. Sus datos se conservan.</p>
            </div>
          </button>

          <button
            disabled={saving}
            onClick={() => void onDelete()}
            className="flex w-full items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left transition hover:bg-red-100 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-black text-red-800">Eliminar permanentemente</p>
              <p className="text-[10px] font-bold text-red-500">Se borran todos sus datos. Acción irreversible.</p>
            </div>
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-7 py-4">
        <button onClick={onClose} className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

interface UsersScreenProps {
  branches: Branch[];
}

const UsersScreen: React.FC<UsersScreenProps> = ({ branches }) => {
  const [profiles, setProfiles]         = useState<ManagedUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [roleFilter, setRoleFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals
  const [formModal, setFormModal]         = useState<{ mode: 'create' | 'edit'; form: UserFormState } | null>(null);
  const [passwordModal, setPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  const [deleteModal, setDeleteModal]     = useState<{ id: string; name: string } | null>(null);

  // Shared state for forms
  const [saving, setSaving]           = useState(false);
  const [modalError, setModalError]   = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const branchByDbId = useMemo(
    () => new Map(branches.filter(b => b.dbId !== undefined).map(b => [Number(b.dbId), b])),
    [branches],
  );

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, branchesRes, unitsRes] = await Promise.all([
        supabase.from('app_user_profiles')
          .select('id, email, username, full_name, role_key, active, default_branch_id, session_minutes')
          .order('full_name'),
        supabase.from('app_user_branch_access').select('user_id, branch_id'),
        supabase.from('app_user_business_unit_access').select('user_id, business_unit'),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const branchMap = new Map<string, number[]>();
      (branchesRes.data ?? []).forEach((r: any) => {
        branchMap.set(r.user_id, [...(branchMap.get(r.user_id) ?? []), Number(r.branch_id)]);
      });
      const unitMap = new Map<string, BusinessUnit[]>();
      (unitsRes.data ?? []).forEach((r: any) => {
        unitMap.set(r.user_id, [...(unitMap.get(r.user_id) ?? []), r.business_unit as BusinessUnit]);
      });

      setProfiles((profilesRes.data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email ?? '',
        username: r.username ?? '',
        full_name: r.full_name ?? '',
        role_key: r.role_key ?? 'materials_user',
        active: r.active !== false,
        default_branch_id: r.default_branch_id ?? null,
        session_minutes: Number(r.session_minutes ?? 480),
        branch_ids: branchMap.get(r.id) ?? [],
        business_units: unitMap.get(r.id) ?? [],
      })));
    } catch (err) {
      console.error('Error loading profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return profiles.filter(p => {
      if (q && !p.full_name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !p.username.toLowerCase().includes(q)) return false;
      if (roleFilter && p.role_key !== roleFilter) return false;
      if (statusFilter === 'active'   && !p.active) return false;
      if (statusFilter === 'inactive' &&  p.active) return false;
      return true;
    });
  }, [profiles, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total:    profiles.length,
    active:   profiles.filter(p => p.active).length,
    inactive: profiles.filter(p => !p.active).length,
  }), [profiles]);

  // ── Open modals ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setModalError(null);
    setShowPassword(false);
    setFormModal({ mode: 'create', form: { ...EMPTY_FORM } });
  };

  const openEdit = (user: ManagedUser) => {
    setModalError(null);
    setShowPassword(false);
    setFormModal({
      mode: 'edit',
      form: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role_key: user.role_key,
        active: user.active,
        session_minutes: user.session_minutes,
        branch_ids: [...user.branch_ids],
        business_units: [...user.business_units],
        password: '',
      },
    });
  };

  const openPassword = (user: ManagedUser) => {
    setPasswordModal({ userId: user.id, userName: user.full_name });
  };

  const openDelete = (user: ManagedUser) => {
    setDeleteError(null);
    setDeleteModal({ id: user.id, name: user.full_name });
  };

  // ── Form helpers ───────────────────────────────────────────────────────────

  const updateForm = (updates: Partial<UserFormState>) => {
    setFormModal(prev => {
      if (!prev) return prev;
      const next = { ...prev.form, ...updates };
      if ('role_key' in updates && updates.role_key !== prev.form.role_key) {
        const roleKey  = updates.role_key ?? '';
        const roleInfo = ROLE_OPTIONS.find(r => r.value === roleKey);
        if (roleKey === 'superadmin') {
          const allDbIds = branches.filter(b => b.dbId !== undefined).map(b => Number(b.dbId));
          next.branch_ids    = allDbIds;
          next.business_units = BUSINESS_UNITS.map(u => u.value);
        } else if (roleKey === 'transport_user') {
          const degolladoDbIds = branches
            .filter(b => b.name?.toUpperCase().includes('DEGOLLADO') && b.dbId !== undefined)
            .map(b => Number(b.dbId));
          next.branch_ids    = degolladoDbIds;
          next.business_units = ['transporteria'];
        } else {
          const nonTransportIds = prev.form.branch_ids.filter(id => {
            const br = branches.find(b => Number(b.dbId) === id);
            return br?.businessUnit !== 'transporteria';
          });
          next.branch_ids = nonTransportIds;
          if (roleInfo && roleInfo.suggestedUnits.length > 0) {
            next.business_units = [...roleInfo.suggestedUnits];
          } else {
            next.business_units = prev.form.business_units.filter(u => u !== 'transporteria');
          }
        }
      }
      return { ...prev, form: next };
    });
  };

  const toggleFormBranch = (id: number) => {
    if (!formModal) return;
    const next = formModal.form.branch_ids.includes(id)
      ? formModal.form.branch_ids.filter(b => b !== id)
      : [...formModal.form.branch_ids, id];
    updateForm({ branch_ids: next });
  };

  const toggleFormUnit = (unit: BusinessUnit) => {
    if (!formModal) return;
    const next = formModal.form.business_units.includes(unit)
      ? formModal.form.business_units.filter(u => u !== unit)
      : [...formModal.form.business_units, unit];
    updateForm({ business_units: next });
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveUser = async () => {
    if (!formModal) return;
    const { mode, form } = formModal;
    setModalError(null);

    if (!form.full_name.trim())                            { setModalError('El nombre completo es obligatorio.'); return; }
    if (!form.username.trim() && !form.email.trim())       { setModalError('Debes capturar al menos un usuario para iniciar sesión.'); return; }
    if (mode === 'create' && !form.password.trim())        { setModalError('La contraseña inicial es obligatoria.'); return; }
    if (mode === 'create' && form.password.length < 6)     { setModalError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setSaving(true);
    try {
      const userId = form.id ?? crypto.randomUUID();

      const resolvedEmail = form.email.trim() || `${form.username.trim()}@lopar.com`;

      if (mode === 'create') {
        const { error: insertErr } = await supabase.from('app_user_profiles').insert({
          id: userId,
          email: resolvedEmail,
          username: form.username.trim() || null,
          full_name: form.full_name.trim(),
          role_key: form.role_key,
          active: form.active,
          default_branch_id: form.branch_ids[0] ?? null,
          session_minutes: SESSION_MINUTES,
        });
        if (insertErr) throw insertErr;

        const { error: pwErr } = await supabase.rpc('app_set_user_password', { p_user_id: userId, p_password: form.password });
        if (pwErr) throw pwErr;
      } else {
        const { error: updateErr } = await supabase.from('app_user_profiles').update({
          email: resolvedEmail,
          username: form.username.trim() || null,
          full_name: form.full_name.trim(),
          role_key: form.role_key,
          active: form.active,
          default_branch_id: form.branch_ids[0] ?? null,
          session_minutes: SESSION_MINUTES,
        }).eq('id', userId);
        if (updateErr) throw updateErr;
      }

      // Re-sync branch access
      await supabase.from('app_user_branch_access').delete().eq('user_id', userId);
      if (form.branch_ids.length > 0) {
        const { error: brErr } = await supabase.from('app_user_branch_access').insert(
          form.branch_ids.map(branch_id => ({ user_id: userId, branch_id }))
        );
        if (brErr) throw brErr;
      }

      // Re-sync business unit access
      await supabase.from('app_user_business_unit_access').delete().eq('user_id', userId);
      if (form.business_units.length > 0) {
        const { error: buErr } = await supabase.from('app_user_business_unit_access').insert(
          form.business_units.map(business_unit => ({ user_id: userId, business_unit }))
        );
        if (buErr) throw buErr;
      }

      // Re-sync permissions based on role defaults
      await supabase.from('app_user_permissions').delete().eq('user_id', userId);
      const defaultPerms = ROLE_DEFAULT_PERMISSIONS[form.role_key] ?? [];
      if (defaultPerms.length > 0) {
        const { error: permErr } = await supabase.from('app_user_permissions').insert(
          defaultPerms.map(permission_key => ({ user_id: userId, permission_key, is_allowed: true }))
        );
        if (permErr) throw permErr;
      }

      setFormModal(null);
      await loadProfiles();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete / Deactivate ────────────────────────────────────────────────────

  const deactivateUser = async () => {
    if (!deleteModal) return;
    setSaving(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.from('app_user_profiles').update({ active: false }).eq('id', deleteModal.id);
      if (error) throw error;
      setDeleteModal(null);
      await loadProfiles();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo desactivar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteModal) return;
    setSaving(true);
    setDeleteError(null);
    try {
      const id = deleteModal.id;
      await supabase.from('app_user_sessions').delete().eq('user_id', id);
      await supabase.from('app_user_permissions').delete().eq('user_id', id);
      await supabase.from('app_user_branch_access').delete().eq('user_id', id);
      await supabase.from('app_user_business_unit_access').delete().eq('user_id', id);
      const { error } = await supabase.from('app_user_profiles').delete().eq('id', id);
      if (error) throw error;
      setDeleteModal(null);
      await loadProfiles();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
            <UserCog className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Personal</h2>
            <p className="text-xs font-bold text-slate-400">Usuarios, roles y accesos del sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadProfiles()}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-slate-900/15 transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total empleados', value: stats.total,    icon: <Users className="h-5 w-5" />,     bg: 'bg-slate-900 text-white' },
          { label: 'Activos',         value: stats.active,   icon: <UserCheck className="h-5 w-5" />, bg: 'bg-emerald-500 text-white' },
          { label: 'Inactivos',       value: stats.inactive, icon: <UserX className="h-5 w-5" />,     bg: 'bg-slate-400 text-white' },
        ].map(s => (
          <div key={s.label} className="flex flex-row gap-3 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`flex h-14 w-14 items-center justify-center rounded-3xl ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-3xl font-black leading-none text-slate-900">{s.value}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        {/* Search */}
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-orange-500 focus-within:bg-white">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400"
            placeholder="Buscar por nombre, correo o usuario..."
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 transition hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 outline-none transition hover:bg-white"
        >
          <option value="">Todos los roles</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {/* Status filter */}
        <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {(['all', 'active', 'inactive'] as const).map(v => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest transition ${statusFilter === v ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {{ all: 'Todos', active: 'Activos', inactive: 'Inactivos' }[v]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-orange-500" />
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando usuarios...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-300">
              <UserX className="h-8 w-8" />
            </div>
            <p className="mt-4 text-sm font-black text-slate-500">No se encontraron usuarios</p>
            <p className="mt-1 text-xs font-bold text-slate-400">Ajusta los filtros o registra un nuevo usuario</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Empleado', 'Correo / Usuario', 'Rol', 'Sucursales', 'Áreas', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 last:text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(user => (
                  <tr key={user.id} className="transition hover:bg-slate-50/70">
                    {/* Empleado */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.full_name} active={user.active} />
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900">{user.full_name}</p>
                          {user.username && <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">@{user.username}</p>}
                        </div>
                      </div>
                    </td>
                    {/* Email */}
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-slate-600">{user.email}</p>
                    </td>
                    {/* Rol */}
                    <td className="px-5 py-4">
                      <RoleBadge roleKey={user.role_key} />
                    </td>
                    {/* Sucursales */}
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {user.branch_ids.length === 0
                          ? <span className="text-[10px] font-bold text-slate-400">Sin sucursal</span>
                          : user.branch_ids.map(id => (
                            <span key={id} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                              {branchByDbId.get(id)?.name ?? `#${id}`}
                            </span>
                          ))
                        }
                      </div>
                    </td>
                    {/* Áreas */}
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {user.business_units.length === 0
                          ? <span className="text-[10px] font-bold text-slate-400">Sin área</span>
                          : user.business_units.map(u => (
                            <span key={u} className="rounded-lg bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700 capitalize">{u}</span>
                          ))
                        }
                      </div>
                    </td>
                    {/* Estado */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${user.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {user.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {/* Acciones */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(user)}
                          title="Editar perfil"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-900 hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openPassword(user)}
                          title="Cambiar contraseña"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-orange-600 hover:text-white"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDelete(user)}
                          title="Desactivar o eliminar"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-red-500 hover:text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-[10px] font-bold text-slate-400">
              Mostrando {filtered.length} de {profiles.length} usuario{profiles.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {formModal && (
        <UserFormModal
          mode={formModal.mode}
          form={formModal.form}
          branches={branches}
          onChange={updateForm}
          onToggleBranch={toggleFormBranch}
          onToggleUnit={toggleFormUnit}
          onSave={saveUser}
          onClose={() => setFormModal(null)}
          saving={saving}
          error={modalError}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword(p => !p)}
        />
      )}

      {passwordModal && (
        <PasswordModal
          userId={passwordModal.userId}
          userName={passwordModal.userName}
          onClose={() => setPasswordModal(null)}
        />
      )}

      {deleteModal && (
        <DeleteModal
          user={deleteModal}
          onDeactivate={deactivateUser}
          onDelete={deleteUser}
          onClose={() => setDeleteModal(null)}
          saving={saving}
          error={deleteError}
        />
      )}
    </div>
  );
};

export default UsersScreen;
