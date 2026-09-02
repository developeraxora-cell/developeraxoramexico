import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, FileText, ExternalLink, CreditCard, Wallet, Upload, Loader2, Settings, MapPin, History, FileDown, Receipt, BanknoteIcon, FileSpreadsheet } from 'lucide-react';
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
import { vinosCustomerMgmtService, type CustomerStats, type WalletMovement, type CreditPayment, type CreditSaleSummary } from '../../services/vinos/customerMgmt.service';
import { supabaseVinos } from '../../services/vinosClient';
import { generateVinosSaleTicket } from '../../services/vinos/saleTicketPdf';
import { generateVinosStatementPdf } from '../../services/vinos/customerStatementPdf';
import { generateVinosWalletHistoryPdf } from '../../services/vinos/walletHistoryPdf';
import { vinosSalesService } from '../../services/vinos/sales.service';
import { logVinosAudit } from '../../services/audit/audit.service';
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

interface CustomerTypeOption {
  value: CustomerType;
  label: string;
}

const DEFAULT_CUSTOMER_TYPES: CustomerTypeOption[] = [
  { value: 'vino',              label: 'Vino' },
  { value: 'whisky',            label: 'Whisky' },
  { value: 'cerveza_artesanal', label: 'Cerveza artesanal' },
  { value: 'tequila',           label: 'Tequila' },
  { value: 'premium',           label: 'Premium' },
  { value: 'fiesta_eventos',    label: 'Fiestas / Eventos' },
];

const DEFAULT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_CUSTOMER_TYPES.map(t => [t.value, t.label]),
) as Record<string, string>;

const humanizeCustomerType = (value: string) =>
  DEFAULT_TYPE_LABEL[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const normalizeCustomerType = (label: string) =>
  label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getCashChange = (cashReceived: number, saleTotal: number) =>
  Math.max(0, Number(cashReceived || 0) - Number(saleTotal || 0));

// ─── países (prefijo telefónico) ─────────────────────────────────────────────

interface Country { code: string; dial: string; name: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'MX', dial: '52',  name: 'México',          flag: '🇲🇽' },
  { code: 'PE', dial: '51',  name: 'Perú',            flag: '🇵🇪' },
  { code: 'US', dial: '1',   name: 'Estados Unidos',  flag: '🇺🇸' },
  { code: 'AR', dial: '54',  name: 'Argentina',       flag: '🇦🇷' },
  { code: 'CO', dial: '57',  name: 'Colombia',        flag: '🇨🇴' },
  { code: 'CL', dial: '56',  name: 'Chile',           flag: '🇨🇱' },
  { code: 'EC', dial: '593', name: 'Ecuador',         flag: '🇪🇨' },
  { code: 'BO', dial: '591', name: 'Bolivia',         flag: '🇧🇴' },
  { code: 'VE', dial: '58',  name: 'Venezuela',       flag: '🇻🇪' },
  { code: 'BR', dial: '55',  name: 'Brasil',          flag: '🇧🇷' },
  { code: 'PY', dial: '595', name: 'Paraguay',        flag: '🇵🇾' },
  { code: 'UY', dial: '598', name: 'Uruguay',         flag: '🇺🇾' },
  { code: 'GT', dial: '502', name: 'Guatemala',       flag: '🇬🇹' },
  { code: 'CR', dial: '506', name: 'Costa Rica',      flag: '🇨🇷' },
  { code: 'PA', dial: '507', name: 'Panamá',          flag: '🇵🇦' },
  { code: 'ES', dial: '34',  name: 'España',          flag: '🇪🇸' },
];

const DEFAULT_DIAL = '52';
const MAX_PHONE_DIGITS = 10;

// dials ordenados por longitud desc para parsear el más específico primero
const DIALS_BY_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

