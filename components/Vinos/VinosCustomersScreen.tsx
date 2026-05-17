import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, FileText, ExternalLink, CreditCard, Wallet, Upload, Loader2 } from 'lucide-react';
import { User, Branch } from '../../types';
import {
  vinosCustomersService,
  type VinosCustomer,
  type CustomerStatus,
  type CustomerType,
  type LoyaltyLevel,
  type CustomerDocument,
  type NewDocumentInput,
} from '../../services/vinos/customers.service';
import { vinosDocumentUploadService, validateDocumentFile } from '../../services/vinos/documentUpload.service';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

// ─── config ────────────────────────────────────────────────────────────────

const LOYALTY_CONFIG: Record<LoyaltyLevel, { label: string; bg: string; text: string }> = {
  BRONCE: { label: 'Bronce', bg: 'bg-amber-100',  text: 'text-amber-800'  },
  PLATA:  { label: 'Plata',  bg: 'bg-slate-100',  text: 'text-slate-700'  },
  ORO:    { label: 'Oro',    bg: 'bg-yellow-100', text: 'text-yellow-800' },
  BLACK:  { label: 'Black',  bg: 'bg-slate-900',  text: 'text-white'      },
};

const STATUS_CONFIG: Record<CustomerStatus, { label: string; dot: string }> = {
  ACTIVO:    { label: 'Activo',    dot: 'bg-green-500'  },
  DORMIDO:   { label: 'Dormido',   dot: 'bg-yellow-400' },
  EN_RIESGO: { label: 'En riesgo', dot: 'bg-orange-500' },
  PERDIDO:   { label: 'Perdido',   dot: 'bg-red-500'    },
};

const CUSTOMER_TYPES: { value: CustomerType; label: string; emoji: string }[] = [
  { value: 'vino',              label: 'Vino',              emoji: '🍷' },
  { value: 'whisky',            label: 'Whisky',            emoji: '🥃' },
  { value: 'cerveza_artesanal', label: 'Cerveza artesanal', emoji: '🍺' },
  { value: 'tequila',           label: 'Tequila',           emoji: '🌵' },
  { value: 'premium',           label: 'Premium',           emoji: '⭐' },
  { value: 'fiesta_eventos',    label: 'Fiestas / Eventos', emoji: '🎉' },
];

const TYPE_LABEL: Record<CustomerType, string> = Object.fromEntries(
  CUSTOMER_TYPES.map(t => [t.value, t.label]),
) as Record<CustomerType, string>;

interface FormState {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  customer_types: CustomerType[];
  allow_credit: boolean;
  credit_limit: string;
  enable_wallet: boolean;
  wallet_balance: string;
}

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  email: '',
  birthday: '',
  customer_types: ['vino'],
  allow_credit: false,
  credit_limit: '',
  enable_wallet: false,
  wallet_balance: '',
});

const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── component ─────────────────────────────────────────────────────────────

