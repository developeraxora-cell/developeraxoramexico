import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import { Branch, User } from '../../types';
import { creditService, type CashSaleHistory, type CreditCustomer, type CreditNote, type CreditNoteWithStatus, type CreditPayment, type CreditPaymentEvidence, type CreditPaymentMethod, type CreditSummary, type CustomerAddress, type SalePaymentEvidence } from '../../services/credit/credit.service';
import { walletService, type CustomerWalletMovement, type CustomerWalletSummary } from '../../services/wallet.service';
import { CreditCard, Eye, FileDown, FileImage, History, MapPin, Paperclip, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../services/currency';
import { generateCustomerStatementPdf } from '../../services/pdf/customerStatementPdf';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';
import WalletCreateModal from '../Wallet/WalletCreateModal';
import WalletRechargeModal from '../Wallet/WalletRechargeModal';
import WalletHistoryModal from '../Wallet/WalletHistoryModal';
import { logMaterialsAudit } from '../../services/audit/audit.service';
import { supabase } from '../../services/supabaseClient';
import { customerSelectionService } from '../../services/shared/customerSelection.service';
import { paymentEvidenceUploadService, validatePaymentEvidenceFile } from '../../services/paymentEvidenceUpload.service';

interface CustomerScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const defaultCustomerForm = {
  name: '',
  phone: '',
  address: '',
  credit_limit: 0,
  default_credit_days: 30,
  policy: 'CERO_TOLERANCIA' as const,
  allow_cash_if_blocked: true,
  justification: '',
};

const MODAL_PAGE_SIZE = 5;
let watermarkPngBytesPromise: Promise<ArrayBuffer | null> | null = null;
const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
const addDaysToDate = (base: string, days: number) => {
  const next = new Date(`${base}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + Math.max(1, days));
  return toDateInput(next);
};
const formatLocalDateTime = (value: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const normalized = raw.includes('T')
    ? raw
    : raw.includes(' ')
      ? raw.replace(' ', 'T')
      : `${raw}T00:00:00`;
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
};
const getWatermarkPngBytes = async () => {
  if (!watermarkPngBytesPromise) {
    watermarkPngBytesPromise = fetch('/lopar-watermark.png')
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
  }
  return watermarkPngBytesPromise;
};
const openPdfPreview = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open('', '_blank');

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.document.title = filename;
      previewWindow.location.href = url;
    } catch {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  } else {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
const toFileToken = (value: string | null | undefined, fallback: string) => {
  const source = String(value ?? '');
  const normalized = typeof source.normalize === 'function' ? source.normalize('NFD') : source;
  const cleaned = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
  return cleaned || fallback;
};
const buildSalePdfFilename = (branchName: string | null | undefined, saleId: string) => {
  const moduleToken = 'MATERIALES';
  const branchToken = toFileToken(branchName, 'SUCURSAL');
  const saleToken = toFileToken(saleId, '0');
  return `${moduleToken}-${branchToken}-${saleToken}.pdf`;
};

type NoteModalMode = 'create' | 'edit';

const createDefaultNoteForm = (creditDays = 30) => {
  const issueDate = toDateInput(new Date());
  return {
    folio: '',
    issue_date: issueDate,
    due_date: addDaysToDate(issueDate, creditDays),
    total: 0,
    notes: '',
    justification: '',
  };
};

const createDefaultPaymentEditForm = () => ({
  paid_at: '',
  amount: 0,
  method: 'EFECTIVO' as CreditPaymentMethod,
  reference: '',
  notes: '',
  justification: '',
});
const ALPHABET_FILTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const getDisplayNoteCode = (note: Pick<CreditNote, 'folio' | 'sale_reference' | 'inventory_transaction_id'>) =>
  String(note.sale_reference ?? '').trim()
  || (note.inventory_transaction_id ? String(note.inventory_transaction_id) : '')
  || note.folio;

const isZeroCostSaleNote = (value: string | null | undefined) =>
  String(value ?? '').toUpperCase().includes('SALIDA SIN COSTO');

const CustomerScreen: React.FC<CustomerScreenProps> = ({ selectedBranchId, branches, currentUser }) => {
  const PAGE_SIZE = 5;
  type SaleSummaryItem = {
    id: string;
    qty: number;
    unit_price: number;
    factor_used: number;
    product_name: string | null;
    product_sku: string | null;
    uom_name: string | null;
    uom_code: string | null;
    custom_label: string | null;
    sale_type: 'Mayoreo' | 'Menudeo' | '—';
    presentation: string;
  };
  type SaleSummaryData = {
    saleId: string;
    created_at: string;
    nombre_cliente: string | null;
    direccion_cliente: string | null;
    created_by: string | null;
    reference: string | null;
    notes: string | null;
    total_amount: number;
    items: SaleSummaryItem[];
  };

  type HistoryModalRow = {
    rowKey: string;
    kind: 'credit' | 'cash';
    saleId: string | null;
    displayCode: string;
    issue_date: string;
    due_date: string | null;
    total: number;
    balance: number;
    status: 'PAGADA' | 'VENCIDA' | 'ABIERTA' | 'EFECTIVO' | 'BILLETERA' | 'HIBRIDA' | 'SIN COSTO';
    reference: string | null;
    note: CreditNoteWithStatus | null;
    sale: CashSaleHistory | null;
  };
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CreditSummary>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [openNotes, setOpenNotes] = useState<CreditNote[]>([]);
  const [historyNotes, setHistoryNotes] = useState<CreditNoteWithStatus[]>([]);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'TODAS' | 'VENCIDA' | 'ABIERTA' | 'PAGADA'>('TODAS');
  const [historyView, setHistoryView] = useState<'CREDIT' | 'CASH'>('CREDIT');
  const [selectedHistoryNoteIds, setSelectedHistoryNoteIds] = useState<string[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
  const [formData, setFormData] = useState(defaultCustomerForm);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteModalMode, setNoteModalMode] = useState<NoteModalMode>('create');
  const [editingNote, setEditingNote] = useState<CreditNoteWithStatus | null>(null);
  const [noteForm, setNoteForm] = useState(createDefaultNoteForm());
  const [noteFormError, setNoteFormError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CreditPaymentMethod>('EFECTIVO');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentEvidenceFiles, setPaymentEvidenceFiles] = useState<File[]>([]);
  const [paymentEvidenceError, setPaymentEvidenceError] = useState<string | null>(null);
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);
  const [paymentTargetNote, setPaymentTargetNote] = useState<CreditNote | null>(null);
  const [isPaymentEntryModalOpen, setIsPaymentEntryModalOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<CreditPayment[]>([]);
  const [paymentEvidencesByPaymentId, setPaymentEvidencesByPaymentId] = useState<Record<string, CreditPaymentEvidence[]>>({});
  const [cashSaleHistory, setCashSaleHistory] = useState<CashSaleHistory[]>([]);
  const [cashSaleTotalsById, setCashSaleTotalsById] = useState<Record<string, number>>({});
  const [saleEvidencesByTransactionId, setSaleEvidencesByTransactionId] = useState<Record<string, SalePaymentEvidence[]>>({});
  const [walletsByCustomerId, setWalletsByCustomerId] = useState<Record<string, CustomerWalletSummary>>({});
  const [isWalletCreateOpen, setIsWalletCreateOpen] = useState(false);
  const [eligibleWalletCustomers, setEligibleWalletCustomers] = useState<CreditCustomer[]>([]);
  const [selectedWalletCustomer, setSelectedWalletCustomer] = useState<CreditCustomer | null>(null);
  const [walletInitialAmount, setWalletInitialAmount] = useState('10000');
  const [walletCreateNotes, setWalletCreateNotes] = useState('');
  const [walletCreateError, setWalletCreateError] = useState<string | null>(null);
  const [isWalletCreateLoading, setIsWalletCreateLoading] = useState(false);
  const [walletToRecharge, setWalletToRecharge] = useState<CustomerWalletSummary | null>(null);
  const [isWalletRechargeOpen, setIsWalletRechargeOpen] = useState(false);
  const [walletRechargeAmount, setWalletRechargeAmount] = useState('');
  const [walletRechargeReference, setWalletRechargeReference] = useState('');
  const [walletRechargeNotes, setWalletRechargeNotes] = useState('');
  const [walletRechargeError, setWalletRechargeError] = useState<string | null>(null);
  const [isWalletRechargeLoading, setIsWalletRechargeLoading] = useState(false);
  const [walletToHistory, setWalletToHistory] = useState<CustomerWalletSummary | null>(null);
  const [walletMovements, setWalletMovements] = useState<CustomerWalletMovement[]>([]);
  const [isWalletHistoryOpen, setIsWalletHistoryOpen] = useState(false);
  const [isWalletHistoryLoading, setIsWalletHistoryLoading] = useState(false);
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1);
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [selectedPaymentForEvidence, setSelectedPaymentForEvidence] = useState<CreditPayment | null>(null);
  const [isPaymentEvidenceModalOpen, setIsPaymentEvidenceModalOpen] = useState(false);
  const [selectedSaleForEvidence, setSelectedSaleForEvidence] = useState<CashSaleHistory | null>(null);
  const [isSaleEvidenceModalOpen, setIsSaleEvidenceModalOpen] = useState(false);
  const [saleEvidenceModalMode, setSaleEvidenceModalMode] = useState<'upload' | 'view'>('upload');
  const [saleEvidenceFiles, setSaleEvidenceFiles] = useState<File[]>([]);
  const [saleEvidenceError, setSaleEvidenceError] = useState<string | null>(null);
  const [saleEvidenceToDelete, setSaleEvidenceToDelete] = useState<SalePaymentEvidence | null>(null);
  const [isDeleteSaleEvidenceModalOpen, setIsDeleteSaleEvidenceModalOpen] = useState(false);
  const [deleteSaleEvidenceJustification, setDeleteSaleEvidenceJustification] = useState('');
  const [deleteSaleEvidenceError, setDeleteSaleEvidenceError] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<CreditPayment | null>(null);
  const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
  const [paymentEditForm, setPaymentEditForm] = useState(createDefaultPaymentEditForm());
  const [paymentEditError, setPaymentEditError] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<CreditPayment | null>(null);
  const [isDeletePaymentModalOpen, setIsDeletePaymentModalOpen] = useState(false);
  const [deletePaymentJustification, setDeletePaymentJustification] = useState('');
  const [deletePaymentError, setDeletePaymentError] = useState<string | null>(null);
  const [expandedHistoryNoteId, setExpandedHistoryNoteId] = useState<string | null>(null);
  const [noteSaleSummaries, setNoteSaleSummaries] = useState<Record<string, SaleSummaryData>>({});
  const [historyNoteReferences, setHistoryNoteReferences] = useState<Record<string, string>>({});
  const [loadingNoteSaleId, setLoadingNoteSaleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('alert');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<CreditNoteWithStatus | null>(null);
  const [isDeleteNoteModalOpen, setIsDeleteNoteModalOpen] = useState(false);
  const [deleteNoteJustification, setDeleteNoteJustification] = useState('');
  const [deleteNoteError, setDeleteNoteError] = useState<string | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressCustomer, setAddressCustomer] = useState<CreditCustomer | null>(null);
  const [addressRows, setAddressRows] = useState<CustomerAddress[]>([]);
  const [addressLabel, setAddressLabel] = useState('');
  const [addressValue, setAddressValue] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [isAddressFormModalOpen, setIsAddressFormModalOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<CustomerAddress | null>(null);
  const [isDeleteAddressModalOpen, setIsDeleteAddressModalOpen] = useState(false);
  const actionLockRef = useRef(false);

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);
  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  };

  const closeFeedback = () => {
    if (feedbackType === 'loading') return;
    setFeedbackOpen(false);
  };
  const feedbackLoading = feedbackOpen && feedbackType === 'loading';

  const loadCustomerAddresses = useCallback(async (customerId: string) => {
    const rows = await creditService.listAddressesByCustomer(customerId);
    setAddressRows(rows);
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE)), [totalCustomers, PAGE_SIZE]);
  const historyModalRows = useMemo<HistoryModalRow[]>(() => {
    const creditRows = historyNotes.map((note) => ({
      rowKey: note.id,
      kind: 'credit' as const,
      saleId: note.inventory_transaction_id ? String(note.inventory_transaction_id) : null,
      displayCode: getDisplayNoteCode(note),
      issue_date: note.issue_date,
      due_date: note.due_date,
      total: Number(note.total ?? 0),
      balance: Number(note.balance ?? 0),
      status: note.status,
      reference: historyNoteReferences[note.id] ?? noteSaleSummaries[note.id]?.reference ?? null,
      note,
      sale: null,
    }));
    const cashRows = cashSaleHistory.map((sale) => {
      const rawPaymentType = String(sale.payment_type ?? '').trim().toUpperCase();
      const normalizedPaymentType = rawPaymentType === 'SIN_COSTO' ? 'SIN COSTO' : rawPaymentType;
      const cashStatus = (['EFECTIVO', 'BILLETERA', 'HIBRIDA', 'SIN COSTO'].includes(normalizedPaymentType)
        ? normalizedPaymentType
        : 'EFECTIVO') as 'EFECTIVO' | 'BILLETERA' | 'HIBRIDA' | 'SIN COSTO';
      return ({
        rowKey: `cash:${sale.id}`,
        kind: 'cash' as const,
        saleId: String(sale.id),
        displayCode: String(sale.id),
        issue_date: String(sale.created_at ?? '').slice(0, 10),
        due_date: null,
        total: Number(cashSaleTotalsById[String(sale.id)] ?? noteSaleSummaries[`cash:${sale.id}`]?.total_amount ?? 0),
        balance: 0,
        status: cashStatus,
        reference: sale.reference ?? null,
        note: null,
        sale,
      });
    });
    return [...creditRows, ...cashRows].sort((a, b) => {
      const aTime = new Date(`${a.issue_date}T00:00:00Z`).getTime();
      const bTime = new Date(`${b.issue_date}T00:00:00Z`).getTime();
      return bTime - aTime;
    });
  }, [cashSaleHistory, cashSaleTotalsById, historyNoteReferences, historyNotes, noteSaleSummaries]);
  const activeHistoryRows = useMemo(
    () => historyModalRows.filter((row) => (historyView === 'CREDIT' ? row.kind === 'credit' : row.kind === 'cash')),
    [historyModalRows, historyView]
  );
  const filteredHistoryRows = useMemo(() => {
    const term = historySearchTerm.trim().toLowerCase();
    return activeHistoryRows.filter((row) => {
      const matchesStatus = historyView === 'CASH'
        ? true
        : historyStatusFilter === 'TODAS' || row.status === historyStatusFilter;
      const summaryReference = noteSaleSummaries[row.rowKey]?.reference?.toLowerCase() ?? '';
      const matchesTerm = !term
        || row.displayCode.toLowerCase().includes(term)
        || String(row.reference ?? '').toLowerCase().includes(term)
        || summaryReference.includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [activeHistoryRows, historySearchTerm, historyStatusFilter, historyView, noteSaleSummaries]);
  const historyTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredHistoryRows.length / MODAL_PAGE_SIZE)), [filteredHistoryRows.length]);
  const filteredOpenNotes = useMemo(() => {
    const term = paymentSearchTerm.trim().toLowerCase();
    if (!term) return openNotes;
    return openNotes.filter((note) => getDisplayNoteCode(note).toLowerCase().includes(term));
  }, [openNotes, paymentSearchTerm]);
  const paymentTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredOpenNotes.length / MODAL_PAGE_SIZE)), [filteredOpenNotes.length]);
  const paymentHistoryTotalPages = useMemo(() => Math.max(1, Math.ceil(paymentHistory.length / MODAL_PAGE_SIZE)), [paymentHistory.length]);
  const pagedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * MODAL_PAGE_SIZE;
    return filteredHistoryRows.slice(start, start + MODAL_PAGE_SIZE);
  }, [filteredHistoryRows, historyPage]);
  const pagedOpenNotes = useMemo(() => {
    const start = (paymentPage - 1) * MODAL_PAGE_SIZE;
    return filteredOpenNotes.slice(start, start + MODAL_PAGE_SIZE);
  }, [filteredOpenNotes, paymentPage]);
  const pagedPaymentHistory = useMemo(() => {
    const start = (paymentHistoryPage - 1) * MODAL_PAGE_SIZE;
    return paymentHistory.slice(start, start + MODAL_PAGE_SIZE);
  }, [paymentHistory, paymentHistoryPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadCustomers = useCallback(async () => {
    if (!branchId) {
      setCustomers([]);
      setSummaries({});
      setWalletsByCustomerId({});
      setTotalCustomers(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [pageData, branchWallets] = await Promise.all([
        creditService.listCustomersByBranchPaged(branchId, currentPage, PAGE_SIZE, debouncedSearchTerm, selectedLetter),
        walletService.listWalletsByBranch(branchId),
      ]);
      const summaryMap = await creditService.getSummariesForCustomers(pageData.rows);
      setCustomers(pageData.rows);
      setTotalCustomers(pageData.total);
      setSummaries(summaryMap);
      setWalletsByCustomerId(
        branchWallets.reduce<Record<string, CustomerWalletSummary>>((acc, wallet) => {
          acc[wallet.customer_id] = wallet;
          return acc;
        }, {})
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar clientes.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, currentPage, debouncedSearchTerm, PAGE_SIZE, selectedLetter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedLetter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    let active = true;
    setSelectedCustomerIds([]);
    if (!branchId) return () => {
      active = false;
    };

    void customerSelectionService.listSelectedCustomerIds('materials', branchId)
      .then((ids) => {
        if (!active) return;
        setSelectedCustomerIds(ids);
      })
      .catch(() => {
        if (!active) return;
        setSelectedCustomerIds([]);
      });

    const channel = customerSelectionService.subscribe({
      module: 'materials',
      branchId,
      onSelectionChange: (customerId, selected) => {
        if (!active) return;
        setSelectedCustomerIds((prev) => {
          if (selected) return prev.includes(customerId) ? prev : [...prev, customerId];
          return prev.filter((id) => id !== customerId);
        });
      },
    });

    return () => {
      active = false;
      customerSelectionService.unsubscribe(channel);
    };
  }, [branchId]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (paymentHistoryPage > paymentHistoryTotalPages) {
      setPaymentHistoryPage(paymentHistoryTotalPages);
    }
  }, [paymentHistoryPage, paymentHistoryTotalPages]);

  const resetWalletCreateState = () => {
    setSelectedWalletCustomer(null);
    setEligibleWalletCustomers([]);
    setWalletInitialAmount('10000');
    setWalletCreateNotes('');
    setWalletCreateError(null);
    setIsWalletCreateLoading(false);
  };

  const handleSearchEligibleWalletCustomers = useCallback(async (query: string) => {
    if (!branchId) return;
    const data = await walletService.listEligibleCustomers(branchId, query);
    setEligibleWalletCustomers(data);
  }, [branchId]);

  const openWalletCreateModal = (customer?: CreditCustomer | null) => {
    resetWalletCreateState();
    setIsWalletCreateOpen(true);
    if (customer) {
      setSelectedWalletCustomer(customer);
      setEligibleWalletCustomers([customer]);
      return;
    }
    void handleSearchEligibleWalletCustomers('');
  };

  const handleCreateWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!branchId) return;
    if (!selectedWalletCustomer) {
      setWalletCreateError('Seleccione un cliente.');
      return;
    }

    const amount = Number(String(walletInitialAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 10000) {
      setWalletCreateError('El monto inicial mínimo es de 10,000 pesos.');
      return;
    }

    setIsWalletCreateLoading(true);
    actionLockRef.current = true;
    showFeedback('loading', 'Creando saldo a favor', 'Registrando apertura...');

    try {
      const wallet = await walletService.createWallet({
        branch_id: branchId,
        customer_id: selectedWalletCustomer.id,
        initial_amount: amount,
        opened_by: currentUser.name,
        notes: walletCreateNotes.trim() || null,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'CREAR',
        entity_type: 'cliente',
        entity_id: selectedWalletCustomer.id,
        description: `Saldo a favor creado para ${selectedWalletCustomer.name}`,
        new_data: {
          wallet_id: wallet.id,
          customer_id: selectedWalletCustomer.id,
          customer_name: selectedWalletCustomer.name,
          opened_amount: amount,
          notes: walletCreateNotes.trim() || null,
        },
      });

      await loadCustomers();
      setIsWalletCreateOpen(false);
      resetWalletCreateState();
      showFeedback('success', 'Saldo a favor creado', 'El saldo a favor quedó habilitado.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el saldo a favor.';
      setWalletCreateError(message);
      showFeedback('error', 'No se pudo crear', message);
    } finally {
      setIsWalletCreateLoading(false);
      actionLockRef.current = false;
    }
  };

  const openWalletRechargeModal = (wallet: CustomerWalletSummary) => {
    setWalletToRecharge(wallet);
    setWalletRechargeAmount('');
    setWalletRechargeReference('');
    setWalletRechargeNotes('');
    setWalletRechargeError(null);
    setIsWalletRechargeOpen(true);
  };

  const handleRechargeWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!walletToRecharge) return;

    const amount = Number(String(walletRechargeAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletRechargeError('El monto de la recarga debe ser mayor a 0.');
      return;
    }

    setIsWalletRechargeLoading(true);
    actionLockRef.current = true;
    showFeedback('loading', 'Registrando recarga', 'Actualizando saldo a favor...');

    try {
      await walletService.rechargeWallet({
        wallet_id: walletToRecharge.id,
        amount,
        created_by: currentUser.name,
        reference: walletRechargeReference.trim() || null,
        notes: walletRechargeNotes.trim() || null,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'cliente',
        entity_id: walletToRecharge.customer_id,
        description: `Recarga de saldo a favor para ${walletToRecharge.customer_name}`,
        justification: walletRechargeNotes.trim() || null,
        new_data: {
          wallet_id: walletToRecharge.id,
          amount,
          reference: walletRechargeReference.trim() || null,
        },
      });

      await loadCustomers();
      if (walletToHistory?.id === walletToRecharge.id) {
        setIsWalletHistoryLoading(true);
        const movements = await walletService.listWalletMovements(walletToRecharge.id);
        setWalletMovements(movements);
        setIsWalletHistoryLoading(false);
      }
      setIsWalletRechargeOpen(false);
      setWalletToRecharge(null);
      showFeedback('success', 'Recarga registrada', 'El saldo a favor fue actualizado.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar la recarga.';
      setWalletRechargeError(message);
      showFeedback('error', 'No se pudo recargar', message);
    } finally {
      setIsWalletRechargeLoading(false);
      actionLockRef.current = false;
    }
  };

  const openWalletHistoryModal = async (wallet: CustomerWalletSummary) => {
    setWalletToHistory(wallet);
    setWalletMovements([]);
    setIsWalletHistoryOpen(true);
    setIsWalletHistoryLoading(true);
    try {
      const movements = await walletService.listWalletMovements(wallet.id);
      setWalletMovements(movements);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el historial de saldo a favor.';
      showFeedback('error', 'No se pudo cargar', message);
    } finally {
      setIsWalletHistoryLoading(false);
    }
  };

  const handleOpenHistory = async (customer: CreditCustomer) => {
    setHistoryView('CREDIT');
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
    setHistorySearchTerm('');
    setSelectedHistoryNoteIds([]);
    setHistoryPage(1);
    setExpandedHistoryNoteId(null);
    setError(null);
    try {
      const notes = await creditService.listNotesByCustomer(customer.id);
      const withStatus = notes.map((note) => {
        const dueDate = new Date(`${note.due_date}T00:00:00Z`);
        const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const overdue = note.balance > 0 && diffDays > (customer.late_tolerance_days ?? 0);
        return {
          ...note,
          status: note.balance <= 0 ? 'PAGADA' : overdue ? 'VENCIDA' : 'ABIERTA',
          days_overdue: overdue ? diffDays : 0,
        } as CreditNoteWithStatus;
      });

      setHistoryNotes(withStatus);
      const transactionIds = withStatus
        .map((note) => note.inventory_transaction_id ? String(note.inventory_transaction_id) : '')
        .filter(Boolean);
      if (transactionIds.length > 0) {
        const { data: txRows, error: txError } = await supabase
          .from('inventory_transactions')
          .select('id, reference')
          .in('id', transactionIds);
        if (txError) throw txError;
        const referencesByTxId = new Map((txRows ?? []).map((row: any) => [String(row.id), String(row.reference ?? '')]));
        setHistoryNoteReferences(
          withStatus.reduce<Record<string, string>>((acc, note) => {
            if (note.inventory_transaction_id) {
              acc[note.id] = referencesByTxId.get(String(note.inventory_transaction_id)) ?? '';
            }
            return acc;
          }, {})
        );
      } else {
        setHistoryNoteReferences({});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar notas.';
      setError(message);
    }
  };

  const handleOpenCashSalesHistory = async (customer: CreditCustomer) => {
    setHistoryView('CASH');
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
    setHistorySearchTerm('');
    setSelectedHistoryNoteIds([]);
    setHistoryPage(1);
    setExpandedHistoryNoteId(null);
    setError(null);
    setIsLoading(true);
    try {
      await loadPaymentHistory(customer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar ventas en efectivo.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCustomerSelection = (customerId: string) => {
    const isSelected = selectedCustomerIds.includes(customerId);
    const nextSelected = !isSelected;
    setSelectedCustomerIds((prev) =>
      nextSelected ? (prev.includes(customerId) ? prev : [...prev, customerId]) : prev.filter((id) => id !== customerId)
    );
    void customerSelectionService.setSelected({
      module: 'materials',
      branchId,
      customerId,
      selected: nextSelected,
      updatedBy: currentUser.id,
      updatedByName: currentUser.name,
    }).catch((err) => {
      setSelectedCustomerIds((prev) =>
        isSelected ? (prev.includes(customerId) ? prev : [...prev, customerId]) : prev.filter((id) => id !== customerId)
      );
      const message = err instanceof Error ? err.message : 'No se pudo sincronizar la selección del cliente.';
      setError(message);
      showFeedback('error', 'No se pudo sincronizar', message);
    });
  };

  const handleOpenPayment = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsPaymentModalOpen(true);
    setPaymentPage(1);
    setPaymentSearchTerm('');
    setPaymentNotes('');
    setPaymentMethod('EFECTIVO');
    setPaymentEvidenceFiles([]);
    setPaymentEvidenceError(null);
    setError(null);
    try {
      const notes = await creditService.listOpenNotesByCustomer(customer.id);
      setOpenNotes(notes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar notas.';
      setError(message);
    }
  };

  const loadPaymentHistory = async (customer: CreditCustomer) => {
    const notes = await creditService.listNotesByCustomer(customer.id);
    setHistoryNotes(buildHistoryNotes(notes, customer));
    const payments = await creditService.listPaymentsByNoteIds(notes.map((note) => note.id));
    setPaymentHistory(payments);
    const evidences = await creditService.listPaymentEvidencesByPaymentIds(payments.map((payment) => String(payment.id)));
    const groupedEvidences = evidences.reduce<Record<string, CreditPaymentEvidence[]>>((acc, evidence) => {
      const key = String(evidence.payment_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(evidence);
      return acc;
    }, {});
    setPaymentEvidencesByPaymentId(groupedEvidences);

    const creditTransactionIds = new Set(notes.map((note) => String(note.inventory_transaction_id ?? '')).filter(Boolean));
    const cashSalesRaw = branchId ? await creditService.listCashSalesByCustomer(customer.id, branchId, customer.name) : [];
    const cashSales = cashSalesRaw.filter((sale) => !creditTransactionIds.has(String(sale.id)) && !isZeroCostSaleNote(sale.notes));
    setCashSaleHistory(cashSales);
    if (cashSales.length > 0) {
      const { data: saleItems, error: saleItemsError } = await supabase
        .from('inventory_transaction_items')
        .select('transaction_id, qty, unit_price')
        .in('transaction_id', cashSales.map((sale) => String(sale.id)));
      if (saleItemsError) throw saleItemsError;
      const totals = (saleItems ?? []).reduce<Record<string, number>>((acc, item: any) => {
        const key = String(item.transaction_id);
        acc[key] = (acc[key] ?? 0) + (Number(item.qty ?? 0) * Number(item.unit_price ?? 0));
        return acc;
      }, {});
      setCashSaleTotalsById(totals);
    } else {
      setCashSaleTotalsById({});
    }
    const saleEvidences = await creditService.listSaleEvidencesByTransactionIds(cashSales.map((sale) => String(sale.id)));
    const groupedSaleEvidences = saleEvidences.reduce<Record<string, SalePaymentEvidence[]>>((acc, evidence) => {
      const key = String(evidence.transaction_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(evidence);
      return acc;
    }, {});
    setSaleEvidencesByTransactionId(groupedSaleEvidences);
    return { notes, payments, cashSales };
  };

  const handleOpenPaymentHistory = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setPaymentHistoryPage(1);
    setHistoryPage(1);
    setHistoryView('CREDIT');
    setHistorySearchTerm('');
    setExpandedHistoryNoteId(null);
    setError(null);
    setIsLoading(true);
    try {
      await loadPaymentHistory(customer);
      setIsPaymentHistoryModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el historial de abonos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleHistoryNoteSelection = (noteId: string) => {
    setSelectedHistoryNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
  };

  const handleDownloadCustomerPdf = async (customer: CreditCustomer) => {
    showFeedback('loading', 'Generando PDF', 'Preparando estado de cuenta...');

    try {
      const [notes, summary] = await Promise.all([
        creditService.listNotesByCustomer(customer.id),
        summaries[customer.id] ? Promise.resolve(summaries[customer.id]) : creditService.getCustomerSummary(customer),
      ]);

      const noteIds = notes.map((note) => note.id);
      const payments = await creditService.listPaymentsByNoteIds(noteIds);
      const saleDetails = (
        await Promise.all(
          notes.map(async (note) => {
            try {
              const summary = await fetchNoteSaleSummary({
                ...note,
                status: note.balance <= 0 ? 'PAGADA' : 'ABIERTA',
                days_overdue: 0,
              } as CreditNoteWithStatus);

              return {
                note_id: note.id,
                folio: note.folio,
                created_at: summary.created_at,
                items: summary.items.map((item) => ({
                  product_name: item.product_name ?? '—',
                  presentation: item.presentation,
                  sale_type: item.sale_type,
                  qty: Number(item.qty ?? 0),
                  subtotal: Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
                })),
              };
            } catch {
              return null;
            }
          })
        )
      ).filter((detail): detail is NonNullable<typeof detail> => Boolean(detail));

      const withStatus = notes.map((note) => {
        const dueDate = new Date(`${note.due_date}T00:00:00Z`);
        const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const overdue = note.balance > 0 && diffDays > (customer.late_tolerance_days ?? 0);
        return {
          ...note,
          status: note.balance <= 0 ? 'PAGADA' : overdue ? 'VENCIDA' : 'ABIERTA',
          days_overdue: overdue ? diffDays : 0,
        } as CreditNoteWithStatus;
      });

      await generateCustomerStatementPdf({
        moduleLabel: 'MATERIALES',
        branchName: selectedBranch?.name ?? selectedBranchId ?? 'SUCURSAL',
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          credit_limit: Number(customer.credit_limit ?? 0),
        },
        debt: summary.saldo_total_pendiente,
        available: summary.disponible_credito,
        notes: withStatus.map((note) => ({
          id: note.id,
          folio: note.folio,
          issue_date: note.issue_date,
          due_date: note.due_date,
          total: Number(note.total ?? 0),
          paid_amount: Number(note.paid_amount ?? 0),
          balance: Number(note.balance ?? 0),
          status: note.status,
        })),
        payments: payments.map((payment) => ({
          note_id: payment.note_id,
          paid_at: payment.paid_at,
          amount: Number(payment.amount ?? 0),
          method: payment.method,
          reference: payment.reference ?? null,
        })),
        saleDetails,
      });
      setFeedbackOpen(false);
    } catch (err) {
      setFeedbackOpen(false);
      const message = err instanceof Error ? err.message : 'No se pudo generar el PDF del cliente.';
      showFeedback('error', 'PDF no disponible', message);
      setError(message);
    }
  };

  const getPresentationLabelFromSaleItem = (item: {
    factor_used: number;
    uom_name: string | null;
    uom_code: string | null;
    custom_label: string | null;
  }) => {
    const uomCode = item.uom_code ? item.uom_code : 'BASE';
    return item.custom_label
      ? `${item.custom_label} (${item.factor_used} ${uomCode})`
      : item.uom_name || 'UOM';
  };

  const inferSaleType = (row: any): 'Mayoreo' | 'Menudeo' | '—' => {
    const unitPrice = Number(row.unit_price ?? 0);
    const wholesale = Number(row.products?.wholesale_price ?? 0);
    const retail = Number(row.products?.retail_price ?? row.products?.precio ?? 0);
    const hasWholesale = Number.isFinite(wholesale) && wholesale > 0;
    const hasRetail = Number.isFinite(retail) && retail > 0;

    if (!hasWholesale && !hasRetail) return '—';
    if (!hasWholesale && hasRetail) return 'Menudeo';
    if (hasWholesale && !hasRetail) return 'Mayoreo';

    const wholesaleDiff = Math.abs(unitPrice - wholesale);
    const retailDiff = Math.abs(unitPrice - retail);
    return wholesaleDiff <= retailDiff ? 'Mayoreo' : 'Menudeo';
  };

  const resolveSaleTransactionId = async (note: CreditNoteWithStatus) => {
    if (note.inventory_transaction_id) return String(note.inventory_transaction_id);

    const { data: byReference, error: byReferenceError } = await supabase
      .from('inventory_transactions')
      .select('id')
      .eq('branch_id', branchId)
      .eq('type', 'SALE')
      .eq('reference', note.folio)
      .maybeSingle();

    if (byReferenceError) throw byReferenceError;
    if (byReference?.id) return String(byReference.id);

    throw new Error('Esta nota no tiene una venta asociada.');
  };

  const fetchSaleSummaryByTransactionId = async (transactionId: string, fallback?: {
    customerName?: string | null;
    customerAddress?: string | null;
    totalAmount?: number | null;
  }): Promise<SaleSummaryData> => {
    const { data: saleRow, error: saleError } = await supabase
      .from('inventory_transactions')
      .select('id, reference, notes, created_at, nombre_cliente, direccion_cliente, created_by')
      .eq('id', transactionId)
      .single();
    if (saleError) throw saleError;

    const { data: itemRows, error: itemsError } = await supabase
      .from('inventory_transaction_items')
      .select(`
        id,
        qty,
        unit_price,
        factor_used,
        products ( name, sku, attrs, wholesale_price, retail_price, precio ),
        product_uoms ( uom_id, uoms ( name, code ) )
      `)
      .eq('transaction_id', transactionId);
    if (itemsError) throw itemsError;

    const items = (itemRows ?? []).map((row: any) => {
      const attrs = row.products?.attrs ?? {};
      const factorUsed = Number(row.factor_used ?? 1);
      let customLabel: string | null = null;

      if (attrs && typeof attrs === 'object') {
        for (const [key, value] of Object.entries(attrs)) {
          if (Number(value) === factorUsed) {
            customLabel = key;
            break;
          }
        }
      }

      const item = {
        id: String(row.id),
        qty: Number(row.qty ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        factor_used: factorUsed,
        product_name: row.products?.name ?? null,
        product_sku: row.products?.sku ?? null,
        uom_name: row.product_uoms?.uoms?.name ?? null,
        uom_code: row.product_uoms?.uoms?.code ?? null,
        custom_label: customLabel,
        sale_type: inferSaleType(row),
        presentation: '',
      } as SaleSummaryItem;

      item.presentation = getPresentationLabelFromSaleItem(item);
      return item;
    });

    const computedTotal = items.reduce((acc, item) => acc + (Number(item.qty) * Number(item.unit_price)), 0);

    return {
      saleId: String(saleRow.id),
      created_at: saleRow.created_at,
      nombre_cliente: saleRow.nombre_cliente ?? fallback?.customerName ?? selectedCustomer?.name ?? null,
      direccion_cliente: saleRow.direccion_cliente ?? fallback?.customerAddress ?? selectedCustomer?.address ?? null,
      created_by: saleRow.created_by ?? currentUser.name,
      reference: saleRow.reference ?? null,
      notes: saleRow.notes ?? null,
      total_amount: Number(fallback?.totalAmount ?? computedTotal ?? 0),
      items,
    };
  };

  const fetchNoteSaleSummary = async (note: CreditNoteWithStatus): Promise<SaleSummaryData> => {
    const transactionId = await resolveSaleTransactionId(note);
    return fetchSaleSummaryByTransactionId(transactionId, {
      customerName: selectedCustomer?.name ?? null,
      customerAddress: selectedCustomer?.address ?? null,
      totalAmount: Number(note.total ?? 0),
    });
  };

  const fetchCashSaleSummary = async (sale: CashSaleHistory): Promise<SaleSummaryData> => {
    return fetchSaleSummaryByTransactionId(String(sale.id), {
      customerName: sale.nombre_cliente ?? selectedCustomer?.name ?? null,
      customerAddress: sale.direccion_cliente ?? selectedCustomer?.address ?? null,
      totalAmount: null,
    });
  };

  const generateSalePdf = async (input: {
    saleId: string;
    createdAt: string;
    items: Array<{
      name: string;
      presentation: string;
      qty: number;
      unitPrice: number;
      subtotal: number;
    }>;
    paymentMethod: 'EFECTIVO' | 'CREDITO';
    customerName: string;
    customerAddress: string;
    cashierName: string;
    branchName: string;
  }) => {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    let watermarkImage: any = null;
    try {
      const logoBytes = await getWatermarkPngBytes();
      if (logoBytes) {
        watermarkImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch {
      watermarkImage = null;
    }

    if (watermarkImage) {
      const dims = watermarkImage.scale(0.5);
      page.drawImage(watermarkImage, {
        x: (width - dims.width) / 2,
        y: (height - dims.height) / 2 - 40,
        width: dims.width,
        height: dims.height,
        opacity: 0.12,
      });
    }

    const marginX = 30;
    const outerY = 75;
    const outerTop = height - 70;
    const outerHeight = outerTop - outerY;
    page.drawRectangle({
      x: marginX,
      y: outerY,
      width: width - marginX * 2,
      height: outerHeight,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    const title = `MATERIALES ${(input.branchName || 'SUCURSAL').toUpperCase()}`;
    const titleSize = 14;
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 42,
      size: titleSize,
      font: fontBold,
    });

    const infoTop = height - 105;
    const rightInfoX = width - marginX - 155;
    page.drawText(`FECHA:  ${formatLocalDateTime(input.createdAt)}`, { x: marginX + 10, y: infoTop, size: 10, font: fontBold });
    page.drawText(`CLIENTE:  ${input.customerName.toUpperCase()}`, { x: marginX + 10, y: infoTop - 24, size: 10, font: fontBold });
    page.drawText(`DIRECCION:  ${input.customerAddress.toUpperCase()}`, { x: marginX + 10, y: infoTop - 48, size: 10, font: fontBold });
    page.drawText(input.paymentMethod === 'CREDITO' ? 'CREDITO' : 'LIQUIDADO', { x: marginX + 10, y: infoTop - 72, size: 10, font: fontBold });
    page.drawText('NOTA DE VENTA', { x: rightInfoX + 18, y: infoTop, size: 12, font: fontBold });
    page.drawText(String(input.saleId), { x: rightInfoX + 70, y: infoTop - 24, size: 12, font: fontBold });
    page.drawText(`CAJERO:  ${input.cashierName.toUpperCase()}`, { x: rightInfoX - 42, y: infoTop - 72, size: 10, font: fontBold });

    const tableTop = infoTop - 120;
    const tableWidth = width - marginX * 2;
    const colRatios = [0.36, 0.2, 0.14, 0.15, 0.15];
    const colXs = colRatios.reduce<number[]>((acc, ratio) => {
      const prev = acc[acc.length - 1];
      acc.push(prev + tableWidth * ratio);
      return acc;
    }, [marginX]);
    const drawCellText = (text: string, col: number, y: number, size: number, color = rgb(0, 0, 0)) => {
      const xStart = colXs[col];
      const xEnd = colXs[col + 1];
      const colWidth = xEnd - xStart;
      const available = colWidth - 6;
      let safe = text ?? '';
      while (safe.length > 0 && fontBold.widthOfTextAtSize(safe, size) > available) {
        safe = safe.slice(0, -1);
      }
      if (safe !== text && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
      const textWidth = fontBold.widthOfTextAtSize(safe, size);
      const textX = xStart + Math.max(3, (colWidth - textWidth) / 2);
      page.drawText(safe, { x: textX, y, size, font: fontBold, color });
    };

    page.drawRectangle({ x: marginX, y: tableTop - 16, width: tableWidth, height: 16, color: rgb(0, 0, 0) });
    ['PRODUCTO', 'PRESENTACION', 'CANTIDAD', 'PRECIO UNITARIO', 'SUBTOTAL'].forEach((header, idx) => {
      drawCellText(header, idx, tableTop - 12, 8, rgb(1, 1, 1));
    });

    let rowY = tableTop - 32;
    const maxRows = Math.min(14, input.items.length);
    let total = 0;
    for (let i = 0; i < maxRows; i += 1) {
      const item = input.items[i];
      const subtotal = Number(item.subtotal ?? (item.qty * item.unitPrice));
      total += subtotal;
      const rowHeight = 18;
      page.drawRectangle({
        x: marginX,
        y: rowY - 2,
        width: tableWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < colXs.length - 1; c += 1) {
        page.drawLine({
          start: { x: colXs[c], y: rowY - 2 },
          end: { x: colXs[c], y: rowY - 2 + rowHeight },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      drawCellText(item.name.toUpperCase(), 0, rowY + 4, 8);
      drawCellText(item.presentation.toUpperCase(), 1, rowY + 4, 8);
      drawCellText(Number(item.qty).toFixed(2), 2, rowY + 4, 8);
      drawCellText(formatCurrency(Number(item.unitPrice)), 3, rowY + 4, 8);
      drawCellText(formatCurrency(subtotal), 4, rowY + 4, 8);
      rowY -= rowHeight;
    }

    page.drawText(`TOTAL:  ${formatCurrency(total)}`, { x: width - marginX - 210, y: 108, size: 20, font: fontBold });
    page.drawText('KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326', {
      x: marginX + 80,
      y: 64,
      size: 9,
      font: fontBold,
    });
    page.drawText('Página 1', { x: width - marginX - 54, y: 64, size: 9, font: fontBold });

    const pdfBytes = await pdfDoc.save();
    openPdfPreview(new Blob([pdfBytes], { type: 'application/pdf' }), buildSalePdfFilename(input.branchName, input.saleId));
  };

  const toggleHistorySaleSummary = async (row: HistoryModalRow) => {
    const summaryKey = row.rowKey;
    if (expandedHistoryNoteId === summaryKey) {
      setExpandedHistoryNoteId(null);
      return;
    }
    if (noteSaleSummaries[summaryKey]) {
      setExpandedHistoryNoteId(summaryKey);
      return;
    }

    setLoadingNoteSaleId(summaryKey);
    try {
      const summary = row.kind === 'credit' && row.note
        ? await fetchNoteSaleSummary(row.note)
        : row.sale
          ? await fetchCashSaleSummary(row.sale)
          : null;
      if (!summary) throw new Error('No se encontró la venta asociada.');
      setNoteSaleSummaries((prev) => ({ ...prev, [summaryKey]: summary }));
      setExpandedHistoryNoteId(summaryKey);
    } catch (err) {
      showFeedback('error', 'No se pudo cargar la venta', err instanceof Error ? err.message : 'No se pudo cargar el detalle de la venta.');
    } finally {
      setLoadingNoteSaleId(null);
    }
  };

  const handlePrintSaleRow = async (row: HistoryModalRow) => {
    showFeedback('loading', 'Generando PDF', 'Preparando documento de venta...');
    try {
      const summaryKey = row.rowKey;
      const summary = noteSaleSummaries[summaryKey]
        ?? (row.kind === 'credit' && row.note
          ? await fetchNoteSaleSummary(row.note)
          : row.sale
            ? await fetchCashSaleSummary(row.sale)
            : null);
      if (!summary) throw new Error('No se pudo resolver la venta.');
      if (!noteSaleSummaries[summaryKey]) {
        setNoteSaleSummaries((prev) => ({ ...prev, [summaryKey]: summary }));
      }
      await generateSalePdf({
        saleId: summary.saleId,
        createdAt: summary.created_at,
        items: summary.items.map((item) => ({
          name: item.product_name ?? 'PRODUCTO',
          presentation: item.presentation,
          qty: item.qty,
          unitPrice: item.unit_price,
          subtotal: Number(item.qty) * Number(item.unit_price),
        })),
        paymentMethod: row.kind === 'credit' ? 'CREDITO' : 'EFECTIVO',
        customerName: summary.nombre_cliente ?? selectedCustomer?.name ?? 'PUBLICO GENERAL',
        customerAddress: summary.direccion_cliente ?? selectedCustomer?.address ?? '-',
        cashierName: summary.created_by ?? currentUser.name,
        branchName: selectedBranch?.name ?? selectedBranchId ?? 'SUCURSAL',
      });
      setFeedbackOpen(false);
    } catch (err) {
      setFeedbackOpen(false);
      showFeedback('error', 'No se pudo exportar', err instanceof Error ? err.message : 'No se pudo generar el PDF de la venta.');
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLockRef.current) return;
    if (!selectedCustomer || !paymentTargetNote) return;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setPaymentFormError('El abono debe ser mayor a 0.');
      return;
    }

    const safeAmount = Math.min(paymentAmount, Number(paymentTargetNote.balance ?? 0));
    if (safeAmount <= 0) {
      setPaymentFormError('El abono supera o no aplica al saldo disponible.');
      return;
    }
    setPaymentFormError(null);

    setIsLoading(true);
    setError(null);
    actionLockRef.current = true;
    showFeedback('loading', 'Registrando abono', 'Guardando el abono...');

    try {
      let uploadedEvidences: Awaited<ReturnType<typeof paymentEvidenceUploadService.upload>>[] = [];
      if (paymentEvidenceFiles.length > 0) {
        if (!paymentEvidenceUploadService.isConfigured()) {
          throw new Error('La carga de evidencias no está configurada.');
        }
        uploadedEvidences = await Promise.all(
          paymentEvidenceFiles.map((file) =>
            paymentEvidenceUploadService.upload(file, {
              module: 'materiales',
              branch_id: branchId,
              customer_id: selectedCustomer.id,
            })
          )
        );
      }

      const createdPayment = await creditService.createPayment({
        note_id: paymentTargetNote.id,
        amount: safeAmount,
        method: paymentMethod,
        notes: paymentNotes || null,
      });
      if (uploadedEvidences.length > 0) {
        await Promise.all(
          uploadedEvidences.map((evidence) =>
            creditService.createPaymentEvidence({
              payment_id: String(createdPayment.id),
              file_url: evidence.file_url,
              secure_url: evidence.secure_url,
              public_id: evidence.public_id,
              resource_type: evidence.resource_type,
              format: evidence.format,
              original_filename: evidence.original_filename,
              bytes: evidence.bytes,
              uploaded_by: currentUser.name,
            })
          )
        );
      }

      setIsPaymentEntryModalOpen(false);
      setPaymentNotes('');
      setPaymentMethod('EFECTIVO');
      setPaymentAmount(0);
      setPaymentTargetNote(null);
      setPaymentEvidenceFiles([]);
      setPaymentEvidenceError(null);
      await loadCustomers();
      const notes = await creditService.listOpenNotesByCustomer(selectedCustomer.id);
      setOpenNotes(notes);
      showFeedback('success', 'Abono registrado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el abono.';
      setError(message);
      showFeedback('error', 'No se pudo registrar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const openPaymentEntryModal = (note: CreditNote) => {
    setPaymentTargetNote(note);
    setPaymentMethod('EFECTIVO');
    setPaymentAmount(0);
    setPaymentNotes('');
    setPaymentEvidenceFiles([]);
    setPaymentEvidenceError(null);
    setPaymentFormError(null);
    setIsPaymentEntryModalOpen(true);
  };

  const handlePaymentEvidenceFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setPaymentEvidenceFiles([]);
      setPaymentEvidenceError(null);
      return;
    }

    try {
      files.forEach(validatePaymentEvidenceFile);
      setPaymentEvidenceFiles(files);
      setPaymentEvidenceError(null);
    } catch (error) {
      setPaymentEvidenceFiles([]);
      setPaymentEvidenceError(error instanceof Error ? error.message : 'No se pudo adjuntar la evidencia.');
      event.target.value = '';
    }
  };

  const openPaymentEvidenceModal = (payment: CreditPayment) => {
    setSelectedPaymentForEvidence(payment);
    setIsPaymentEvidenceModalOpen(true);
  };


  const handleSaleEvidenceFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setSaleEvidenceFiles([]);
      setSaleEvidenceError(null);
      return;
    }

    try {
      files.forEach(validatePaymentEvidenceFile);
      setSaleEvidenceFiles(files);
      setSaleEvidenceError(null);
    } catch (error) {
      setSaleEvidenceFiles([]);
      setSaleEvidenceError(error instanceof Error ? error.message : 'No se pudo adjuntar la evidencia.');
      event.target.value = '';
    }
  };

  const openSaleEvidenceUploadModal = (sale: CashSaleHistory) => {
    setSelectedSaleForEvidence(sale);
    setSaleEvidenceModalMode('upload');
    setSaleEvidenceFiles([]);
    setSaleEvidenceError(null);
    setIsSaleEvidenceModalOpen(true);
  };

  const openSaleEvidenceViewerModal = (sale: CashSaleHistory) => {
    setSelectedSaleForEvidence(sale);
    setSaleEvidenceModalMode('view');
    setSaleEvidenceFiles([]);
    setSaleEvidenceError(null);
    setIsSaleEvidenceModalOpen(true);
  };

  const handleUploadSaleEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!selectedCustomer || !selectedSaleForEvidence) return;
    if (saleEvidenceFiles.length === 0) {
      setSaleEvidenceError('Debe adjuntar al menos un archivo.');
      return;
    }
    if (!paymentEvidenceUploadService.isConfigured()) {
      setSaleEvidenceError('La carga de evidencias no está configurada.');
      return;
    }

    setIsLoading(true);
    setSaleEvidenceError(null);
    actionLockRef.current = true;
    showFeedback('loading', 'Adjuntando comprobante', 'Subiendo evidencia de la venta...');

    try {
      const uploadedEvidences = await Promise.all(
        saleEvidenceFiles.map((file) =>
          paymentEvidenceUploadService.upload(file, {
            module: 'materiales',
            branch_id: branchId,
            customer_id: selectedCustomer.id,
            transaction_id: String(selectedSaleForEvidence.id),
          })
        )
      );

      const created = await Promise.all(
        uploadedEvidences.map((evidence) =>
          creditService.createSaleEvidence({
            transaction_id: String(selectedSaleForEvidence.id),
            file_url: evidence.file_url,
            secure_url: evidence.secure_url,
            public_id: evidence.public_id,
            resource_type: evidence.resource_type,
            format: evidence.format,
            original_filename: evidence.original_filename,
            bytes: evidence.bytes,
            uploaded_by: currentUser.name,
          })
        )
      );

      setSaleEvidencesByTransactionId((prev) => ({
        ...prev,
        [String(selectedSaleForEvidence.id)]: [...created, ...(prev[String(selectedSaleForEvidence.id)] ?? [])],
      }));
      setSaleEvidenceFiles([]);
      showFeedback('success', 'Comprobante adjuntado', 'La evidencia de pago se registró correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar la evidencia de la venta.';
      setSaleEvidenceError(message);
      showFeedback('error', 'No se pudo adjuntar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };


  const requestDeleteSaleEvidence = (evidence: SalePaymentEvidence) => {
    setSaleEvidenceToDelete(evidence);
    setDeleteSaleEvidenceJustification('');
    setDeleteSaleEvidenceError(null);
    setIsDeleteSaleEvidenceModalOpen(true);
  };

  const handleConfirmDeleteSaleEvidence = async () => {
    if (actionLockRef.current) return;
    if (!selectedSaleForEvidence || !saleEvidenceToDelete) return;
    if (!deleteSaleEvidenceJustification.trim()) {
      setDeleteSaleEvidenceError('La observación es obligatoria.');
      return;
    }

    setIsLoading(true);
    setDeleteSaleEvidenceError(null);
    actionLockRef.current = true;
    showFeedback('loading', 'Eliminando comprobante', 'Quitando evidencia de la venta...');

    try {
      if (saleEvidenceToDelete.public_id) {
        await paymentEvidenceUploadService.delete({
          public_id: saleEvidenceToDelete.public_id,
          resource_type: saleEvidenceToDelete.resource_type,
        });
      }

      await creditService.deleteSaleEvidence(saleEvidenceToDelete.id);

      setSaleEvidencesByTransactionId((prev) => ({
        ...prev,
        [String(selectedSaleForEvidence.id)]: (prev[String(selectedSaleForEvidence.id)] ?? []).filter(
          (evidence) => evidence.id !== saleEvidenceToDelete.id,
        ),
      }));

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'venta',
        entity_id: String(selectedSaleForEvidence.id),
        description: `Comprobante eliminado de la venta en efectivo ${selectedSaleForEvidence.id}`,
        justification: deleteSaleEvidenceJustification.trim(),
        previous_data: saleEvidenceToDelete as unknown as Record<string, unknown>,
      });

      setIsDeleteSaleEvidenceModalOpen(false);
      setSaleEvidenceToDelete(null);
      setDeleteSaleEvidenceJustification('');
      showFeedback('success', 'Comprobante eliminado', 'La evidencia de la venta se eliminó correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la evidencia de la venta.';
      setDeleteSaleEvidenceError(message);
      showFeedback('error', 'No se pudo eliminar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const selectedPaymentEvidences = useMemo(() => {
    if (!selectedPaymentForEvidence) return [] as CreditPaymentEvidence[];
    return paymentEvidencesByPaymentId[String(selectedPaymentForEvidence.id)] ?? [];
  }, [paymentEvidencesByPaymentId, selectedPaymentForEvidence]);
  const selectedSaleEvidences = useMemo(() => {
    if (!selectedSaleForEvidence) return [] as SalePaymentEvidence[];
    return saleEvidencesByTransactionId[String(selectedSaleForEvidence.id)] ?? [];
  }, [saleEvidencesByTransactionId, selectedSaleForEvidence]);

  const getPaymentNote = (noteId: string) => historyNotes.find((note) => note.id === noteId) ?? openNotes.find((note) => note.id === noteId) ?? null;

  const openEditPaymentModal = (payment: CreditPayment) => {
    setEditingPayment(payment);
    setPaymentEditForm({
      paid_at: String(payment.paid_at ?? '').slice(0, 16),
      amount: Number(payment.amount ?? 0),
      method: payment.method,
      reference: payment.reference ?? '',
      notes: payment.notes ?? '',
      justification: '',
    });
    setPaymentEditError(null);
    setIsEditPaymentModalOpen(true);
  };

  const handleUpdatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!selectedCustomer || !editingPayment) return;
    if (!paymentEditForm.justification.trim()) {
      setPaymentEditError('La observación es obligatoria.');
      return;
    }

    const targetNote = getPaymentNote(editingPayment.note_id);
    const amount = Number(paymentEditForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentEditError('El abono debe ser mayor a 0.');
      return;
    }
    if (!targetNote) {
      setPaymentEditError('No se encontró la nota asociada al abono.');
      return;
    }
    const otherPayments = paymentHistory
      .filter((payment) => payment.note_id === editingPayment.note_id && payment.id !== editingPayment.id)
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0);
    const maxAllowed = Number(targetNote.total ?? 0) - otherPayments;
    if (amount > maxAllowed) {
      setPaymentEditError('El abono supera el saldo permitido para esa nota.');
      return;
    }

    setIsLoading(true);
    setPaymentEditError(null);
    showFeedback('loading', 'Actualizando abono', 'Guardando cambios...');
    actionLockRef.current = true;

    try {
      const updated = await creditService.updatePayment(editingPayment.id, {
        paid_at: paymentEditForm.paid_at ? new Date(paymentEditForm.paid_at).toISOString() : undefined,
        amount,
        method: paymentEditForm.method,
        reference: paymentEditForm.reference || null,
        notes: paymentEditForm.notes || null,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'abono_credito',
        entity_id: String(updated.id),
        description: `Abono actualizado para nota ${targetNote.folio}`,
        justification: paymentEditForm.justification.trim(),
        previous_data: editingPayment as unknown as Record<string, unknown>,
        new_data: updated as unknown as Record<string, unknown>,
      });

      await loadCustomers();
      await refreshCustomerNotes(selectedCustomer);
      await loadPaymentHistory(selectedCustomer);
      setIsEditPaymentModalOpen(false);
      setEditingPayment(null);
      setPaymentEditForm(createDefaultPaymentEditForm());
      showFeedback('success', 'Abono actualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el abono.';
      setPaymentEditError(message);
      showFeedback('error', 'No se pudo actualizar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleRequestDeletePayment = (payment: CreditPayment) => {
    setPaymentToDelete(payment);
    setDeletePaymentJustification('');
    setDeletePaymentError(null);
    setIsDeletePaymentModalOpen(true);
  };

  const handleConfirmDeletePayment = async () => {
    if (actionLockRef.current) return;
    if (!selectedCustomer || !paymentToDelete) return;
    if (!deletePaymentJustification.trim()) {
      setDeletePaymentError('La observación es obligatoria.');
      return;
    }

    setIsLoading(true);
    showFeedback('loading', 'Eliminando abono', 'Procesando eliminación...');
    actionLockRef.current = true;

    try {
      await creditService.deletePayment(paymentToDelete.id);

      const note = getPaymentNote(paymentToDelete.note_id);
      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'abono_credito',
        entity_id: String(paymentToDelete.id),
        description: `Abono eliminado${note ? ` de nota ${note.folio}` : ''}`,
        justification: deletePaymentJustification.trim(),
        previous_data: paymentToDelete as unknown as Record<string, unknown>,
      });

      await loadCustomers();
      await refreshCustomerNotes(selectedCustomer);
      await loadPaymentHistory(selectedCustomer);
      setIsDeletePaymentModalOpen(false);
      setPaymentToDelete(null);
      setDeletePaymentJustification('');
      setDeletePaymentError(null);
      showFeedback('success', 'Abono eliminado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el abono.';
      setDeletePaymentError(message);
      showFeedback('error', 'No se pudo eliminar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const buildHistoryNotes = (notes: CreditNote[], customer: CreditCustomer) => {
    return notes.map((note) => {
      const dueDate = new Date(`${note.due_date}T00:00:00Z`);
      const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const overdue = note.balance > 0 && diffDays > (customer.late_tolerance_days ?? 0);
      return {
        ...note,
        status: note.balance <= 0 ? 'PAGADA' : overdue ? 'VENCIDA' : 'ABIERTA',
        days_overdue: overdue ? diffDays : 0,
      } as CreditNoteWithStatus;
    });
  };

  const openCreateNoteModal = (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setEditingNote(null);
    setNoteModalMode('create');
    setNoteForm(createDefaultNoteForm(customer.default_credit_days || 30));
    setNoteFormError(null);
    setIsNoteModalOpen(true);
  };

  const openEditNoteModal = (note: CreditNoteWithStatus) => {
    if (!selectedCustomer) return;
    setEditingNote(note);
    setNoteModalMode('edit');
    setNoteForm({
      folio: note.folio,
      issue_date: note.issue_date,
      due_date: note.due_date,
      total: Number(note.total ?? 0),
      notes: note.notes ?? '',
      justification: '',
    });
    setNoteFormError(null);
    setIsNoteModalOpen(true);
  };

  const refreshCustomerNotes = async (customer: CreditCustomer) => {
    const notes = await creditService.listNotesByCustomer(customer.id);
    setHistoryNotes(buildHistoryNotes(notes, customer));
    return notes;
  };

  const handleSubmitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!selectedCustomer) return;

    const total = Number(noteForm.total);
    if (!noteForm.issue_date || !noteForm.due_date) {
      setNoteFormError('Debe indicar la fecha de registro y vencimiento.');
      return;
    }
    if (noteForm.due_date < noteForm.issue_date) {
      setNoteFormError('La fecha de vencimiento no puede ser menor a la de registro.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setNoteFormError('El monto total debe ser mayor a 0.');
      return;
    }
    if (noteModalMode === 'edit' && !noteForm.justification.trim()) {
      setNoteFormError('La observación es obligatoria para editar el crédito.');
      return;
    }

    setIsLoading(true);
    setNoteFormError(null);
    showFeedback('loading', noteModalMode === 'create' ? 'Registrando crédito' : 'Actualizando crédito', 'Guardando cambios...');
    actionLockRef.current = true;

    try {
      let savedNote: CreditNote;

      if (noteModalMode === 'create') {
        savedNote = await creditService.createCreditNote({
          branch_id: branchId,
          customer_id: selectedCustomer.id,
          folio: noteForm.folio,
          issue_date: noteForm.issue_date,
          due_date: noteForm.due_date,
          total,
          credit_days_applied: selectedCustomer.default_credit_days || 30,
          notes: noteForm.notes || null,
        });

        logMaterialsAudit({
          branch_id: branchId,
          branch_name: selectedBranch?.name ?? null,
          user_id: currentUser.id,
          user_name: currentUser.name,
          action_type: 'CREAR',
          entity_type: 'nota_credito',
          entity_id: String(savedNote.id),
          description: `Crédito creado: ${savedNote.folio}`,
          new_data: savedNote as unknown as Record<string, unknown>,
        });
      } else {
        if (!editingNote) return;
        savedNote = await creditService.updateCreditNote(editingNote.id, {
          folio: noteForm.folio,
          issue_date: noteForm.issue_date,
          due_date: noteForm.due_date,
          total,
          notes: noteForm.notes || null,
        });

        logMaterialsAudit({
          branch_id: branchId,
          branch_name: selectedBranch?.name ?? null,
          user_id: currentUser.id,
          user_name: currentUser.name,
          action_type: 'ACTUALIZAR',
          entity_type: 'nota_credito',
          entity_id: String(savedNote.id),
          description: `Crédito actualizado: ${savedNote.folio}`,
          justification: noteForm.justification.trim(),
          previous_data: editingNote as unknown as Record<string, unknown>,
          new_data: savedNote as unknown as Record<string, unknown>,
        });
      }

      if (isHistoryModalOpen) {
        await refreshCustomerNotes(selectedCustomer);
      }
      await loadCustomers();
      setIsNoteModalOpen(false);
      setEditingNote(null);
      setNoteForm(createDefaultNoteForm(selectedCustomer.default_credit_days || 30));
      showFeedback('success', noteModalMode === 'create' ? 'Crédito registrado' : 'Crédito actualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el crédito.';
      setNoteFormError(message);
      showFeedback('error', 'No se pudo guardar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleRequestDeleteNote = (note: CreditNoteWithStatus) => {
    setNoteToDelete(note);
    setDeleteNoteJustification('');
    setDeleteNoteError(null);
    setIsDeleteNoteModalOpen(true);
  };

  const handleConfirmDeleteNote = async () => {
    if (actionLockRef.current) return;
    if (!selectedCustomer || !noteToDelete) return;
    if (!deleteNoteJustification.trim()) {
      setDeleteNoteError('La observación es obligatoria.');
      return;
    }

    setIsLoading(true);
    showFeedback('loading', 'Eliminando nota', 'Procesando eliminación...');
    actionLockRef.current = true;

    try {
      await creditService.deleteNote(noteToDelete.id);

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'nota_credito',
        entity_id: String(noteToDelete.id),
        description: `Nota de crédito eliminada: ${noteToDelete.folio}`,
        justification: deleteNoteJustification.trim(),
        previous_data: noteToDelete as unknown as Record<string, unknown>,
      });

      const refreshedNotes = await creditService.listNotesByCustomer(selectedCustomer.id);
      setHistoryNotes(buildHistoryNotes(refreshedNotes, selectedCustomer));
      setIsDeleteNoteModalOpen(false);
      setNoteToDelete(null);
      setDeleteNoteJustification('');
      setDeleteNoteError(null);
      await loadCustomers();
      showFeedback('success', 'Nota eliminada', 'La nota y sus abonos asociados fueron eliminados.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la nota.';
      setError(message);
      showFeedback('error', 'No se pudo eliminar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleCreateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!branchId) return;

    setIsLoading(true);
    setError(null);
    actionLockRef.current = true;
    showFeedback('loading', 'Creando cliente', 'Guardando cliente...');

    try {
      const customer = await creditService.createCustomer({
        branch_id: branchId,
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        credit_limit: Number(formData.credit_limit),
        default_credit_days: 30,
        policy: 'CERO_TOLERANCIA',
        allow_cash_if_blocked: formData.allow_cash_if_blocked,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'CREAR',
        entity_type: 'cliente',
        entity_id: String(customer.id),
        description: `Cliente creado: ${customer.name}`,
        new_data: customer as unknown as Record<string, unknown>,
      });

      setIsCreateModalOpen(false);
      setFormData(defaultCustomerForm);
      setCurrentPage(1);
      await loadCustomers();
      showFeedback('success', 'Cliente creado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el cliente.';
      setError(message);
      showFeedback('error', 'No se pudo crear', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleOpenEditCustomer = (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      credit_limit: Number(customer.credit_limit ?? 0),
      default_credit_days: Number(customer.default_credit_days) === 15 ? 15 : 30,
      policy: 'CERO_TOLERANCIA',
      allow_cash_if_blocked: customer.allow_cash_if_blocked ?? true,
      justification: '',
    });
    setIsEditModalOpen(true);
  };

  const handleOpenAddresses = async (customer: CreditCustomer) => {
    setAddressCustomer(customer);
    setAddressRows([]);
    setAddressLabel('');
    setAddressValue('');
    setAddressError(null);
    setEditingAddress(null);
    setIsAddressFormModalOpen(false);
    setAddressToDelete(null);
    setIsAddressModalOpen(true);
    try {
      await loadCustomerAddresses(customer.id);
    } catch {
      setAddressError('No se pudieron cargar las direcciones.');
    }
  };

  const handleEditAddress = (row: CustomerAddress) => {
    setEditingAddress(row);
    setAddressLabel(row.label ?? '');
    setAddressValue(row.address);
    setAddressError(null);
    setIsAddressFormModalOpen(true);
  };

  const handleSaveAddress = async () => {
    if (actionLockRef.current) return;
    if (!addressCustomer) return;
    const normalizedAddress = addressValue.trim();
    if (!normalizedAddress) {
      setAddressError('La dirección es obligatoria.');
      return;
    }

    actionLockRef.current = true;
    try {
      if (editingAddress) {
        await creditService.updateAddress(editingAddress.id, {
          label: addressLabel,
          address: normalizedAddress,
        });
        showFeedback('success', 'Dirección actualizada', `Se actualizó una dirección para ${addressCustomer.name}.`);
      } else {
        await creditService.addAddress({
          customer_id: addressCustomer.id,
          label: addressLabel,
          address: normalizedAddress,
        });
        showFeedback('success', 'Dirección agregada', `Se agregó una nueva dirección para ${addressCustomer.name}.`);
      }

      setAddressLabel('');
      setAddressValue('');
      setEditingAddress(null);
      setAddressError(null);
      setIsAddressFormModalOpen(false);
      await loadCustomerAddresses(addressCustomer.id);
    } catch (err: any) {
      setAddressError(err?.message ?? 'No se pudo guardar la dirección.');
    } finally {
      actionLockRef.current = false;
    }
  };

  const handleDeleteAddress = async () => {
    if (actionLockRef.current) return;
    if (!addressCustomer || !addressToDelete) return;
    actionLockRef.current = true;
    try {
      await creditService.deleteAddress(addressToDelete.id);
      await loadCustomerAddresses(addressCustomer.id);
      if (editingAddress?.id === addressToDelete.id) {
        setEditingAddress(null);
        setAddressLabel('');
        setAddressValue('');
        setIsAddressFormModalOpen(false);
      }
      showFeedback('success', 'Dirección eliminada', `Se eliminó una dirección de ${addressCustomer.name}.`);
      setAddressToDelete(null);
      setIsDeleteAddressModalOpen(false);
    } catch (err: any) {
      setAddressError(err?.message ?? 'No se pudo eliminar la dirección.');
      setAddressToDelete(null);
      setIsDeleteAddressModalOpen(false);
    } finally {
      actionLockRef.current = false;
    }
  };

  const handleUpdateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!selectedCustomer) return;
    if (!formData.justification.trim()) {
      setError('La observación es obligatoria para editar el cliente.');
      return;
    }

    setIsLoading(true);
    setError(null);
    actionLockRef.current = true;
    showFeedback('loading', 'Actualizando cliente', 'Guardando cambios...');

    try {
      const updated = await creditService.updateCustomer(selectedCustomer.id, {
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        credit_limit: Number(formData.credit_limit),
        default_credit_days: Number(selectedCustomer.default_credit_days) === 15 ? 15 : 30,
        policy: 'CERO_TOLERANCIA',
        allow_cash_if_blocked: formData.allow_cash_if_blocked,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'cliente',
        entity_id: String(updated.id),
        description: `Cliente actualizado: ${updated.name}`,
        justification: formData.justification.trim(),
        previous_data: selectedCustomer as unknown as Record<string, unknown>,
        new_data: updated as unknown as Record<string, unknown>,
      });

      setIsEditModalOpen(false);
      setSelectedCustomer(null);
      setFormData(defaultCustomerForm);
      await loadCustomers();
      showFeedback('success', 'Cliente actualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el cliente.';
      setError(message);
      showFeedback('error', 'No se pudo actualizar', message);
    } finally {
      setIsLoading(false);
      actionLockRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <input
          type="text"
          placeholder="Buscar cliente..."
          className="w-full md:flex-1 p-3 rounded-xl border border-gray-200 outline-none text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={feedbackLoading || isLoading}
          className="w-full md:w-auto bg-slate-900 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-2">
        {ALPHABET_FILTERS.map((letter) => {
          const isActive = selectedLetter === letter;
          return (
            <button
              key={letter}
              type="button"
              onClick={() => setSelectedLetter((prev) => (prev === letter ? '' : letter))}
              className={`h-9 min-w-9 rounded-xl px-3 text-xs font-black uppercase transition-colors ${
                isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={closeFeedback}
      />

      <WalletCreateModal
        isOpen={isWalletCreateOpen}
        customers={eligibleWalletCustomers}
        selectedCustomer={selectedWalletCustomer}
        initialAmount={walletInitialAmount}
        notes={walletCreateNotes}
        error={walletCreateError}
        isLoading={isWalletCreateLoading}
        onClose={() => {
          setIsWalletCreateOpen(false);
          resetWalletCreateState();
        }}
        onSearch={handleSearchEligibleWalletCustomers}
        onSelectCustomer={setSelectedWalletCustomer}
        onInitialAmountChange={setWalletInitialAmount}
        onNotesChange={setWalletCreateNotes}
        onSubmit={handleCreateWallet}
      />

      <WalletRechargeModal
        isOpen={isWalletRechargeOpen}
        wallet={walletToRecharge}
        amount={walletRechargeAmount}
        reference={walletRechargeReference}
        notes={walletRechargeNotes}
        error={walletRechargeError}
        isLoading={isWalletRechargeLoading}
        onClose={() => {
          setIsWalletRechargeOpen(false);
          setWalletToRecharge(null);
          setWalletRechargeError(null);
        }}
        onAmountChange={setWalletRechargeAmount}
        onReferenceChange={setWalletRechargeReference}
        onNotesChange={setWalletRechargeNotes}
        onSubmit={handleRechargeWallet}
      />

      <WalletHistoryModal
        isOpen={isWalletHistoryOpen}
        wallet={walletToHistory}
        movements={walletMovements}
        isLoading={isWalletHistoryLoading}
        onClose={() => {
          setIsWalletHistoryOpen(false);
          setWalletToHistory(null);
          setWalletMovements([]);
        }}
      />

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Seleccionados {selectedCustomerIds.length}
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="p-4 text-center">Sel.</th>
              <th className="p-4">Cliente</th>
              <th className="p-4 text-right">Límite</th>
              <th className="p-4 text-right">Deuda actual</th>
              <th className="p-4 text-right">Disponible</th>
              <th className="p-4 text-right">Saldo a favor</th>
              <th className="p-4 text-center">Cliente</th>
              <th className="p-4 text-center">Credito</th>
              <th className="p-4 text-center">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((customer) => {
              const summary = summaries[customer.id];
              const debt = summary?.saldo_total_pendiente ?? 0;
              const available = summary?.disponible_credito ?? 0;
              const wallet = walletsByCustomerId[customer.id];
              return (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleCustomerSelection(customer.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{customer.name}</p>
                    <p className="text-[10px] text-slate-400">{customer.phone || '—'}</p>
                    <p className="text-[10px] text-slate-400">{customer.address || 'Sin dirección'}</p>
                  </td>
                  <td className="p-4 text-right font-mono text-sm">{formatCurrency(Number(customer.credit_limit))}</td>
                  <td className="p-4 text-right">
                    <span className={`font-black ${debt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {formatCurrency(debt)}
                    </span>
                  </td>
                  <td className="p-4 text-right font-black text-green-600">{formatCurrency(available)}</td>
                  <td className="p-4 text-right">
                    <div className="space-y-1">
                      <p className="font-black text-violet-600">{formatCurrency(wallet?.current_balance ?? 0)}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{wallet?.status ?? 'SIN SALDO'}</p>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenEditCustomer(customer)}
                        className="bg-sky-100 p-2 rounded-lg"
                        title="Editar cliente"
                      >
                        <Pencil className="w-4 h-4 text-sky-700" />
                      </button>
                      <button
                        onClick={() => void handleOpenAddresses(customer)}
                        className="bg-orange-100 p-2 rounded-lg"
                        title="Direcciones"
                      >
                        <MapPin className="w-4 h-4 text-orange-700" />
                      </button>
                      <button
                        onClick={() => handleDownloadCustomerPdf(customer)}
                        className="bg-slate-100 p-2 rounded-lg"
                        title="Exportar PDF"
                      >
                        <FileDown className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenPaymentHistory(customer)}
                        className="bg-violet-100 p-2 rounded-lg"
                        title="Historial de abonos"
                      >
                        <Wallet className="w-4 h-4 text-violet-700" />
                      </button>
                      <button
                        onClick={() => handleOpenHistory(customer)}
                        className="bg-slate-100 p-2 rounded-lg"
                        title="Notas de credito"
                      >
                        <Eye className="w-4 h-4 text-slate-600" />
                      </button>
                      <button
                        onClick={() => handleOpenCashSalesHistory(customer)}
                        className="bg-violet-100 p-2 rounded-lg"
                        title="Ventas en efectivo"
                      >
                        <FileImage className="w-4 h-4 text-violet-700" />
                      </button>
                      <button
                        onClick={() => handleOpenPayment(customer)}
                        className="bg-green-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        Abonar
                      </button>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {wallet ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openWalletRechargeModal(wallet)}
                            className="bg-emerald-100 p-2 rounded-lg"
                            title="Recargar saldo a favor"
                          >
                            <CreditCard className="w-4 h-4 text-emerald-700" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openWalletHistoryModal(wallet)}
                            className="bg-slate-100 p-2 rounded-lg"
                            title="Historial de saldo a favor"
                          >
                            <History className="w-4 h-4 text-slate-700" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openWalletCreateModal(customer)}
                          className="bg-violet-100 p-2 rounded-lg"
                          title="Habilitar saldo a favor"
                        >
                          <CreditCard className="w-4 h-4 text-violet-700" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-400 text-sm">
                  No hay clientes registrados en esta sucursal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="p-4 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Mostrando {customers.length} de {totalCustomers} clientes
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs font-black text-slate-700">
              Página {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in">
            <div className="bg-slate-900 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Nuevo Cliente de Crédito</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest">Sucursal {selectedBranchId || '—'}</p>
            </div>
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del cliente</label>
                <input
                  required
                  placeholder="Nombre"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                <input
                  placeholder="Teléfono"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                <input
                  placeholder="Dirección"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Límite de crédito</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Límite"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData((prev) => ({ ...prev, credit_limit: Number(e.target.value) }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                <input
                  type="checkbox"
                  checked={formData.allow_cash_if_blocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, allow_cash_if_blocked: e.target.checked }))}
                />
                Permitir contado si está bloqueado
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={feedbackLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in">
            <div className="bg-sky-700 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Editar Cliente</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest">Sucursal {selectedBranchId || '—'}</p>
            </div>
            <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del cliente</label>
                <input
                  required
                  placeholder="Nombre"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                <input
                  placeholder="Teléfono"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                <input
                  placeholder="Dirección"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Límite de crédito</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Límite"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.credit_limit === 0 ? '' : formData.credit_limit}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      credit_limit: e.target.value === '' ? 0 : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                <input
                  type="checkbox"
                  checked={formData.allow_cash_if_blocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, allow_cash_if_blocked: e.target.checked }))}
                />
                Permitir contado si está bloqueado
              </label>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observación obligatoria</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Indique por qué se modifica el cliente"
                  className="w-full p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm resize-none"
                  value={formData.justification}
                  onChange={(e) => setFormData((prev) => ({ ...prev, justification: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedCustomer(null);
                    setFormData(defaultCustomerForm);
                  }}
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-sky-700 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isLoading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddressModalOpen && addressCustomer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="bg-orange-600 p-6 text-white flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Direcciones del cliente</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-100">{addressCustomer.name}</p>
              </div>
              <button
                onClick={() => {
                  setIsAddressModalOpen(false);
                  setAddressCustomer(null);
                  setAddressRows([]);
                  setAddressLabel('');
                  setAddressValue('');
                  setAddressError(null);
                  setEditingAddress(null);
                  setIsAddressFormModalOpen(false);
                  setAddressToDelete(null);
                }}
                className="text-2xl text-white/80"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddress(null);
                    setAddressLabel('');
                    setAddressValue('');
                    setAddressError(null);
                    setIsAddressFormModalOpen(true);
                  }}
                  disabled={feedbackLoading || isLoading}
                  className="rounded-xl bg-orange-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  + Nueva dirección
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Dirección</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {addressRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-4 text-sm text-slate-400 text-center">No hay direcciones registradas.</td>
                      </tr>
                    )}
                    {addressRows.map((row) => (
                      <tr key={row.id}>
                        <td className="p-3 text-xs font-black text-slate-700">{row.is_default ? 'Principal' : (row.label?.trim() || 'Secundaria')}</td>
                        <td className="p-3 text-sm font-semibold text-slate-700">{row.address}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditAddress(row)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"
                              title="Editar dirección"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddressToDelete(row);
                                setIsDeleteAddressModalOpen(true);
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500"
                              title="Eliminar dirección"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddressFormModalOpen && addressCustomer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-orange-600 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">
                {editingAddress ? 'Editar dirección' : 'Nueva dirección'}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-100">{addressCustomer.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                <input
                  placeholder="Etiqueta opcional"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={addressLabel}
                  onChange={(e) => setAddressLabel(e.target.value)}
                />
                <input
                  placeholder="Nueva dirección"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={addressValue}
                  onChange={(e) => {
                    setAddressValue(e.target.value);
                    if (addressError) setAddressError(null);
                  }}
                />
              </div>
              {addressError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                  {addressError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddressFormModalOpen(false);
                    setEditingAddress(null);
                    setAddressLabel('');
                    setAddressValue('');
                    setAddressError(null);
                  }}
                  disabled={feedbackLoading || isLoading}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAddress()}
                  disabled={feedbackLoading || isLoading}
                  className="rounded-xl bg-orange-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isLoading ? 'Guardando...' : editingAddress ? 'Guardar cambios' : 'Agregar dirección'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNoteModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-slate-900 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">
                {noteModalMode === 'create' ? 'Nuevo crédito' : 'Editar crédito'}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">
                {selectedCustomer.name}
              </p>
            </div>
            <form onSubmit={handleSubmitNote} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Folio</label>
                  <input
                    placeholder="Automático si lo deja vacío"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={noteForm.folio}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, folio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto total</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={noteForm.total === 0 ? '' : noteForm.total}
                    onChange={(e) =>
                      setNoteForm((prev) => ({
                        ...prev,
                        total: e.target.value === '' ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha de registro</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={noteForm.issue_date}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, issue_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha de vencimiento</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={noteForm.due_date}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm resize-none"
                  value={noteForm.notes}
                  onChange={(e) => setNoteForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              {noteModalMode === 'edit' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observación obligatoria</label>
                  <textarea
                    rows={3}
                    className="w-full p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm resize-none"
                    placeholder="Indique por qué se modifica el crédito"
                    value={noteForm.justification}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, justification: e.target.value }))}
                  />
                </div>
              )}
              {noteFormError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                  {noteFormError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNoteModalOpen(false);
                    setEditingNote(null);
                    setNoteFormError(null);
                    setNoteForm(createDefaultNoteForm(selectedCustomer.default_credit_days || 30));
                  }}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isLoading ? 'Guardando...' : noteModalMode === 'create' ? 'Guardar crédito' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">{historyView === 'CASH' ? 'Ventas en Efectivo' : 'Notas de Crédito'}</h3>
                <p className="text-orange-400 font-bold tracking-widest uppercase text-[10px] mt-1">{selectedCustomer.name}</p>
              </div>
              <div className="flex items-center gap-3">
{historyView === 'CREDIT' && (
                <button
                  type="button"
                  onClick={() => openCreateNoteModal(selectedCustomer)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  <Plus className="h-4 w-4" />
                  Nuevo crédito
                </button>
                )}
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    type="text"
                    placeholder={historyView === 'CASH' ? 'Buscar por venta o referencia...' : 'Buscar por folio...'}
                    className="w-full md:w-64 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
                    value={historySearchTerm}
                    onChange={(e) => {
                      setHistorySearchTerm(e.target.value);
                      setHistoryPage(1);
                    }}
                  />
                  {historyView === 'CREDIT' && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'TODAS', label: 'Todas' },
                        { id: 'VENCIDA', label: 'Vencidas' },
                        { id: 'ABIERTA', label: 'Abiertas' },
                        { id: 'PAGADA', label: 'Completado' },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setHistoryStatusFilter(option.id as 'TODAS' | 'VENCIDA' | 'ABIERTA' | 'PAGADA');
                            setHistoryPage(1);
                          }}
                          className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                            historyStatusFilter === option.id
                              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                              : 'border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-orange-500'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <table className="w-full text-left bg-white rounded-3xl overflow-hidden border border-slate-200">
                <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                  <tr>
                    {historyView === 'CREDIT' && <th className="p-4 text-center">Sel.</th>}
                    <th className="p-4">Folio</th>
                    <th className="p-4">Emisión</th>
                    {historyView === 'CREDIT' && <th className="p-4">Vence</th>}
                    <th className="p-4 text-right">Total</th>
                    {historyView === 'CREDIT' && <th className="p-4 text-right">Saldo</th>}
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedHistoryRows.map((row) => {
                    const isExpanded = expandedHistoryNoteId === row.rowKey;
                    const summary = noteSaleSummaries[row.rowKey];
                    const isLoadingSummary = loadingNoteSaleId === row.rowKey;
                    const summaryTotal = Number(
                      summary?.total_amount
                      ?? summary?.items.reduce((acc, item) => acc + (Number(item.qty) * Number(item.unit_price)), 0)
                      ?? row.total
                      ?? 0
                    );
                    const statusClass = row.status === 'VENCIDA'
                      ? 'bg-red-100 text-red-600'
                      : row.status === 'PAGADA'
                        ? 'bg-green-100 text-green-600'
                        : row.status === 'EFECTIVO'
                          ? 'bg-sky-100 text-sky-600'
                          : row.status === 'BILLETERA'
                            ? 'bg-violet-100 text-violet-600'
                            : row.status === 'HIBRIDA'
                              ? 'bg-amber-100 text-amber-600'
                              : row.status === 'SIN COSTO'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-amber-100 text-amber-600';

                    return (
                      <React.Fragment key={row.rowKey}>
                        <tr
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => {
                            void toggleHistorySaleSummary(row);
                          }}
                        >
                          {historyView === 'CREDIT' && (
                          <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                            {row.kind === 'credit' && row.note ? (
                              <input
                                type="checkbox"
                                checked={selectedHistoryNoteIds.includes(row.note.id)}
                                onChange={() => toggleHistoryNoteSelection(row.note!.id)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          )}
                          <td className="p-4 text-xs font-bold text-slate-700">{row.displayCode}</td>
                          <td className="p-4 text-xs text-slate-500">{row.issue_date}</td>
                          {historyView === 'CREDIT' && <td className="p-4 text-xs text-slate-500">{row.due_date || '—'}</td>}
                          <td className="p-4 text-right text-xs font-bold">{formatCurrency(row.total)}</td>
                          {historyView === 'CREDIT' && <td className={`p-4 text-right text-xs font-black ${row.balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>{formatCurrency(row.balance)}</td>}
                          <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${statusClass}`}>
                              {row.status === 'BILLETERA' ? 'SALDO A FAVOR' : row.status}
                            </span>
                          </td>
                          <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              {row.kind === 'cash' && row.sale ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openSaleEvidenceUploadModal(row.sale!)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-600 transition-colors hover:bg-violet-100"
                                    title="Subir comprobante"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    Subir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openSaleEvidenceViewerModal(row.sale!)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-sky-600 transition-colors hover:bg-sky-100"
                                    title="Ver documento o imagen"
                                  >
                                    <FileImage className="h-4 w-4" />
                                    Ver
                                    <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] text-white">{saleEvidencesByTransactionId[String(row.sale.id)]?.length ?? 0}</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handlePrintSaleRow(row)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
                                    title="Imprimir venta"
                                  >
                                    <FileDown className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditNoteModal(row.note!)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100"
                                    title="Editar nota"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestDeleteNote(row.note!)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                                    title="Eliminar nota"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={historyView === 'CREDIT' ? 8 : 5} className="bg-slate-50 px-4 py-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                {isLoadingSummary && (
                                  <p className="text-sm font-semibold text-slate-400">Cargando resumen de la venta...</p>
                                )}
                                {!isLoadingSummary && !summary && (
                                  <p className="text-sm font-semibold text-slate-400">No se pudo cargar el resumen de la venta.</p>
                                )}
                                {!isLoadingSummary && summary && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° venta</p>
                                        <p className="mt-1 text-sm font-black text-slate-800">{summary.saleId}</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</p>
                                        <p className="mt-1 text-sm font-black text-slate-800">{formatLocalDateTime(summary.created_at)}</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Referencia</p>
                                        <p className="mt-1 text-sm font-black text-slate-800">{summary.reference || '—'}</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
                                        <p className="mt-1 text-sm font-black text-emerald-600">{formatCurrency(summaryTotal)}</p>
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                      <table className="w-full text-left">
                                        <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                          <tr>
                                            <th className="p-3">Producto</th>
                                            <th className="p-3">Presentación</th>
                                            <th className="p-3">Tipo de venta</th>
                                            <th className="p-3 text-right">Cantidad</th>
                                            <th className="p-3 text-right">Sub total</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {summary.items.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                              <td className="p-3 text-xs font-bold text-slate-700">{item.product_name || '—'}</td>
                                              <td className="p-3 text-xs text-slate-600">{item.presentation}</td>
                                              <td className="p-3 text-xs text-slate-600">{item.sale_type}</td>
                                              <td className="p-3 text-right text-xs font-bold text-slate-600">{formatNumber(Number(item.qty))}</td>
                                              <td className="p-3 text-right text-xs font-black text-slate-900">{formatCurrency(Number(item.qty) * Number(item.unit_price))}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredHistoryRows.length === 0 && (
                    <tr>
                      <td colSpan={historyView === 'CREDIT' ? 8 : 5} className="p-8 text-center text-slate-400 text-sm">Sin ventas registradas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filteredHistoryRows.length > 0 && (
                <div className="mt-4 flex items-center justify-between px-2">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedHistoryRows.length} de {filteredHistoryRows.length} registros
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={historyPage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-xs font-black text-slate-700">
                      {historyPage} / {historyTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
                      disabled={historyPage >= historyTotalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="bg-green-600 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Registrar Abono</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest">Para: {selectedCustomer.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <input
                  placeholder="Buscar por folio..."
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentSearchTerm}
                  onChange={(e) => {
                    setPaymentSearchTerm(e.target.value);
                    setPaymentPage(1);
                  }}
                />
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="p-3">Folio</th>
                      <th className="p-3">Registro</th>
                      <th className="p-3">Vence</th>
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedOpenNotes.map((note) => (
                      <tr key={note.id}>
                        <td className="p-3 text-xs font-bold text-slate-700">{getDisplayNoteCode(note)}</td>
                        <td className="p-3 text-xs text-slate-500">{note.issue_date}</td>
                        <td className="p-3 text-xs text-slate-500">{note.due_date}</td>
                        <td className="p-3 text-right text-xs font-black text-red-600">{formatCurrency(Number(note.balance))}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => openPaymentEntryModal(note)}
                            disabled={feedbackLoading || isLoading}
                            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <Wallet className="h-4 w-4" />
                            Abonar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredOpenNotes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-sm">
                          No hay notas abiertas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredOpenNotes.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedOpenNotes.length} de {filteredOpenNotes.length} notas
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentPage((prev) => Math.max(1, prev - 1))}
                      disabled={paymentPage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-xs font-black text-slate-700">
                      {paymentPage} / {paymentTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPaymentPage((prev) => Math.min(paymentTotalPages, prev + 1))}
                      disabled={paymentPage >= paymentTotalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  disabled={feedbackLoading || isLoading}
                  className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPaymentEntryModalOpen && paymentTargetNote && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[72] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-green-600 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Registrar Abono</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest">
                {getDisplayNoteCode(paymentTargetNote)} · Saldo {formatCurrency(Number(paymentTargetNote.balance ?? 0))}
              </p>
            </div>
            <form onSubmit={handleRegisterPayment} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as CreditPaymentMethod)}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Monto del abono"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentAmount === 0 ? '' : paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                />
              </div>
              <input
                placeholder="Notas del abono"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evidencia (opcional)</label>
                  {paymentEvidenceFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentEvidenceFiles([]);
                        setPaymentEvidenceError(null);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-slate-300">
                    <Paperclip className="h-4 w-4" />
                    Adjuntar imagen o PDF
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      className="hidden"
                      onChange={handlePaymentEvidenceFilesChange}
                    />
                  </label>
                  <span className="text-xs text-slate-400">
                    {paymentEvidenceFiles.length > 0 ? `${paymentEvidenceFiles.length} archivo(s) listo(s)` : 'Máximo 10 MB por archivo'}
                  </span>
                </div>
                {paymentEvidenceError && <p className="text-xs font-bold text-red-500">{paymentEvidenceError}</p>}
                {paymentFormError && <p className="text-xs font-bold text-red-500">{paymentFormError}</p>}
                {paymentEvidenceFiles.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="space-y-2">
                      {paymentEvidenceFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-slate-600">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-slate-400">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPaymentEntryModalOpen(false);
                    setPaymentTargetNote(null);
                  }}
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isLoading ? 'Guardando...' : 'Confirmar Abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPaymentHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[65] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col">
            <div className="bg-violet-700 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">Historial de Abonos</h3>
                <p className="text-violet-100 font-bold tracking-widest uppercase text-[10px] mt-1">{selectedCustomer.name}</p>
              </div>
              <button
                onClick={() => setIsPaymentHistoryModalOpen(false)}
                className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <table className="w-full text-left bg-white rounded-3xl overflow-hidden border border-slate-200">
                <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Folio</th>
                    <th className="p-4">Método</th>
                    <th className="p-4 text-right">Monto</th>
                    <th className="p-4">Referencia</th>
                    <th className="p-4">Nota</th>
                    <th className="p-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedPaymentHistory.map((payment) => {
                    const note = getPaymentNote(payment.note_id);
                    return (
                      <tr key={payment.id} className="hover:bg-slate-50">
                        <td className="p-4 text-xs text-slate-500">{String(payment.paid_at ?? '').replace('T', ' ').slice(0, 16)}</td>
                        <td className="p-4 text-xs font-bold text-slate-700">{note ? getDisplayNoteCode(note) : '—'}</td>
                        <td className="p-4 text-xs font-bold text-slate-700">{payment.method}</td>
                        <td className="p-4 text-right text-xs font-black text-emerald-600">{formatCurrency(Number(payment.amount ?? 0))}</td>
                        <td className="p-4 text-xs text-slate-500">{payment.reference || '—'}</td>
                        <td className="p-4 text-xs text-slate-500">{payment.notes || '—'}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPaymentEvidenceModal(payment)}
                              className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 text-slate-600 transition-colors hover:bg-slate-200"
                              title="Ver evidencias"
                            >
                              <FileImage className="h-4 w-4" />
                              <span className="text-[10px] font-black">
                                {paymentEvidencesByPaymentId[String(payment.id)]?.length ?? 0}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditPaymentModal(payment)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100"
                              title="Editar abono"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDeletePayment(payment)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                              title="Eliminar abono"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paymentHistory.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">Sin abonos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {paymentHistory.length > 0 && (
                <div className="mt-4 flex items-center justify-between px-2">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedPaymentHistory.length} de {paymentHistory.length} abonos
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={paymentHistoryPage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-xs font-black text-slate-700">
                      {paymentHistoryPage} / {paymentHistoryTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPaymentHistoryPage((prev) => Math.min(paymentHistoryTotalPages, prev + 1))}
                      disabled={paymentHistoryPage >= paymentHistoryTotalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isPaymentEvidenceModalOpen && selectedPaymentForEvidence && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">Evidencias del Abono</h3>
                <p className="text-slate-300 font-bold tracking-widest uppercase text-[10px] mt-1">
                  {getPaymentNote(selectedPaymentForEvidence.note_id) ? getDisplayNoteCode(getPaymentNote(selectedPaymentForEvidence.note_id) as CreditNote) : 'Sin folio'} · {formatLocalDateTime(selectedPaymentForEvidence.paid_at)}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsPaymentEvidenceModalOpen(false);
                  setSelectedPaymentForEvidence(null);
                }}
                className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
              {selectedPaymentEvidences.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                  Este abono no tiene evidencias adjuntas.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPaymentEvidences.map((evidence) => {
                    const secureUrl = evidence.secure_url || evidence.file_url;
                    const isPdf = (evidence.format ?? '').toLowerCase() === 'pdf' || evidence.resource_type === 'raw';
                    const isImage = evidence.resource_type === 'image' && !isPdf;
                    return (
                      <div key={evidence.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-800 truncate">
                              {evidence.original_filename || evidence.public_id || 'EVIDENCIA'}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {formatLocalDateTime(evidence.created_at)}
                              {evidence.bytes ? ` · ${(Number(evidence.bytes) / (1024 * 1024)).toFixed(2)} MB` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={secureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                            >
                              <Eye className="h-4 w-4" />
                              Abrir
                            </a>
                            <button
                              type="button"
                              onClick={() => requestDeleteSaleEvidence(evidence)}
                              className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-100"
                              title="Eliminar comprobante"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </button>
                          </div>
                        </div>
                        <div className="mt-4">
                          {isImage ? (
                            <a href={secureUrl} target="_blank" rel="noreferrer">
                              <img
                                src={secureUrl}
                                alt={evidence.original_filename || 'Evidencia'}
                                className="h-56 w-full rounded-2xl object-cover border border-slate-200"
                              />
                            </a>
                          ) : (
                            <a
                              href={secureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-56 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500"
                            >
                              <div className="text-center">
                                <FileDown className="mx-auto h-10 w-10" />
                                <p className="mt-3 text-sm font-black uppercase tracking-widest">
                                  {isPdf ? 'PDF adjunto' : 'Archivo adjunto'}
                                </p>
                              </div>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSaleEvidenceModalOpen && selectedSaleForEvidence && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">{saleEvidenceModalMode === 'upload' ? 'Subir Comprobante' : 'Documentos de Pago'}</h3>
                <p className="text-slate-300 font-bold tracking-widest uppercase text-[10px] mt-1">
                  Venta #{selectedSaleForEvidence.id} · {formatLocalDateTime(selectedSaleForEvidence.created_at)}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsSaleEvidenceModalOpen(false);
                  setSelectedSaleForEvidence(null);
                  setSaleEvidenceFiles([]);
                  setSaleEvidenceError(null);
                  setSaleEvidenceToDelete(null);
                  setDeleteSaleEvidenceJustification('');
                  setDeleteSaleEvidenceError(null);
                }}
                className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
              {saleEvidenceModalMode === 'upload' ? (
              <form onSubmit={handleUploadSaleEvidence} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Adjuntar comprobante</p>
                    <p className="text-xs text-slate-400">Imagen o PDF del pago en efectivo.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-slate-300">
                    <Paperclip className="h-4 w-4" />
                    Adjuntar archivo
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      className="hidden"
                      onChange={handleSaleEvidenceFilesChange}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-400">
                  {saleEvidenceFiles.length > 0 ? `${saleEvidenceFiles.length} archivo(s) listo(s)` : 'Máximo 10 MB por archivo'}
                </p>
                {saleEvidenceError && <p className="text-xs font-bold text-red-500">{saleEvidenceError}</p>}
                {saleEvidenceFiles.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="space-y-2">
                      {saleEvidenceFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-slate-600">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-slate-400">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSaleEvidenceFiles([]);
                      setSaleEvidenceError(null);
                    }}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={feedbackLoading || isLoading}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {feedbackLoading || isLoading ? 'Subiendo...' : 'Guardar comprobante'}
                  </button>
                </div>
              </form>
              ) : null}

              {saleEvidenceModalMode === 'view' && (selectedSaleEvidences.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                  Esta venta no tiene comprobantes adjuntos.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedSaleEvidences.map((evidence) => {
                    const secureUrl = evidence.secure_url || evidence.file_url;
                    const isPdf = (evidence.format ?? '').toLowerCase() === 'pdf' || evidence.resource_type === 'raw';
                    const isImage = evidence.resource_type === 'image' && !isPdf;
                    return (
                      <div key={evidence.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-800 truncate">
                              {evidence.original_filename || evidence.public_id || 'COMPROBANTE'}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {formatLocalDateTime(evidence.created_at)}
                              {evidence.bytes ? ` · ${(Number(evidence.bytes) / (1024 * 1024)).toFixed(2)} MB` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={secureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                            >
                              <Eye className="h-4 w-4" />
                              Abrir
                            </a>
                            <button
                              type="button"
                              onClick={() => requestDeleteSaleEvidence(evidence)}
                              className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-100"
                              title="Eliminar comprobante"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </button>
                          </div>
                        </div>
                        <div className="mt-4">
                          {isImage ? (
                            <a href={secureUrl} target="_blank" rel="noreferrer">
                              <img
                                src={secureUrl}
                                alt={evidence.original_filename || 'Comprobante'}
                                className="h-56 w-full rounded-2xl object-cover border border-slate-200"
                              />
                            </a>
                          ) : (
                            <a
                              href={secureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-56 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500"
                            >
                              <div className="text-center">
                                <FileDown className="mx-auto h-10 w-10" />
                                <p className="mt-3 text-sm font-black uppercase tracking-widest">
                                  {isPdf ? 'PDF adjunto' : 'Archivo adjunto'}
                                </p>
                              </div>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isEditPaymentModalOpen && editingPayment && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-violet-700 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Editar Abono</h3>
            </div>
            <form onSubmit={handleUpdatePayment} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                  <input
                    type="datetime-local"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={paymentEditForm.paid_at}
                    onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, paid_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={paymentEditForm.amount === 0 ? '' : paymentEditForm.amount}
                    onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, amount: e.target.value === '' ? 0 : Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</label>
                  <select
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={paymentEditForm.method}
                    onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, method: e.target.value as CreditPaymentMethod }))}
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referencia</label>
                  <input
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={paymentEditForm.reference}
                    onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, reference: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nota del abono</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm resize-none"
                  value={paymentEditForm.notes}
                  onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observación obligatoria</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm resize-none"
                  value={paymentEditForm.justification}
                  onChange={(e) => setPaymentEditForm((prev) => ({ ...prev, justification: e.target.value }))}
                />
              </div>
              {paymentEditError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                  {paymentEditError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditPaymentModalOpen(false);
                    setEditingPayment(null);
                    setPaymentEditForm(createDefaultPaymentEditForm());
                    setPaymentEditError(null);
                  }}
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading || isLoading}
                  className="flex-1 py-3 rounded-xl bg-violet-700 text-white font-black text-[10px] uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {feedbackLoading || isLoading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isDeleteNoteModalOpen}
        title="Eliminar nota de crédito"
        description={noteToDelete ? `Se eliminará la nota ${noteToDelete.folio} y sus abonos asociados.` : undefined}
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        noteLabel="Observación obligatoria"
        notePlaceholder="Indique por qué se elimina la nota"
        noteValue={deleteNoteJustification}
        noteRequired
        noteError={deleteNoteError}
        isProcessing={isLoading}
        onNoteChange={(value) => {
          setDeleteNoteJustification(value);
          if (deleteNoteError) setDeleteNoteError(null);
        }}
        onConfirm={handleConfirmDeleteNote}
        onCancel={() => {
          setIsDeleteNoteModalOpen(false);
          setNoteToDelete(null);
          setDeleteNoteJustification('');
          setDeleteNoteError(null);
        }}
      />

      <ConfirmModal
        isOpen={isDeletePaymentModalOpen}
        title="Eliminar abono"
        description="Se eliminará el abono seleccionado y se recalculará el saldo de la nota."
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        noteLabel="Observación obligatoria"
        notePlaceholder="Indique por qué se elimina el abono"
        noteValue={deletePaymentJustification}
        noteRequired
        noteError={deletePaymentError}
        isProcessing={isLoading}
        onNoteChange={(value) => {
          setDeletePaymentJustification(value);
          if (deletePaymentError) setDeletePaymentError(null);
        }}
        onConfirm={handleConfirmDeletePayment}
        onCancel={() => {
          setIsDeletePaymentModalOpen(false);
          setPaymentToDelete(null);
          setDeletePaymentJustification('');
          setDeletePaymentError(null);
        }}
      />

      <ConfirmModal
        isOpen={isDeleteAddressModalOpen}
        title="Eliminar dirección"
        description={addressToDelete ? `Se eliminará la dirección "${addressToDelete.label?.trim() || addressToDelete.address}".` : undefined}
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleDeleteAddress}
        onCancel={() => {
          setIsDeleteAddressModalOpen(false);
          setAddressToDelete(null);
        }}
      />

      <ConfirmModal
        isOpen={isDeleteSaleEvidenceModalOpen}
        title="Eliminar comprobante"
        description={saleEvidenceToDelete ? `Se eliminará el comprobante ${saleEvidenceToDelete.original_filename || saleEvidenceToDelete.public_id || ''}.` : 'Se eliminará el comprobante seleccionado.'}
        icon="🗑️"
        confirmText="Eliminar"
        cancelText="Cancelar"
        noteLabel="Observación obligatoria"
        notePlaceholder="Indique por qué se elimina el comprobante"
        noteValue={deleteSaleEvidenceJustification}
        noteRequired
        noteError={deleteSaleEvidenceError}
        isProcessing={isLoading}
        onNoteChange={(value) => {
          setDeleteSaleEvidenceJustification(value);
          if (deleteSaleEvidenceError) setDeleteSaleEvidenceError(null);
        }}
        onConfirm={handleConfirmDeleteSaleEvidence}
        onCancel={() => {
          setIsDeleteSaleEvidenceModalOpen(false);
          setSaleEvidenceToDelete(null);
          setDeleteSaleEvidenceJustification('');
          setDeleteSaleEvidenceError(null);
        }}
      />
    </div>
  );
};

export default CustomerScreen;