function parsePhone(raw: string): { dial: string; number: string } {
  const cleaned = (raw ?? '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/^\+/, '');
  if (!digits) return { dial: DEFAULT_DIAL, number: '' };
  const match = DIALS_BY_LEN.find(c => digits.startsWith(c.dial));
  if (match) return { dial: match.dial, number: digits.slice(match.dial.length).slice(0, MAX_PHONE_DIGITS) };
  return { dial: DEFAULT_DIAL, number: digits.slice(0, MAX_PHONE_DIGITS) };
}

function buildPhone(dial: string, number: string): string {
  return number ? `+${dial} ${number}` : '';
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parsePhone(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // dial en estado propio: el dial elegido persiste aunque el número esté vacío
  const [dial, setDial] = useState(parsed.dial);
  // sincronizar con value externo solo cuando trae dial reconocible (ej. al editar)
  useEffect(() => {
    const p = parsePhone(value);
    if (value && p.dial !== dial) setDial(p.dial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const selected = COUNTRIES.find(c => c.dial === dial) ?? COUNTRIES[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c => c.dial.includes(q) || c.name.toLowerCase().includes(q));
  }, [search]);

  return (
    <div>
    <div className="relative flex items-stretch gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex h-full items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        >
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="font-bold text-slate-700">+{selected.dial}</span>
          <svg className="h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />
            <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar país o código…"
                className="mb-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400"
              />
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">Sin resultados</p>}
                {filtered.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setDial(c.dial); onChange(buildPhone(c.dial, parsed.number)); setOpen(false); setSearch(''); }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs hover:bg-orange-50 ${c.dial === dial ? 'bg-orange-50' : ''}`}
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1 font-semibold text-slate-700">{c.name}</span>
                    <span className="font-bold text-slate-400">+{c.dial}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <input
        inputMode="numeric"
        value={parsed.number}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS);
          onChange(buildPhone(dial, digits));
        }}
        placeholder="987654321"
        className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </div>
    <p className="mt-1 text-right text-[10px] font-bold text-slate-400">{parsed.number.length} / {MAX_PHONE_DIGITS} dígitos</p>
    </div>
  );
}

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

const VinosCustomersScreen: React.FC<Props> = ({ selectedBranchId, branches, currentUser }) => {
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
  const [customerTypeOptions, setCustomerTypeOptions] = useState<CustomerTypeOption[]>(DEFAULT_CUSTOMER_TYPES);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeError, setNewTypeError] = useState('');

  // documents in modal
  interface QueuedFile { file: File; description: string }
  const [existingDocs, setExistingDocs] = useState<CustomerDocument[]>([]);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [docDescription, setDocDescription] = useState('');
  const [uploadError, setUploadError] = useState('');

  // confirm delete
  const [deleteTarget, setDeleteTarget] = useState<VinosCustomer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Gestionar cliente modal + sub-modales ─────────────
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<VinosCustomer | null>(null);
  const [manageStats, setManageStats] = useState<CustomerStats>({ credit_limit: 0, debt: 0, available: 0, wallet_balance: 0 });
  const [manageLoading, setManageLoading] = useState(false);

  type SubAction = null | 'edit' | 'recharge' | 'walletHistory' | 'creditNotes' | 'cashSales' | 'creditHistory' | 'registerPayment';
  const [subAction, setSubAction] = useState<SubAction>(null);

  // Recargar saldo
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeDepositType, setRechargeDepositType] = useState('');
  const [rechargeNotes, setRechargeNotes] = useState('');
  const [rechargeProcessing, setRechargeProcessing] = useState(false);

  // Pagination state shared
  const PAGE_SIZE = 5;
  const [pgWallet, setPgWallet] = useState(1);
  const [pgPayments, setPgPayments] = useState(1);
  const [pgCreditNotes, setPgCreditNotes] = useState(1);
  const [pgCashSales, setPgCashSales] = useState(1);

  // Search
  const [searchPayments, setSearchPayments] = useState('');
  const [searchCreditNotes, setSearchCreditNotes] = useState('');

  // Edit payment + delete
  const [editPaymentTarget, setEditPaymentTarget] = useState<CreditPayment | null>(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<CreditPayment | null>(null);
  const [deletePaymentNote, setDeletePaymentNote] = useState('');
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<CreditSaleSummary | null>(null);
  const [deleteNoteJustif, setDeleteNoteJustif] = useState('');

  // Historial saldo
  const [walletMovements, setWalletMovements] = useState<WalletMovement[]>([]);

  // Historial abonos
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>([]);

  // Notas de credito
  const [creditNotes, setCreditNotes] = useState<CreditSaleSummary[]>([]);

  // Ventas efectivo
  const [cashSales, setCashSales] = useState<Array<{ id: string; created_at: string; total: number; payment_method: string; cash_received: number; notes: string | null }>>([]);

  // Registrar abono
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'SALDO_FAVOR'>('EFECTIVO');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaleId, setPaymentSaleId] = useState<string>('');
  const [paymentEvidenceFiles, setPaymentEvidenceFiles] = useState<File[]>([]);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const MAX_EVIDENCE_FILES = 4;

  // Modal evidencias abono
  const [evidencesPayment, setEvidencesPayment] = useState<CreditPayment | null>(null);
  const [evidencesList, setEvidencesList] = useState<Array<{ id: string; file_url: string; file_name: string; file_size_kb: number | null; cloudinary_public_id: string | null; uploaded_at: string }>>([]);
  const [evidencesUploading, setEvidencesUploading] = useState(false);
  const [evidencesQueueFile, setEvidencesQueueFile] = useState<File | null>(null);

  const [actionError, setActionError] = useState('');

  // ── branch id once ──────────────────────────────────────────────────────
  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  // ── load customers + deudas ──────────────────────────────────────────────
  const [debtsMap, setDebtsMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, debts] = await Promise.all([
        vinosCustomersService.getAll(branchDbId ?? undefined),
        vinosCustomerMgmtService.getDebtsMap(branchDbId ?? undefined),
      ]);
      setCustomers(data);
      setDebtsMap(debts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const existingTypes = customers.flatMap(c => c.customer_types ?? []);
    if (existingTypes.length === 0) return;
    setCustomerTypeOptions(prev => {
      const nextMap = new Map(prev.map(option => [option.value, option]));
      existingTypes.forEach(type => {
        if (type && !nextMap.has(type)) {
          nextMap.set(type, { value: type, label: humanizeCustomerType(type) });
        }
      });
      return Array.from(nextMap.values());
    });
  }, [customers]);

  const customerTypeLabelMap = useMemo(
    () => Object.fromEntries(customerTypeOptions.map(option => [option.value, option.label])) as Record<string, string>,
    [customerTypeOptions]
  );

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

  const openTypeModal = () => {
    setNewTypeLabel('');
    setNewTypeError('');
    setTypeModalOpen(true);
  };

  const closeTypeModal = () => {
    setTypeModalOpen(false);
    setNewTypeLabel('');
    setNewTypeError('');
  };

  const handleCreateCustomerType = () => {
    const label = newTypeLabel.trim();
    const value = normalizeCustomerType(label);
    if (!label) {
      setNewTypeError('Escribe el nombre del tipo de cliente.');
      return;
    }
    if (!value) {
      setNewTypeError('Usa al menos una letra o número.');
      return;
    }
    const labelExists = customerTypeOptions.some(option => option.label.trim().toLowerCase() === label.toLowerCase());
    const valueExists = customerTypeOptions.some(option => option.value === value);
    if (labelExists || valueExists) {
      setNewTypeError('Ese tipo de cliente ya existe.');
      return;
    }

    const nextOption = { value, label };
    setCustomerTypeOptions(prev => [...prev, nextOption]);
    setForm(prev => ({
      ...prev,
      customer_types: prev.customer_types.includes(value) ? prev.customer_types : [...prev.customer_types, value],
    }));
    closeTypeModal();
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

  // ── Gestionar cliente handlers ─────────────────────────
  const openManage = async (c: VinosCustomer) => {
    setManageTarget(c);
    setManageOpen(true);
    setSubAction(null);
    setActionError('');
    setManageLoading(true);
    try {
      const stats = await vinosCustomerMgmtService.getStats(c.id);
      setManageStats(stats);
    } catch (e) { console.error(e); }
    finally { setManageLoading(false); }
  };

  const closeManage = () => {
    setManageOpen(false);
    setManageTarget(null);
    setSubAction(null);
  };

  const refreshStats = async () => {
    if (!manageTarget) return;
    try {
      const stats = await vinosCustomerMgmtService.getStats(manageTarget.id);
      setManageStats(stats);
      // Reload customer in main list
      const { data } = await supabaseVinos.from('customers').select('*').eq('id', manageTarget.id).single();
      if (data) {
        setCustomers(prev => prev.map(c => c.id === manageTarget.id ? data as VinosCustomer : c));
        setManageTarget(data as VinosCustomer);
      }
    } catch (e) { console.error(e); }
  };

  // Sub: editar datos (reusa modal existente)
  const subEditDatos = () => {
    if (!manageTarget) return;
    openEdit(manageTarget);
    setManageOpen(false);
  };

  // ── Exportar PDFs ──────────────────────────────────────
  const exportStatementPdf = async () => {
    if (!manageTarget) { alert('Selecciona cliente primero'); return; }
    try {
      console.log('[PDF] Generando estado de cuenta…', manageTarget.id);
      const [notes, payments] = await Promise.all([
        vinosCustomerMgmtService.listCreditSales(manageTarget.id),
        vinosCustomerMgmtService.listCreditPayments(manageTarget.id),
      ]);

      // Fetch items por cada venta a crédito
      const noteIds = notes.map(n => n.id);
      interface SaleItemRaw {
        sale_id: string; qty: number; line_total: number; price_type: string; factor_used: number;
        product?: { name: string } | { name: string }[] | null;
        uom?: { uom?: { name: string } | { name: string }[] | null } | { uom?: { name: string } | { name: string }[] | null }[] | null;
      }
      const { data: rawItems } = noteIds.length > 0
        ? await supabaseVinos
            .from('sale_items')
            .select('sale_id, qty, line_total, price_type, factor_used, product:products(name), uom:product_uoms(uom:uoms(name))')
            .in('sale_id', noteIds)
        : { data: [] };
      const itemsBySale: Record<string, Array<{ product_name: string; presentation: string; sale_type: string; qty: number; subtotal: number }>> = {};
      (rawItems as SaleItemRaw[] ?? []).forEach(r => {
        const prod = Array.isArray(r.product) ? r.product[0] : r.product;
        const uomWrap = Array.isArray(r.uom) ? r.uom[0] : r.uom;
        const uomInner = uomWrap?.uom ? (Array.isArray(uomWrap.uom) ? uomWrap.uom[0] : uomWrap.uom) : null;
        itemsBySale[r.sale_id] = itemsBySale[r.sale_id] || [];
        itemsBySale[r.sale_id].push({
          product_name: prod?.name ?? 'PRODUCTO',
          presentation: uomInner?.name ?? '-',
          sale_type: r.price_type === 'MEDIO_MAYOREO' ? 'M. Mayoreo' : r.price_type === 'MAYOREO' ? 'Mayoreo' : 'Menudeo',
          qty: Number(r.qty),
          subtotal: Number(r.line_total),
        });
      });

      const formattedNotes = notes.map(n => {
        const issue = new Date(n.created_at);
        const due = new Date(issue);
        due.setDate(due.getDate() + 30);
        return {
          id: n.id,
          folio: `V-${n.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
          emission: issue.toISOString().slice(0, 10),
          due_date: due.toISOString().slice(0, 10),
          total: n.total,
          paid: n.paid,
          pending: n.pending,
          status: (n.pending === 0 ? 'PAGADA' : n.paid > 0 ? 'PARCIAL' : 'ABIERTA') as 'PAGADA' | 'PARCIAL' | 'ABIERTA',
        };
      });

      await generateVinosStatementPdf({
        branchName: branches.find(b => b.id === selectedBranchId)?.name ?? 'CASA TAHONA',
        customerName: manageTarget.name,
        customerPhone: manageTarget.phone,
        generatedAt: new Date().toLocaleString('es-MX'),
        limit: manageStats.credit_limit,
        debt: manageStats.debt,
        available: manageStats.available,
        notes: formattedNotes,
        payments: payments.map(p => ({
          note_id: p.sale_id ?? '',
          paid_at: p.created_at,
          amount: p.amount,
          method: p.payment_method,
          reference: p.reference,
        })),
        saleDetails: notes.map(n => ({
          note_id: n.id,
          folio: `V-${n.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
          created_at: n.created_at,
          items: itemsBySale[n.id] ?? [],
        })),
      });
      console.log('[PDF] Estado de cuenta OK');
    } catch (e) {
      console.error('[PDF] Error estado cuenta:', e);
      alert(`Error al generar PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const exportWalletPdf = async () => {
    if (!manageTarget) { alert('Selecciona cliente primero'); return; }
    try {
      console.log('[PDF] Generando wallet…', manageTarget.id);
      const list = await vinosCustomerMgmtService.listWalletMovements(manageTarget.id);
      const recargas = list.filter(m => m.amount > 0).map(m => ({
        date: new Date(m.created_at).toLocaleString('es-MX'),
        reference: m.type === 'APERTURA'
          ? 'APERTURA'
          : (m.related_sale_id
              ? `V-${m.related_sale_id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
              : (m.deposit_type ?? m.type)),
        user: m.created_by_name ?? '-',
        amount: m.amount,
      }));
      const gastos = list.filter(m => m.amount < 0).map(m => ({
        date: new Date(m.created_at).toLocaleString('es-MX'),
        reference: m.related_sale_id
          ? `V-${m.related_sale_id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
          : m.type,
        user: m.created_by_name ?? '-',
        amount: Math.abs(m.amount),
      }));
      const opening = recargas.length > 0 ? recargas[recargas.length - 1].amount : 0;
      const lastRecharge = recargas.length > 0 ? recargas[0].date : null;
      await generateVinosWalletHistoryPdf({
        branchName: branches.find(b => b.id === selectedBranchId)?.name ?? 'CASA TAHONA',
        customerName: manageTarget.name,
        generatedAt: new Date().toLocaleString('es-MX'),
        currentBalance: manageStats.wallet_balance,
        opening,
        lastRecharge,
        recargas,
        gastos,
      });
      console.log('[PDF] Wallet OK');
    } catch (e) {
      console.error('[PDF] Error wallet:', e);
      alert(`Error al generar PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ── Acciones sobre payments / sales ────────────────────
  // Abrir modal evidencias
  const openEvidences = async (p: CreditPayment) => {
    setEvidencesPayment(p);
    setEvidencesList([]);
    try {
      const list = await vinosCustomerMgmtService.listPaymentEvidences(p.id);
      setEvidencesList(list);
    } catch (e) { console.error(e); }
  };

  const closeEvidences = () => { setEvidencesPayment(null); setEvidencesList([]); setEvidencesQueueFile(null); };

  const uploadEvidenceFromModal = async () => {
    if (!evidencesPayment || !evidencesQueueFile || !manageTarget) return;
    setEvidencesUploading(true);
    try {
      const up = await vinosDocumentUploadService.upload(evidencesQueueFile, {
        branch_id: branchDbId ? String(branchDbId) : null,
        customer_id: manageTarget.id,
      });
      await vinosCustomerMgmtService.addPaymentEvidences(evidencesPayment.id, [{
        file_url: up.secure_url,
        file_name: up.original_filename ?? evidencesQueueFile.name,
        file_size_kb: up.bytes ? Math.round(up.bytes / 1024) : undefined,
        cloudinary_public_id: up.public_id ?? undefined,
        cloudinary_resource_type: up.resource_type ?? 'image',
      }]);
      const list = await vinosCustomerMgmtService.listPaymentEvidences(evidencesPayment.id);
      setEvidencesList(list);
      setEvidencesQueueFile(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al subir');
    } finally { setEvidencesUploading(false); }
  };

  const removeEvidence = async (id: string) => {
    if (!evidencesPayment) return;
    try {
      await vinosCustomerMgmtService.deletePaymentEvidence(id);
      const list = await vinosCustomerMgmtService.listPaymentEvidences(evidencesPayment.id);
      setEvidencesList(list);
    } catch (e) { console.error(e); }
  };

  const handleDeletePayment = async () => {
    if (!deletePaymentTarget || !manageTarget) return;
    if (!deletePaymentNote.trim()) { setActionError('Observación obligatoria.'); return; }
    try {
      await vinosCustomerMgmtService.deleteCreditPayment(deletePaymentTarget.id);
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'cliente',
        entity_id: deletePaymentTarget.id,
        description: `Abono eliminado · ${formatCurrency(deletePaymentTarget.amount)} · ${deletePaymentTarget.payment_method}`,
        justification: deletePaymentNote.trim(),
        previous_data: { amount: deletePaymentTarget.amount, method: deletePaymentTarget.payment_method, customer_id: manageTarget.id, customer_name: manageTarget.name },
      });
      const list = await vinosCustomerMgmtService.listCreditPayments(manageTarget.id);
      setCreditPayments(list);
      await refreshStats();
      setDeletePaymentTarget(null);
      setDeletePaymentNote('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteNoteSale = async () => {
    if (!deleteNoteTarget || !manageTarget) return;
    if (!deleteNoteJustif.trim()) { setActionError('Observación obligatoria.'); return; }
    try {
      await vinosSalesService.softDelete(deleteNoteTarget.id, deleteNoteJustif.trim());
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'venta',
        entity_id: deleteNoteTarget.id,
        description: `Venta a crédito eliminada · ${formatCurrency(deleteNoteTarget.total)}`,
        justification: deleteNoteJustif.trim(),
        previous_data: { total: deleteNoteTarget.total, customer_id: manageTarget.id, customer_name: manageTarget.name },
      });
      const list = await vinosCustomerMgmtService.listCreditSales(manageTarget.id);
      setCreditNotes(list);
      await refreshStats();
      setDeleteNoteTarget(null);
      setDeleteNoteJustif('');
    } catch (e) { console.error(e); }
  };

  const printSale = async (saleId: string) => {
    try {
      const { data: sale } = await supabaseVinos
        .from('sales')
        .select('*, customer:customers(name)')
        .eq('id', saleId)
        .single();
      const { data: items } = await supabaseVinos
        .from('sale_items')
        .select('qty, unit_price, line_total, factor_used, price_type, product:products(name,sku), uom:product_uoms(id, uom:uoms(name))')
        .eq('sale_id', saleId);
      interface ItemRow {
        qty: number; unit_price: number; line_total: number; factor_used: number; price_type: string;
        product?: { name: string; sku: string } | { name: string; sku: string }[] | null;
        uom?: { uom?: { name: string } | { name: string }[] | null } | { uom?: { name: string } | { name: string }[] | null }[] | null;
      }
      const mappedItems = (items as ItemRow[] ?? []).map(r => {
        const product = Array.isArray(r.product) ? r.product[0] : r.product;
        const uomWrap = Array.isArray(r.uom) ? r.uom[0] : r.uom;
        const uomInner = uomWrap?.uom ? (Array.isArray(uomWrap.uom) ? uomWrap.uom[0] : uomWrap.uom) : null;
        return {
          name: product?.name ?? 'PRODUCTO',
          presentation: `${uomInner?.name ?? '-'} (x${Number(r.factor_used).toFixed(2)})`,
          priceType: r.price_type,
          qty: Number(r.qty),
          unitPrice: Number(r.unit_price),
          subtotal: Number(r.line_total ?? r.qty * r.unit_price),
        };
      });
      await generateVinosSaleTicket({
        saleId: sale.id,
        createdAt: sale.created_at,
        branchName: branches.find(b => b.id === selectedBranchId)?.name ?? 'CASA TAHONA',
        customerName: sale.customer?.name ?? 'PUBLICO GENERAL',
        cashierName: currentUser.name,
        paymentMethod: sale.payment_method,
        priceType: sale.price_type,
        walletUsed: Number(sale.wallet_used ?? 0),
        creditUsed: Number(sale.credit_used ?? 0),
        cashReceived: Number(sale.cash_received ?? 0),
        cashChange: sale.payment_method === 'EFECTIVO' ? getCashChange(Number(sale.cash_received ?? 0), Number(sale.total ?? 0)) : 0,
        saleNotes: sale.notes,
        items: mappedItems,
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount_amount ?? 0),
        total: Number(sale.total),
        discountCode: (sale as { promotion_code?: string | null; coupon_code?: string | null }).promotion_code ?? (sale as { coupon_code?: string | null }).coupon_code ?? null,
      });
    } catch (e) { console.error(e); }
  };

  // Sub: recargar saldo
  const openRecharge = () => {
    setSubAction('recharge');
    setRechargeAmount('');
    setRechargeNotes('');
    setActionError('');
  };

  const doRecharge = async () => {
    if (!manageTarget) return;
    const amt = Number(rechargeAmount);
    if (!amt || amt <= 0) { setActionError('Monto debe ser mayor a 0.'); return; }
    if (!rechargeDepositType) { setActionError('Selecciona tipo de depósito.'); return; }
    setRechargeProcessing(true);
    setActionError('');
    try {
      await vinosCustomerMgmtService.rechargeWallet({
        customer_id: manageTarget.id,
        amount: amt,
        deposit_type: rechargeDepositType,
        notes: rechargeNotes.trim() || undefined,
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'CREAR',
        entity_type: 'cliente',
        entity_id: manageTarget.id,
        description: `Recarga saldo a favor · ${formatCurrency(amt)} · ${rechargeDepositType}`,
        justification: rechargeNotes.trim() || null,
        new_data: { amount: amt, deposit_type: rechargeDepositType, customer_name: manageTarget.name },
      });
      await refreshStats();
      setRechargeAmount(''); setRechargeDepositType(''); setRechargeNotes('');
      setSubAction(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Error al recargar.');
    }
    finally { setRechargeProcessing(false); }
  };

  // Sub: historial saldo
  const openWalletHistory = async () => {
    if (!manageTarget) return;
    setSubAction('walletHistory');
    setActionError('');
    try {
      const list = await vinosCustomerMgmtService.listWalletMovements(manageTarget.id);
      setWalletMovements(list);
    } catch (e) { console.error(e); }
  };

  // Sub: historial abonos
  const openCreditHistory = async () => {
    if (!manageTarget) return;
    setSubAction('creditHistory');
    setActionError('');
    try {
      const list = await vinosCustomerMgmtService.listCreditPayments(manageTarget.id);
      setCreditPayments(list);
    } catch (e) { console.error(e); }
  };

  // Sub: notas de credito
  const openCreditNotes = async () => {
    if (!manageTarget) return;
    setSubAction('creditNotes');
    setActionError('');
    try {
      const list = await vinosCustomerMgmtService.listCreditSales(manageTarget.id);
      setCreditNotes(list);
    } catch (e) { console.error(e); }
  };

  // Sub: ventas efectivo
  const openCashSales = async () => {
    if (!manageTarget) return;
    setSubAction('cashSales');
    setActionError('');
    try {
      const list = await vinosCustomerMgmtService.listCashSales(manageTarget.id);
      setCashSales(list);
    } catch (e) { console.error(e); }
  };

  // Sub: registrar abono — primero seleccionar nota
  const openRegisterPayment = async () => {
    if (!manageTarget) return;
    setSubAction('registerPayment');
    setPaymentAmount('');
    setPaymentMethod('EFECTIVO');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentSaleId('');
    setPaymentEvidenceFiles([]);
    setActionError('');
    setPgCreditNotes(1);
    try {
      const list = await vinosCustomerMgmtService.listCreditSales(manageTarget.id);
      setCreditNotes(list);
    } catch (e) { console.error(e); }
  };

  const doRegisterPayment = async () => {
    if (!manageTarget) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) { setActionError('Monto debe ser mayor a 0.'); return; }
    setPaymentProcessing(true);
    setActionError('');
    try {
      // Insertar payment primero
      const { data: paymentRow, error: insErr } = await supabaseVinos
        .from('credit_payments')
        .insert({
          customer_id: manageTarget.id,
          sale_id: paymentSaleId || null,
          amount: amt,
          payment_method: paymentMethod,
          reference: paymentReference.trim() || null,
          notes: paymentNotes.trim() || null,
          created_by: currentUser.id,
        })
        .select('id')
        .single();
      if (insErr || !paymentRow) throw insErr ?? new Error('No se pudo crear el abono');

      // Si SALDO_FAVOR — descontar wallet
      if (paymentMethod === 'SALDO_FAVOR') {
        const { data: cust } = await supabaseVinos
          .from('customers')
          .select('wallet_balance')
          .eq('id', manageTarget.id)
          .single();
        const balance = Number(cust?.wallet_balance ?? 0);
        await supabaseVinos
          .from('customers')
          .update({ wallet_balance: Math.max(0, balance - amt), updated_at: new Date().toISOString() })
          .eq('id', manageTarget.id);
        await supabaseVinos.from('customer_wallet_movements').insert({
          customer_id: manageTarget.id,
          amount: -amt,
          type: 'USO',
          related_sale_id: paymentSaleId || null,
          notes: `Abono a crédito${paymentReference ? ` ref: ${paymentReference}` : ''}`,
          created_by: currentUser.id,
          created_by_name: currentUser.name,
        });
      }

      // Subir evidencias (multi)
      if (paymentEvidenceFiles.length > 0) {
        const evidences = [];
        for (const file of paymentEvidenceFiles) {
          const up = await vinosDocumentUploadService.upload(file, {
            branch_id: branchDbId ? String(branchDbId) : null,
            customer_id: manageTarget.id,
          });
          evidences.push({
            file_url: up.secure_url,
            file_name: up.original_filename ?? file.name,
            file_size_kb: up.bytes ? Math.round(up.bytes / 1024) : undefined,
            cloudinary_public_id: up.public_id ?? undefined,
            cloudinary_resource_type: up.resource_type ?? 'image',
          });
        }
        await vinosCustomerMgmtService.addPaymentEvidences(paymentRow.id, evidences);
      }

      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'CREAR',
        entity_type: 'cliente',
        entity_id: paymentRow.id,
        description: `Abono crédito · ${formatCurrency(amt)} · ${paymentMethod}`,
        justification: paymentNotes.trim() || null,
        new_data: { amount: amt, method: paymentMethod, customer_id: manageTarget.id, customer_name: manageTarget.name, sale_id: paymentSaleId || null, reference: paymentReference || null },
      });

      await refreshStats();
      const [payList, notesList] = await Promise.all([
        vinosCustomerMgmtService.listCreditPayments(manageTarget.id),
        vinosCustomerMgmtService.listCreditSales(manageTarget.id),
      ]);
      setCreditPayments(payList);
      setCreditNotes(notesList);
      setPaymentEvidenceFiles([]);
      setPaymentAmount(''); setPaymentReference(''); setPaymentNotes(''); setPaymentSaleId('');
      setSubAction(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Error al registrar abono.');
    }
    finally { setPaymentProcessing(false); }
  };

  const [deleteCustomerNote, setDeleteCustomerNote] = useState('');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteCustomerNote.trim()) { setActionError('Observación obligatoria.'); return; }
    setDeleting(true);
    try {
      await vinosCustomersService.deactivate(deleteTarget.id);
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'cliente',
        entity_id: deleteTarget.id,
        description: `Cliente desactivado · ${deleteTarget.name}`,
        justification: deleteCustomerNote.trim(),
        previous_data: { name: deleteTarget.name, credit_limit: deleteTarget.credit_limit, wallet_balance: deleteTarget.wallet_balance },
      });
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteCustomerNote('');
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
                  {['Cliente', 'Teléfono', 'Tipos', 'Nivel', 'Estado', 'Crédito', 'Saldo', 'Deuda actual', ''].map(h => (
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
                              {customerTypeLabelMap[t] ?? humanizeCustomerType(t)}
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
                      <td className={`px-4 py-3 font-bold ${debtsMap[c.id] > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {formatCurrency(debtsMap[c.id] ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openManage(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                            title="Gestionar cliente"
                          >
                            <Settings size={14} />
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
                    <PhoneInput
                      value={form.phone}
                      onChange={v => setForm(f => ({ ...f, phone: v }))}
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
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Tipo de cliente <span className="font-normal normal-case text-slate-400/80">(puede ser más de uno)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={openTypeModal}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
                  >
                    <Plus size={13} /> Nuevo tipo
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {customerTypeOptions.map(t => {
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

      {typeModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Nuevo tipo de cliente</h3>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">Crea una etiqueta para clasificar clientes.</p>
              </div>
              <button onClick={closeTypeModal} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Nombre del tipo</label>
              <input
                autoFocus
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                value={newTypeLabel}
                onChange={e => {
                  setNewTypeLabel(e.target.value);
                  if (newTypeError) setNewTypeError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateCustomerType();
                }}
                placeholder="Ej. Coleccionista, Distribuidor, Restaurante"
              />
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                Se guardará como opción seleccionable y quedará asociada al cliente al guardar.
              </p>
              {newTypeError && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{newTypeError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                onClick={closeTypeModal}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCustomerType}
                className="rounded-2xl bg-orange-600 px-5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500"
              >
                Agregar tipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">¿Eliminar cliente?</h3>
                <p className="text-xs text-slate-500"><span className="font-bold">{deleteTarget.name}</span> se desactivará. No se borran sus ventas.</p>
              </div>
            </div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-red-500">Motivo / observación *</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
              value={deleteCustomerNote}
              onChange={e => setDeleteCustomerNote(e.target.value)}
              placeholder="Explica por qué se elimina (obligatorio)"
            />
            {actionError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{actionError}</p>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteCustomerNote(''); setActionError(''); }}
                className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deleteCustomerNote.trim()}
                className="flex-1 rounded-2xl bg-red-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL GESTIONAR CLIENTE ─────────────────────── */}
      {manageOpen && manageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl h-[50vh] rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight">Gestionar cliente</h2>
                <p className="mt-0.5 text-[11px] font-bold text-orange-400">{manageTarget.name.toUpperCase()}</p>
              </div>
              <button onClick={closeManage} className="rounded-xl bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50">
              {subAction === null && (
                <div className="p-6 space-y-5">
                  {/* 4 KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Límite',      value: formatCurrency(manageStats.credit_limit), color: 'text-slate-900' },
                      { label: 'Deuda actual', value: formatCurrency(manageStats.debt),         color: 'text-red-500' },
                      { label: 'Disponible',   value: formatCurrency(manageStats.available),    color: 'text-green-600' },
                      { label: 'Saldo a favor', value: formatCurrency(manageStats.wallet_balance), color: 'text-purple-600' },
                    ].map(k => (
                      <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k.label}</p>
                        <p className={`mt-1 text-2xl font-black ${k.color}`}>{manageLoading ? '…' : k.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* 3 Paneles */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Cliente */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Cliente</h4>
                      <PanelButton icon={<Pencil size={16} className="text-orange-500"/>} title="Editar datos" subtitle="Modifica nombre, teléfono y límite" onClick={subEditDatos}/>
                      <PanelButton icon={<FileDown size={16} className="text-orange-500"/>} title="Exportar PDF" subtitle="Estado de cuenta completo" onClick={exportStatementPdf}/>
                    </div>

                    {/* Crédito */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Crédito</h4>
                      <PanelButton icon={<History size={16} className="text-blue-500"/>} title="Historial de abonos" subtitle="Abonos registrados y evidencias" onClick={openCreditHistory}/>
                      <PanelButton icon={<Receipt size={16} className="text-blue-500"/>} title="Notas de crédito" subtitle="Ventas a crédito con saldo" onClick={openCreditNotes}/>
                      <PanelButton icon={<BanknoteIcon size={16} className="text-blue-500"/>} title="Registrar abono" subtitle="Captura abono para deudas" onClick={openRegisterPayment}/>
                    </div>

                    {/* Saldo a favor */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Saldo a favor</h4>
                      <PanelButton icon={<CreditCard size={16} className="text-purple-500"/>} title="Recargar saldo" subtitle="Aumenta saldo disponible" onClick={openRecharge}/>
                      <PanelButton icon={<History size={16} className="text-purple-500"/>} title="Historial de saldo" subtitle="Recargas y consumos" onClick={openWalletHistory}/>
                      <PanelButton icon={<FileDown size={16} className="text-purple-500"/>} title="Exportar historial" subtitle="PDF de movimientos" onClick={exportWalletPdf}/>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-action: Recargar saldo */}
              {subAction === 'recharge' && (
                <SubPanel title="Recargar saldo a favor" onBack={() => setSubAction(null)}>
                  <div className="flex justify-center">
                    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-purple-500">Saldo actual</p>
                          <p className="mt-1 text-2xl font-black text-purple-700">{formatCurrency(manageStats.wallet_balance)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Monto de recarga *</label>
                          <input
                            type="number" min="0" step="0.01" autoFocus
                            className="mt-1 w-full bg-transparent text-2xl font-black outline-none"
                            value={rechargeAmount}
                            onChange={e => setRechargeAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de depósito *</label>
                          <select
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold outline-none focus:border-purple-400"
                            value={rechargeDepositType}
                            onChange={e => setRechargeDepositType(e.target.value)}
                          >
                            <option value="">Seleccione una opción</option>
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="TRANSFERENCIA">Transferencia</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="TARJETA">Tarjeta</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Observación</label>
                          <input
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                            value={rechargeNotes}
                            onChange={e => setRechargeNotes(e.target.value)}
                            placeholder="Observación de la recarga"
                          />
                        </div>
                      </div>

                      {actionError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{actionError}</p>}

                      <button
                        onClick={doRecharge}
                        disabled={rechargeProcessing}
                        className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl bg-purple-600 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-purple-500 disabled:opacity-40"
                      >
                        {rechargeProcessing && <Loader2 size={14} className="animate-spin"/>}
                        {rechargeProcessing ? 'Procesando…' : `Guardar recarga ${formatCurrency(Number(rechargeAmount) || 0)}`}
                      </button>
                    </div>
                  </div>
                </SubPanel>
              )}

              {/* Sub-action: Historial saldo */}
              {subAction === 'walletHistory' && (
                <SubPanel title="Historial de saldo a favor" onBack={() => setSubAction(null)}>
                  {(() => {
                    // Cómputo SALDO ANTES/DESPUÉS — ordenar cronológicamente ASC y acumular
                    const asc = [...walletMovements].sort((a, b) =>
                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );
                    let running = 0;
                    const enriched = asc.map(m => {
                      const before = running;
                      running += Number(m.amount);
                      return { ...m, balance_before: before, balance_after: running };
                    });
                    // Mostrar DESC
                    const desc = [...enriched].reverse();

                    const aperturaMov = enriched.find(m => m.type === 'APERTURA');
                    const ultimaRecarga = desc.find(m => m.type === 'RECARGA');

                    return (
                      <>
                        {/* Stats header */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo actual</p>
                            <p className="mt-1 text-2xl font-black text-green-600">{formatCurrency(manageStats.wallet_balance)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monto de apertura</p>
                            <p className="mt-1 text-2xl font-black text-slate-900">{formatCurrency(aperturaMov?.amount ?? 0)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última recarga</p>
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              {ultimaRecarga ? new Date(ultimaRecarga.created_at).toLocaleString('es-MX') : 'Sin recargas'}
                            </p>
                          </div>
                        </div>

                        {desc.length === 0 ? (
                          <p className="py-6 text-center text-xs text-slate-400">Sin movimientos</p>
                        ) : (() => {
                          const total = desc.length;
                          const totalPg = Math.max(1, Math.ceil(total / PAGE_SIZE));
                          const start = (pgWallet - 1) * PAGE_SIZE;
                          const slice = desc.slice(start, start + PAGE_SIZE);
                          const typeColor = (t: string) =>
                            t === 'APERTURA' ? 'bg-blue-100 text-blue-700' :
                            t === 'RECARGA' ? 'bg-green-100 text-green-700' :
                            t === 'USO' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700';
                          const typeLabel = (t: string) =>
                            t === 'USO' ? 'USO VENTA' : t;
                          return (
                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-900 text-white">
                                  <tr>{['Fecha','Tipo','Monto','Saldo Antes','Saldo Después','Usuario','Referencia'].map(h => (
                                    <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                                  ))}</tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {slice.map(m => (
                                    <tr key={m.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-2 text-xs text-slate-600">{new Date(m.created_at).toLocaleString('es-MX')}</td>
                                      <td className="px-4 py-2"><span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${typeColor(m.type)}`}>{typeLabel(m.type)}</span></td>
                                      <td className={`px-4 py-2 text-sm font-black ${m.amount >= 0 ? 'text-slate-900' : 'text-red-600'}`}>{formatCurrency(Math.abs(m.amount))}</td>
                                      <td className="px-4 py-2 text-xs text-slate-500">{formatCurrency(m.balance_before)}</td>
                                      <td className="px-4 py-2 text-xs font-black text-green-600">{formatCurrency(m.balance_after)}</td>
                                      <td className="px-4 py-2 text-xs text-slate-600">{m.created_by_name ?? 'Sistema'}</td>
                                      <td className="px-4 py-2 text-xs text-slate-500 italic">
                                        {m.related_sale_id ? `V-${m.related_sale_id.replace(/-/g, '').slice(0, 6).toUpperCase()}` : (m.type === 'APERTURA' ? 'APERTURA' : (m.deposit_type ?? '—'))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>Mostrando {Math.min(start + 1, total)}-{Math.min(start + PAGE_SIZE, total)} de {total}</span>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setPgWallet(p => Math.max(1, p - 1))} disabled={pgWallet <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                                  <span className="px-2">{pgWallet} / {totalPg}</span>
                                  <button onClick={() => setPgWallet(p => Math.min(totalPg, p + 1))} disabled={pgWallet >= totalPg} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </SubPanel>
              )}

              {/* Sub-action: Historial abonos */}
              {subAction === 'creditHistory' && (
                <SubPanel title="Historial de abonos" onBack={() => setSubAction(null)}>
                  {/* Search */}
                  <div className="mb-4 relative max-w-xl">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                      placeholder="Buscar por folio, nota de venta o referencia…"
                      value={searchPayments}
                      onChange={e => { setSearchPayments(e.target.value); setPgPayments(1); }}
                    />
                  </div>
                  {(() => {
                    const filtered = creditPayments.filter(p => {
                      const q = searchPayments.toLowerCase().trim();
                      if (!q) return true;
                      return (p.reference ?? '').toLowerCase().includes(q) || (p.sale_id ?? '').toLowerCase().includes(q) || (p.notes ?? '').toLowerCase().includes(q);
                    });
                    if (filtered.length === 0) return <p className="py-6 text-center text-xs text-slate-400">Sin abonos registrados</p>;
                    const totalPg = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                    const start = (pgPayments - 1) * PAGE_SIZE;
                    const slice = filtered.slice(start, start + PAGE_SIZE);
                    return (
                      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-900 text-white">
                            <tr>{['Fecha','Folio','Método','Monto','Referencia','Nota','Acción'].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {slice.map(p => (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs text-slate-600">{new Date(p.created_at).toLocaleString('es-MX')}</td>
                                <td className="px-4 py-2 text-xs font-mono font-bold text-slate-700">{p.sale_id ? `V-${p.sale_id.slice(0, 6).toUpperCase()}` : '—'}</td>
                                <td className="px-4 py-2"><span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{p.payment_method}</span></td>
                                <td className="px-4 py-2 text-sm font-black text-green-600">{formatCurrency(p.amount)}</td>
                                <td className="px-4 py-2 text-xs text-slate-500">{p.reference ?? '—'}</td>
                                <td className="px-4 py-2 text-xs text-slate-500 italic truncate max-w-[140px]">{p.notes ?? '—'}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => openEvidences(p)} title="Ver evidencias" className="relative rounded-md border border-slate-200 p-1.5 text-purple-500 hover:bg-purple-50">
                                      <FileText size={13}/>
                                    </button>
                                    <button onClick={() => setEditPaymentTarget(p)} title="Editar abono" className="rounded-md border border-slate-200 p-1.5 text-blue-500 hover:bg-blue-50"><Pencil size={13}/></button>
                                    <button onClick={() => setDeletePaymentTarget(p)} title="Eliminar abono" className="rounded-md border border-slate-200 p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={13}/></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Mostrando {Math.min(start + 1, filtered.length)}-{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPgPayments(p => Math.max(1, p - 1))} disabled={pgPayments <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                            <span className="px-2">{pgPayments} / {totalPg}</span>
                            <button onClick={() => setPgPayments(p => Math.min(totalPg, p + 1))} disabled={pgPayments >= totalPg} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </SubPanel>
              )}

              {/* Sub-action: Notas de crédito */}
              {subAction === 'creditNotes' && (
                <SubPanel title="Notas de crédito" onBack={() => setSubAction(null)}>
                  <div className="mb-4 relative max-w-xl">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                      placeholder="Buscar por folio…"
                      value={searchCreditNotes}
                      onChange={e => { setSearchCreditNotes(e.target.value); setPgCreditNotes(1); }}
                    />
                  </div>
                  {(() => {
                    const filtered = creditNotes.filter(n => {
                      const q = searchCreditNotes.toLowerCase().trim();
                      if (!q) return true;
                      return n.id.toLowerCase().includes(q) || `v-${n.id.slice(0, 6).toLowerCase()}`.includes(q);
                    });
                    if (filtered.length === 0) return <p className="py-6 text-center text-xs text-slate-400">Sin ventas a crédito</p>;
                    const totalPg = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                    const start = (pgCreditNotes - 1) * PAGE_SIZE;
                    const slice = filtered.slice(start, start + PAGE_SIZE);
                    return (
                      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-900 text-white">
                            <tr>{['Folio','Emisión','Total','Abonado','Saldo','Estado','Acción'].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {slice.map(n => (
                              <tr key={n.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs font-mono font-bold text-slate-700">V-{n.id.slice(0, 6).toUpperCase()}</td>
                                <td className="px-4 py-2 text-xs text-slate-600">{new Date(n.created_at).toLocaleDateString('es-MX')}</td>
                                <td className="px-4 py-2 text-sm font-bold text-slate-900">{formatCurrency(n.total)}</td>
                                <td className="px-4 py-2 text-sm font-bold text-green-600">{formatCurrency(n.paid)}</td>
                                <td className="px-4 py-2 text-sm font-black text-red-500">{formatCurrency(n.pending)}</td>
                                <td className="px-4 py-2">
                                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${n.pending === 0 ? 'bg-green-100 text-green-700' : n.paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                    {n.pending === 0 ? 'LIQUIDADA' : n.paid > 0 ? 'PARCIAL' : 'PENDIENTE'}
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => printSale(n.id)} title="Imprimir nota" className="rounded-md border border-slate-200 p-1.5 text-blue-500 hover:bg-blue-50"><FileText size={13}/></button>
                                    <button onClick={() => setDeleteNoteTarget(n)} title="Eliminar venta" className="rounded-md border border-slate-200 p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={13}/></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Mostrando {Math.min(start + 1, filtered.length)}-{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPgCreditNotes(p => Math.max(1, p - 1))} disabled={pgCreditNotes <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                            <span className="px-2">{pgCreditNotes} / {totalPg}</span>
                            <button onClick={() => setPgCreditNotes(p => Math.min(totalPg, p + 1))} disabled={pgCreditNotes >= totalPg} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </SubPanel>
              )}

              {/* Sub-action: Ventas en efectivo */}
              {subAction === 'cashSales' && (
                <SubPanel title="Ventas en efectivo" onBack={() => setSubAction(null)}>
                  {cashSales.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">Sin ventas al contado</p>
                  ) : (() => {
                    const totalPg = Math.max(1, Math.ceil(cashSales.length / PAGE_SIZE));
                    const start = (pgCashSales - 1) * PAGE_SIZE;
                    const slice = cashSales.slice(start, start + PAGE_SIZE);
                    return (
                      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-900 text-white">
                            <tr>{['Folio','Fecha','Método','Total','Pago','Notas','Acción'].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {slice.map(s => (
                              <tr key={s.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs font-mono font-bold text-slate-700">V-{s.id.slice(0, 6).toUpperCase()}</td>
                                <td className="px-4 py-2 text-xs text-slate-600">{new Date(s.created_at).toLocaleString('es-MX')}</td>
                                <td className="px-4 py-2"><span className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-black text-green-700">{s.payment_method}</span></td>
                                <td className="px-4 py-2 text-sm font-bold text-slate-900">{formatCurrency(s.total)}</td>
                                <td className="px-4 py-2 text-xs text-slate-600">
                                  {s.payment_method === 'EFECTIVO' && Number(s.cash_received ?? 0) > 0 ? (
                                    <>
                                      <p><span className="font-bold">Pagó:</span> {formatCurrency(Number(s.cash_received ?? 0))}</p>
                                      <p><span className="font-bold">Vuelto:</span> {formatCurrency(getCashChange(Number(s.cash_received ?? 0), Number(s.total ?? 0)))}</p>
                                    </>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-slate-500 italic truncate max-w-[180px]">{s.notes ?? '—'}</td>
                                <td className="px-4 py-2">
                                  <button onClick={() => printSale(s.id)} title="Imprimir" className="rounded-md border border-slate-200 p-1.5 text-blue-500 hover:bg-blue-50"><FileText size={13}/></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Mostrando {Math.min(start + 1, cashSales.length)}-{Math.min(start + PAGE_SIZE, cashSales.length)} de {cashSales.length}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPgCashSales(p => Math.max(1, p - 1))} disabled={pgCashSales <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                            <span className="px-2">{pgCashSales} / {totalPg}</span>
                            <button onClick={() => setPgCashSales(p => Math.min(totalPg, p + 1))} disabled={pgCashSales >= totalPg} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </SubPanel>
              )}

              {/* Sub-action: Registrar abono — paso 1 tabla, paso 2 form */}
              {subAction === 'registerPayment' && (
                <SubPanel
                  title={paymentSaleId ? `Registrar abono · V-${paymentSaleId.replace(/-/g, '').slice(0, 6).toUpperCase()}` : 'Registrar abono — seleccionar nota'}
                  onBack={() => paymentSaleId ? setPaymentSaleId('') : setSubAction(null)}
                >
                  {!paymentSaleId ? (
                    // PASO 1: Lista de notas pendientes
                    (() => {
                      const pending = creditNotes.filter(n => n.pending > 0);
                      if (pending.length === 0) return <p className="py-8 text-center text-sm text-slate-400">No hay notas con saldo pendiente</p>;
                      const totalPg = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
                      const start = (pgCreditNotes - 1) * PAGE_SIZE;
                      const slice = pending.slice(start, start + PAGE_SIZE);
                      return (
                        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-900 text-white">
                              <tr>{['Folio','Registro','Vence','Saldo','Acción'].map(h => (
                                <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                              ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {slice.map(n => {
                                const due = new Date(n.created_at);
                                due.setDate(due.getDate() + 30);
                                return (
                                  <tr key={n.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 text-xs font-mono font-bold text-slate-700">V-{n.id.replace(/-/g, '').slice(0, 6).toUpperCase()}</td>
                                    <td className="px-4 py-2 text-xs text-slate-600">{new Date(n.created_at).toISOString().slice(0, 10)}</td>
                                    <td className="px-4 py-2 text-xs text-slate-600">{due.toISOString().slice(0, 10)}</td>
                                    <td className="px-4 py-2 text-sm font-black text-red-500">{formatCurrency(n.pending)}</td>
                                    <td className="px-4 py-2">
                                      <button
                                        onClick={() => { setPaymentSaleId(n.id); setPaymentAmount(String(n.pending)); }}
                                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-green-500"
                                      >
                                        <BanknoteIcon size={12}/> Abonar
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <span>Mostrando {Math.min(start + 1, pending.length)}-{Math.min(start + PAGE_SIZE, pending.length)} de {pending.length}</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setPgCreditNotes(p => Math.max(1, p - 1))} disabled={pgCreditNotes <= 1} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Anterior</button>
                              <span className="px-2">{pgCreditNotes} / {totalPg}</span>
                              <button onClick={() => setPgCreditNotes(p => Math.min(totalPg, p + 1))} disabled={pgCreditNotes >= totalPg} className="rounded-md border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Siguiente</button>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    // Paso 1 mostrado abajo + modal flotante encima
                    (() => {
                      const pending = creditNotes.filter(n => n.pending > 0);
                      const totalPg = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
                      const start = (pgCreditNotes - 1) * PAGE_SIZE;
                      const slice = pending.slice(start, start + PAGE_SIZE);
                      return (
                        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden opacity-40 pointer-events-none">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-900 text-white">
                              <tr>{['Folio','Registro','Vence','Saldo','Acción'].map(h => (
                                <th key={h} className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                              ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {slice.map(n => (
                                <tr key={n.id}>
                                  <td className="px-4 py-2 text-xs font-mono font-bold text-slate-700">V-{n.id.replace(/-/g, '').slice(0, 6).toUpperCase()}</td>
                                  <td className="px-4 py-2 text-xs text-slate-600">{new Date(n.created_at).toISOString().slice(0, 10)}</td>
                                  <td className="px-4 py-2 text-xs text-slate-600">—</td>
                                  <td className="px-4 py-2 text-sm font-black text-red-500">{formatCurrency(n.pending)}</td>
                                  <td className="px-4 py-2 text-[10px] text-slate-400">SELECCIONADA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="border-t border-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{pending.length} notas pendientes</div>
                          <span className="hidden">{totalPg}{start}</span>
                        </div>
                      );
                    })()
                  )}
                </SubPanel>
              )}

              {/* Modal flotante: form de abono (sobre Gestionar) */}
              {subAction === 'registerPayment' && paymentSaleId && (() => {
                const selectedNote = creditNotes.find(n => n.id === paymentSaleId);
                const saldoNota = selectedNote?.pending ?? 0;
                return (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                      {/* Header verde */}
                      <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4 text-white">
                        <h3 className="text-base font-black uppercase tracking-tight">Registrar Abono</h3>
                        <p className="text-[11px] font-bold opacity-95">V-{paymentSaleId.replace(/-/g, '').slice(0, 6).toUpperCase()} · SALDO {formatCurrency(saldoNota)}</p>
                      </div>

                      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-3">
                          <select
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-green-500 focus:bg-white"
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
                          >
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="TARJETA">Tarjeta</option>
                            <option value="TRANSFERENCIA">Transferencia</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="SALDO_FAVOR" disabled={manageStats.wallet_balance <= 0}>Saldo a favor {manageStats.wallet_balance > 0 ? `(${formatCurrency(manageStats.wallet_balance)})` : ''}</option>
                          </select>
                          <input
                            type="number" min="0" step="0.01" max={saldoNota}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-green-500 focus:bg-white"
                            placeholder="Monto del abono"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                          />
                        </div>

                        <input
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-green-500 focus:bg-white"
                          placeholder="Notas del abono"
                          value={paymentNotes}
                          onChange={e => setPaymentNotes(e.target.value)}
                        />

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Evidencias (máx {MAX_EVIDENCE_FILES})</p>
                            <p className="text-[10px] text-slate-400">{paymentEvidenceFiles.length}/{MAX_EVIDENCE_FILES}</p>
                          </div>

                          {/* Lista de archivos en cola */}
                          {paymentEvidenceFiles.length > 0 && (
                            <ul className="mb-3 space-y-1">
                              {paymentEvidenceFiles.map((f, idx) => (
                                <li key={idx} className="flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-3 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText size={14} className="text-green-600 shrink-0"/>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-green-700 truncate">{f.name}</p>
                                      <p className="text-[10px] text-green-500">{(f.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                  </div>
                                  <button onClick={() => setPaymentEvidenceFiles(prev => prev.filter((_, i) => i !== idx))} className="text-green-500 hover:text-red-500 ml-2"><X size={14}/></button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {paymentEvidenceFiles.length < MAX_EVIDENCE_FILES ? (
                            <label className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-600 cursor-pointer hover:bg-slate-100 hover:border-slate-400">
                              <Upload size={16}/>
                              Adjuntar imagen o PDF · Máximo 10 MB por archivo
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,.pdf"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!f) return;
                                  try {
                                    validateDocumentFile(f);
                                    setPaymentEvidenceFiles(prev => [...prev, f]);
                                    setActionError('');
                                  } catch (err: unknown) {
                                    setActionError(err instanceof Error ? err.message : 'Archivo inválido');
                                  }
                                }}
                              />
                            </label>
                          ) : (
                            <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Límite alcanzado ({MAX_EVIDENCE_FILES} archivos)
                            </div>
                          )}
                        </div>

                        {actionError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{actionError}</p>}
                      </div>

                      <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
                        <button
                          onClick={() => { setPaymentSaleId(''); setPaymentEvidenceFiles([]); setActionError(''); }}
                          disabled={paymentProcessing}
                          className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={doRegisterPayment}
                          disabled={paymentProcessing || !Number(paymentAmount)}
                          className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-green-600 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-green-500 disabled:opacity-40"
                        >
                          {paymentProcessing && <Loader2 size={14} className="animate-spin"/>}
                          {paymentProcessing ? 'Procesando…' : 'Confirmar abono'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar abono */}
      {deletePaymentTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500"><Trash2 size={18}/></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Eliminar abono</h3>
                <p className="text-[11px] text-slate-500">{formatCurrency(deletePaymentTarget.amount)} · {deletePaymentTarget.payment_method}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-600">¿Eliminar este abono? {deletePaymentTarget.payment_method === 'SALDO_FAVOR' ? 'El monto se restaurará al saldo del cliente.' : 'Esta acción no se puede deshacer.'}</p>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-red-500">Motivo / observación *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                  value={deletePaymentNote}
                  onChange={e => setDeletePaymentNote(e.target.value)}
                  placeholder="Explica por qué se elimina (obligatorio)"
                />
              </div>
              {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{actionError}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button onClick={() => { setDeletePaymentTarget(null); setDeletePaymentNote(''); setActionError(''); }} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={handleDeletePayment} disabled={!deletePaymentNote.trim()} className="flex-1 rounded-xl bg-red-500 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-40">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar nota de venta */}
      {deleteNoteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500"><Trash2 size={18}/></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Eliminar venta</h3>
                <p className="text-[11px] text-slate-500">V-{deleteNoteTarget.id.slice(0, 6).toUpperCase()} · {formatCurrency(deleteNoteTarget.total)}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-600">Se eliminará la venta a crédito y todos sus items. Stock no se revierte automáticamente.</p>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-red-500">Motivo / observación *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                  value={deleteNoteJustif}
                  onChange={e => setDeleteNoteJustif(e.target.value)}
                  placeholder="Explica por qué se elimina (obligatorio)"
                />
              </div>
              {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{actionError}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button onClick={() => { setDeleteNoteTarget(null); setDeleteNoteJustif(''); setActionError(''); }} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={handleDeleteNoteSale} disabled={!deleteNoteJustif.trim()} className="flex-1 rounded-xl bg-red-500 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-40">Eliminar venta</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Evidencias del Abono */}
      {evidencesPayment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Evidencias del Abono</h3>
                <p className="text-[11px] font-bold text-slate-300">
                  {formatCurrency(evidencesPayment.amount)} · {new Date(evidencesPayment.created_at).toLocaleString('es-MX')}
                </p>
              </div>
              <button onClick={closeEvidences} className="rounded-xl bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"><X size={16}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-3">
              {/* Subir nueva */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">Agregar nuevas evidencias</p>
                  <p className="text-[10px] text-slate-400">Adjunta imagen o PDF para este abono.</p>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Upload size={13}/>
                  Seleccionar archivo
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      try { validateDocumentFile(f); setEvidencesQueueFile(f); }
                      catch (err: unknown) { alert(err instanceof Error ? err.message : 'Archivo inválido'); }
                    }}
                  />
                </label>
                <button
                  onClick={uploadEvidenceFromModal}
                  disabled={!evidencesQueueFile || evidencesUploading}
                  className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  {evidencesUploading && <Loader2 size={12} className="animate-spin"/>}
                  Agregar archivo
                </button>
              </div>
              {evidencesQueueFile && (
                <p className="text-[11px] text-slate-500">En cola: <strong>{evidencesQueueFile.name}</strong> · {(evidencesQueueFile.size / 1024).toFixed(1)} KB</p>
              )}

              {/* Lista */}
              {evidencesList.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">Sin evidencias registradas</p>
              ) : (
                <ul className="space-y-3">
                  {evidencesList.map(ev => {
                    const isImage = ev.file_url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
                    return (
                      <li key={ev.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">{ev.file_name}</p>
                            <p className="text-[10px] text-slate-400">
                              {new Date(ev.uploaded_at).toLocaleString('es-MX')}
                              {ev.file_size_kb ? ` · ${(ev.file_size_kb / 1024).toFixed(2)} MB` : ''}
                            </p>
                          </div>
                          <a href={ev.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700">
                            <ExternalLink size={12}/> Abrir
                          </a>
                          <button onClick={() => removeEvidence(ev.id)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-100">
                            <Trash2 size={12}/> Eliminar
                          </button>
                        </div>
                        {isImage && (
                          <img src={ev.file_url} alt={ev.file_name} className="max-h-64 w-full object-contain rounded-xl border border-slate-200"/>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editar abono */}
      {editPaymentTarget && (
        <EditPaymentModal
          payment={editPaymentTarget}
          onClose={() => setEditPaymentTarget(null)}
          onSaved={async () => {
            setEditPaymentTarget(null);
            if (manageTarget) {
              const list = await vinosCustomerMgmtService.listCreditPayments(manageTarget.id);
              setCreditPayments(list);
              await refreshStats();
            }
          }}
        />
      )}
    </div>
  );
};

// ─── Edit Payment Modal ──────────────────────────────────────────────────
const EditPaymentModal: React.FC<{
  payment: CreditPayment;
  onClose: () => void;
  onSaved: () => void;
}> = ({ payment, onClose, onSaved }) => {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.payment_method);
  const [reference, setReference] = useState(payment.reference ?? '');
  const [notes, setNotes] = useState(payment.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr('Monto inválido.'); return; }
    setSaving(true);
    try {
      await vinosCustomerMgmtService.updateCreditPayment(payment.id, {
        amount: amt,
        payment_method: method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <h3 className="text-sm font-black uppercase tracking-tight">Editar abono</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-800"><X size={16}/></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Monto</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base font-bold outline-none focus:border-orange-400"/>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Método</label>
            <select value={method} onChange={e => setMethod(e.target.value as CreditPayment['payment_method'])} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400">
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE">Cheque</option>
              <option value="SALDO_FAVOR">Saldo a favor</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Referencia</label>
            <input value={reference} onChange={e => setReference(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"/>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Notas</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"/>
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{err}</p>}
        </div>
        <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-xl bg-orange-600 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
};

// Sub-components reutilizables
const PanelButton: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }> = ({ icon, title, subtitle, onClick }) => (
  <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-orange-300 hover:bg-orange-50/40 hover:shadow-sm">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">{icon}</div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>
    </div>
  </button>
);

const SubPanel: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => (
  <div className="p-6">
    <div className="mb-4 flex items-center gap-3">
      <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">← Volver</button>
      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">{title}</h3>
    </div>
    {children}
  </div>
);

export default VinosCustomersScreen;