const VinosCustomersScreen: React.FC<Props> = ({ selectedBranchId, currentUser }) => {
  const [customers, setCustomers] = useState<VinosCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VinosCustomer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // documents in modal
  interface QueuedFile { file: File; description: string }
  const [existingDocs, setExistingDocs] = useState<CustomerDocument[]>([]);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [docDescription, setDocDescription] = useState('');
  const [uploadError, setUploadError] = useState('');

  // confirm delete
  const [deleteTarget, setDeleteTarget] = useState<VinosCustomer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── branch id once ──────────────────────────────────────────────────────
  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  // ── load customers ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vinosCustomersService.getAll(branchDbId ?? undefined);
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  // ── filtered ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  // ── stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   customers.length,
    activos: customers.filter(c => c.status === 'ACTIVO').length,
    riesgo:  customers.filter(c => c.status === 'EN_RIESGO' || c.status === 'DORMIDO').length,
    vip:     customers.filter(c => c.loyalty_level === 'ORO' || c.loyalty_level === 'BLACK').length,
  }), [customers]);

  // ── modal helpers ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setExistingDocs([]);
    setQueuedFiles([]);
    setDocDescription('');
    setUploadError('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = async (c: VinosCustomer) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      birthday: c.birthday ?? '',
      customer_types: c.customer_types?.length ? c.customer_types : ['vino'],
      allow_credit: (c.credit_limit ?? 0) > 0,
      credit_limit: c.credit_limit ? String(c.credit_limit) : '',
      enable_wallet: c.wallet_enabled,
      wallet_balance: c.wallet_balance ? String(c.wallet_balance) : '',
    });
    setQueuedFiles([]);
    setDocDescription('');
    setUploadError('');
    setFormError('');
    setModalOpen(true);
    try {
      const docs = await vinosCustomersService.listDocuments(c.id);
      setExistingDocs(docs);
    } catch (e) {
      console.error(e);
      setExistingDocs([]);
    }
  };

  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const toggleType = (t: CustomerType) => {
    setForm(f => {
      const has = f.customer_types.includes(t);
      const next = has ? f.customer_types.filter(x => x !== t) : [...f.customer_types, t];
      return { ...f, customer_types: next.length ? next : ['vino'] };
    });
  };

  const MAX_DOCS = 2;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    if (existingDocs.length + queuedFiles.length >= MAX_DOCS) {
      setUploadError(`Máximo ${MAX_DOCS} documentos por cliente.`);
      return;
    }
    try {
      validateDocumentFile(file);
      setQueuedFiles(prev => [...prev, { file, description: docDescription.trim() }]);
      setDocDescription('');
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Archivo no válido.');
    }
  };

  const removeQueuedFile = (idx: number) =>
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));

  const removeExistingDoc = async (doc: CustomerDocument) => {
    try {
      await vinosCustomersService.deleteDocument(doc.id);
      if (doc.cloudinary_public_id) {
        try { await vinosDocumentUploadService.delete(doc.cloudinary_public_id, doc.cloudinary_resource_type ?? 'image'); } catch {}
      }
      setExistingDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio.'); return; }
    if (form.customer_types.length === 0) { setFormError('Selecciona al menos un tipo de cliente.'); return; }

    const creditLimit = form.allow_credit && form.credit_limit
      ? Number(form.credit_limit) || 0
      : 0;
    const walletBalance = form.enable_wallet && form.wallet_balance
      ? Number(form.wallet_balance) || 0
      : 0;

    setSaving(true);
    setFormError('');
    try {
      let customerId: string;
      if (editTarget) {
        const updated = await vinosCustomersService.update(editTarget.id, {
          name: form.name.trim(),
          phone: form.phone || null,
          email: form.email || null,
          birthday: form.birthday || null,
          customer_types: form.customer_types,
          credit_limit: creditLimit,
          wallet_enabled: form.enable_wallet,
          wallet_balance: walletBalance,
        });
        customerId = updated.id;
        setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        if (!branchDbId) throw new Error('Sucursal no encontrada en DB vinos.');
        const created = await vinosCustomersService.create({
          branch_id: branchDbId,
          name: form.name.trim(),
          phone: form.phone || null,
          email: form.email || null,
          birthday: form.birthday || null,
          customer_types: form.customer_types,
          credit_limit: creditLimit,
          wallet_enabled: form.enable_wallet,
          wallet_balance: walletBalance,
        });
        customerId = created.id;
        setCustomers(prev => [created, ...prev]);
      }

      if (queuedFiles.length > 0) {
        const uploadedDocs: NewDocumentInput[] = [];
        for (const q of queuedFiles) {
          const up = await vinosDocumentUploadService.upload(q.file, {
            branch_id: branchDbId ? String(branchDbId) : null,
            customer_id: customerId,
          });
          uploadedDocs.push({
            file_name: up.original_filename ?? q.file.name,
            file_url: up.secure_url,
            description: q.description || undefined,
            file_type: up.format ?? undefined,
            file_size_kb: up.bytes ? Math.round(up.bytes / 1024) : undefined,
            cloudinary_public_id: up.public_id ?? undefined,
            cloudinary_resource_type: up.resource_type ?? 'image',
          });
        }
        await vinosCustomersService.addDocuments(customerId, uploadedDocs);
      }

      closeModal();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await vinosCustomersService.deactivate(deleteTarget.id);
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total clientes', value: stats.total,   color: 'text-slate-900' },
          { label: 'Activos',        value: stats.activos, color: 'text-green-600'  },
          { label: 'En riesgo',      value: stats.riesgo,  color: 'text-orange-500' },
          { label: 'ORO / BLACK',    value: stats.vip,     color: 'text-yellow-600' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Buscar por nombre, teléfono o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 transition-colors"
        >
          <Plus size={15} /> Nuevo cliente
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">Cargando clientes…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">Sin resultados</p>
            <p className="mt-2 text-xs text-slate-400">
              {search ? 'Prueba otro término de búsqueda.' : 'Agrega tu primer cliente.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Cliente', 'Teléfono', 'Tipos', 'Nivel', 'Estado', 'Crédito', 'Saldo', 'Total gastado', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(c => {
                  const loy = LOYALTY_CONFIG[c.loyalty_level];
                  const sta = STATUS_CONFIG[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 font-black text-orange-600">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-none">{c.name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(c.last_purchase_date)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.customer_types ?? []).map(t => (
                            <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              {TYPE_LABEL[t] ?? t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-black ${loy.bg} ${loy.text}`}>
                          {loy.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${sta.dot}`} />
                          <span className="text-xs text-slate-600">{sta.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {c.credit_limit > 0 ? formatCurrency(c.credit_limit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {c.wallet_enabled ? formatCurrency(c.wallet_balance) : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(c.total_spent)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                  {editTarget ? 'Editar cliente' : 'Nuevo cliente'}
                </h2>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                  Captura los datos del cliente y sus preferencias comerciales
                </p>
              </div>
              <button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">

              {/* SECCIÓN 1: Datos personales */}
              <section>
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Datos personales</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Teléfono / WhatsApp</label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="55 1234 5678"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Email</label>
                    <input
                      type="email"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha de nacimiento</label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      value={form.birthday}
                      onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              {/* SECCIÓN 2: Tipo de cliente (checkboxes, full width) */}
              <section>
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Tipo de cliente <span className="font-normal normal-case text-slate-400/80">(puede ser más de uno)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {CUSTOMER_TYPES.map(t => {
                    const active = form.customer_types.includes(t.value);
                    return (
                      <label
                        key={t.value}
                        className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 cursor-pointer transition-colors ${
                          active ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                          checked={active}
                          onChange={() => toggleType(t.value)}
                        />
                        <span className={`text-xs font-bold ${active ? 'text-orange-700' : 'text-slate-700'}`}>{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* SECCIÓN 3: Condiciones + Documentos */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Col izquierda: Crédito + Wallet stacked */}
                <div className="space-y-4">
                  {/* Crédito */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">Permitir crédito</span>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                        checked={form.allow_credit}
                        onChange={e => setForm(f => ({ ...f, allow_credit: e.target.checked }))}
                      />
                    </label>
                    {form.allow_credit && (
                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Límite de crédito (MXN)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                          value={form.credit_limit}
                          onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>

                  {/* Wallet */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Wallet size={16} className="text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">Habilitar saldo a favor</span>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                        checked={form.enable_wallet}
                        onChange={e => setForm(f => ({ ...f, enable_wallet: e.target.checked }))}
                      />
                    </label>
                    {form.enable_wallet && (
                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Monto inicial (MXN)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                          value={form.wallet_balance}
                          onChange={e => setForm(f => ({ ...f, wallet_balance: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Col derecha: Documentos */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileText size={16} className="text-slate-500" />
                    <span className="text-sm font-bold text-slate-700">Documentos del cliente</span>
                  </div>

                {/* Existentes */}
                {existingDocs.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {existingDocs.map(d => (
                      <li key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-700">{d.file_name}</p>
                          {d.description && <p className="truncate text-[10px] text-slate-400">{d.description}</p>}
                        </div>
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-slate-400 hover:text-orange-500" title="Ver">
                          <ExternalLink size={14} />
                        </a>
                        <button onClick={() => removeExistingDoc(d)} className="ml-2 text-slate-400 hover:text-red-500" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* En cola (no subido aún) */}
                {queuedFiles.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {queuedFiles.map((q, i) => (
                      <li key={i} className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-orange-700">{q.file.name}</p>
                          <p className="text-[10px] text-orange-400">{(q.file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={() => removeQueuedFile(i)} className="ml-2 text-orange-400 hover:text-red-500" title="Quitar de la cola">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* File picker — bloqueado si llegó al máximo */}
                {existingDocs.length + queuedFiles.length >= MAX_DOCS ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-not-allowed">
                    <Upload size={14} />
                    Límite alcanzado ({MAX_DOCS} documentos)
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white cursor-pointer transition-colors hover:bg-slate-700">
                    <Upload size={14} />
                    Seleccionar archivo
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                )}
                <p className="mt-2 text-[10px] text-slate-400">
                  JPG · PNG · WEBP · PDF · máx 10 MB · {existingDocs.length + queuedFiles.length}/{MAX_DOCS} documentos.
                </p>
                {uploadError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600">{uploadError}</p>
                )}
                </div>
              </section>

              {formError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{formError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-8 py-5 bg-slate-50/50">
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving
                  ? (queuedFiles.length > 0 ? 'Subiendo archivos…' : 'Guardando…')
                  : editTarget ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">¿Eliminar cliente?</h3>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-bold">{deleteTarget.name}</span> se desactivará. No se borran sus ventas.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-2xl bg-red-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VinosCustomersScreen;
