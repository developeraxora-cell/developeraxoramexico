import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Branch, User } from '../../types';
import { creditService, type CreditCustomer, type CreditNote, type CreditNoteWithStatus, type CreditPaymentMethod, type CreditSummary } from '../../services/credit/credit.service';
import { Eye, FileDown, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { formatCurrency } from '../../services/currency';
import { generateCustomerStatementPdf } from '../../services/pdf/customerStatementPdf';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';
import { logMaterialsAudit } from '../../services/audit/audit.service';

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
};

const MODAL_PAGE_SIZE = 5;
const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
const addDaysToDate = (base: string, days: number) => {
  const next = new Date(`${base}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + Math.max(1, days));
  return toDateInput(next);
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

const CustomerScreen: React.FC<CustomerScreenProps> = ({ selectedBranchId, branches, currentUser }) => {
  const PAGE_SIZE = 5;
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CreditSummary>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [openNotes, setOpenNotes] = useState<CreditNote[]>([]);
  const [noteRows, setNoteRows] = useState<Record<string, number>>({});
  const [historyNotes, setHistoryNotes] = useState<CreditNoteWithStatus[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [formData, setFormData] = useState(defaultCustomerForm);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteModalMode, setNoteModalMode] = useState<NoteModalMode>('create');
  const [editingNote, setEditingNote] = useState<CreditNoteWithStatus | null>(null);
  const [noteForm, setNoteForm] = useState(createDefaultNoteForm());
  const [noteFormError, setNoteFormError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CreditPaymentMethod>('EFECTIVO');
  const [paymentNotes, setPaymentNotes] = useState('');
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE)), [totalCustomers, PAGE_SIZE]);
  const historyTotalPages = useMemo(() => Math.max(1, Math.ceil(historyNotes.length / MODAL_PAGE_SIZE)), [historyNotes.length]);
  const paymentTotalPages = useMemo(() => Math.max(1, Math.ceil(openNotes.length / MODAL_PAGE_SIZE)), [openNotes.length]);
  const pagedHistoryNotes = useMemo(() => {
    const start = (historyPage - 1) * MODAL_PAGE_SIZE;
    return historyNotes.slice(start, start + MODAL_PAGE_SIZE);
  }, [historyNotes, historyPage]);
  const pagedOpenNotes = useMemo(() => {
    const start = (paymentPage - 1) * MODAL_PAGE_SIZE;
    return openNotes.slice(start, start + MODAL_PAGE_SIZE);
  }, [openNotes, paymentPage]);

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
      setTotalCustomers(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pageData = await creditService.listCustomersByBranchPaged(branchId, currentPage, PAGE_SIZE, debouncedSearchTerm);
      const summaryMap = await creditService.getSummariesForCustomers(pageData.rows);
      setCustomers(pageData.rows);
      setTotalCustomers(pageData.total);
      setSummaries(summaryMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar clientes.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, currentPage, debouncedSearchTerm, PAGE_SIZE]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleOpenHistory = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
    setHistoryPage(1);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar notas.';
      setError(message);
    }
  };

  const handleOpenPayment = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsPaymentModalOpen(true);
    setPaymentPage(1);
    setError(null);
    try {
      const notes = await creditService.listOpenNotesByCustomer(customer.id);
      setOpenNotes(notes);
      const initRows = notes.reduce<Record<string, number>>((acc, note) => {
        acc[note.id] = 0;
        return acc;
      }, {});
      setNoteRows(initRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar notas.';
      setError(message);
    }
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
      });
      setFeedbackOpen(false);
    } catch (err) {
      setFeedbackOpen(false);
      const message = err instanceof Error ? err.message : 'No se pudo generar el PDF del cliente.';
      showFeedback('error', 'PDF no disponible', message);
      setError(message);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const entries = Object.entries(noteRows).filter(([, amount]) => amount > 0);
    if (entries.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      for (const [noteId, amount] of entries) {
        const note = openNotes.find((n) => n.id === noteId);
        if (!note) continue;
        const safeAmount = Math.min(amount, Number(note.balance));
        if (safeAmount <= 0) continue;
        await creditService.createPayment({
          note_id: noteId,
          amount: safeAmount,
          method: paymentMethod,
          notes: paymentNotes || null,
        });
      }

      setIsPaymentModalOpen(false);
      setPaymentNotes('');
      setPaymentMethod('EFECTIVO');
      await loadCustomers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el abono.';
      setError(message);
    } finally {
      setIsLoading(false);
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
    }
  };

  const handleRequestDeleteNote = (note: CreditNoteWithStatus) => {
    setNoteToDelete(note);
    setDeleteNoteJustification('');
    setDeleteNoteError(null);
    setIsDeleteNoteModalOpen(true);
  };

  const handleConfirmDeleteNote = async () => {
    if (!selectedCustomer || !noteToDelete) return;
    if (!deleteNoteJustification.trim()) {
      setDeleteNoteError('La observación es obligatoria.');
      return;
    }

    setIsLoading(true);
    showFeedback('loading', 'Eliminando nota', 'Procesando eliminación...');

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
    }
  };

  const handleCreateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId) return;

    setIsLoading(true);
    setError(null);

    try {
      const customer = await creditService.createCustomer({
        branch_id: branchId,
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        credit_limit: Number(formData.credit_limit),
        default_credit_days: Number(formData.default_credit_days) === 15 ? 15 : 30,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el cliente.';
      setError(message);
    } finally {
      setIsLoading(false);
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
          className="w-full md:w-auto bg-slate-900 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
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

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="p-4">Cliente</th>
              <th className="p-4 text-right">Límite</th>
              <th className="p-4 text-right">Deuda actual</th>
              <th className="p-4 text-right">Disponible</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((customer) => {
              const summary = summaries[customer.id];
              const debt = summary?.saldo_total_pendiente ?? 0;
              const available = summary?.disponible_credito ?? 0;
              return (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
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
                  <td className="p-4 text-center space-x-2">
                    <button
                      onClick={() => handleDownloadCustomerPdf(customer)}
                      className="bg-slate-100 p-2 rounded-lg"
                      title="Exportar PDF"
                    >
                      <FileDown className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => handleOpenHistory(customer)}
                      className="bg-slate-100 p-2 rounded-lg"
                      title="Ver notas"
                    >
                      <Eye className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => handleOpenPayment(customer)}
                      className="bg-green-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Abonar
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400 text-sm">
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Días de crédito</label>
                  <select
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={formData.default_credit_days}
                    onChange={(e) => setFormData((prev) => ({ ...prev, default_credit_days: Number(e.target.value) }))}
                  >
                    <option value={15}>15 días</option>
                    <option value={30}>30 días</option>
                  </select>
                </div>
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
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase"
                >
                  Guardar
                </button>
              </div>
            </form>
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
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase"
                >
                  {noteModalMode === 'create' ? 'Guardar crédito' : 'Guardar cambios'}
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
                <h3 className="text-2xl font-black tracking-tighter">Notas de Crédito</h3>
                <p className="text-orange-400 font-bold tracking-widest uppercase text-[10px] mt-1">{selectedCustomer.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openCreateNoteModal(selectedCustomer)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  <Plus className="h-4 w-4" />
                  Nuevo crédito
                </button>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <table className="w-full text-left bg-white rounded-3xl overflow-hidden border border-slate-200">
                <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Folio</th>
                    <th className="p-4">Emisión</th>
                    <th className="p-4">Vence</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-right">Saldo</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedHistoryNotes.map((note) => (
                    <tr key={note.id} className="hover:bg-slate-50">
                      <td className="p-4 text-xs font-bold text-slate-700">{note.folio}</td>
                      <td className="p-4 text-xs text-slate-500">{note.issue_date}</td>
                      <td className="p-4 text-xs text-slate-500">{note.due_date}</td>
                      <td className="p-4 text-right text-xs font-bold">{formatCurrency(Number(note.total))}</td>
                      <td className="p-4 text-right text-xs font-black text-red-600">{formatCurrency(Number(note.balance))}</td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${note.status === 'VENCIDA'
                              ? 'bg-red-100 text-red-600'
                              : note.status === 'PAGADA'
                                ? 'bg-green-100 text-green-600'
                                : 'bg-amber-100 text-amber-600'
                            }`}
                        >
                          {note.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditNoteModal(note)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100"
                            title="Editar nota"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDeleteNote(note)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                            title="Eliminar nota"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {historyNotes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">Sin notas registradas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {historyNotes.length > 0 && (
                <div className="mt-4 flex items-center justify-between px-2">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedHistoryNotes.length} de {historyNotes.length} notas
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
                  placeholder="Notas del abono"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
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
                      <th className="p-3 text-right">Abono</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedOpenNotes.map((note) => (
                      <tr key={note.id}>
                        <td className="p-3 text-xs font-bold text-slate-700">{note.folio}</td>
                        <td className="p-3 text-xs text-slate-500">{note.issue_date}</td>
                        <td className="p-3 text-xs text-slate-500">{note.due_date}</td>
                        <td className="p-3 text-right text-xs font-black text-red-600">{formatCurrency(Number(note.balance))}</td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min={0}
                            className="w-24 p-2 bg-white border border-slate-200 rounded-xl text-xs text-right"
                            value={noteRows[note.id] ?? 0}
                            onChange={(e) =>
                              setNoteRows((prev) => ({ ...prev, [note.id]: Number(e.target.value) }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {openNotes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-sm">
                          No hay notas abiertas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {openNotes.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedOpenNotes.length} de {openNotes.length} notas
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
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white font-black text-[10px] uppercase"
                >
                  Confirmar Abono
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
    </div>
  );
};

export default CustomerScreen;
