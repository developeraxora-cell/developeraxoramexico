import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Branch, User } from '../../types';
import { creditService, type CreditCustomer, type CreditNote, type CreditNoteWithStatus, type CreditPaymentMethod, type CreditSummary } from '../../services/concretera/credit.service';
import { Eye, Plus, Wallet } from 'lucide-react';
import { formatCurrency } from '../../services/currency';

interface CustomerScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const defaultCustomerForm = {
  name: '',
  phone: '',
  credit_limit: 0,
  default_credit_days: 30,
  policy: 'CERO_TOLERANCIA' as const,
  allow_cash_if_blocked: true,
};

const CustomerScreen: React.FC<CustomerScreenProps> = ({ selectedBranchId, branches, currentUser }) => {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CreditSummary>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [openNotes, setOpenNotes] = useState<CreditNote[]>([]);
  const [noteRows, setNoteRows] = useState<Record<string, number>>({});
  const [historyNotes, setHistoryNotes] = useState<CreditNoteWithStatus[]>([]);
  const [formData, setFormData] = useState(defaultCustomerForm);
  const [paymentMethod, setPaymentMethod] = useState<CreditPaymentMethod>('EFECTIVO');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(term) || (customer.phone ?? '').toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const loadCustomers = useCallback(async () => {
    if (!branchId) {
      setCustomers([]);
      setSummaries({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const list = await creditService.listCustomersByBranch(branchId);
      const summaryEntries = await Promise.all(
        list.map(async (customer) => {
          const summary = await creditService.getCustomerSummary(customer);
          return [customer.id, summary] as const;
        })
      );

      const summaryMap = summaryEntries.reduce<Record<string, CreditSummary>>((acc, [id, summary]) => {
        acc[id] = summary;
        return acc;
      }, {});

      setCustomers(list);
      setSummaries(summaryMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar clientes.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleOpenHistory = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
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

  const handleCreateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId) return;

    setIsLoading(true);
    setError(null);

    try {
      await creditService.createCustomer({
        branch_id: branchId,
        name: formData.name,
        phone: formData.phone || null,
        credit_limit: Number(formData.credit_limit),
        default_credit_days: Number(formData.default_credit_days),
        policy: formData.policy,
        allow_cash_if_blocked: formData.allow_cash_if_blocked,
      });
      setIsCreateModalOpen(false);
      setFormData(defaultCustomerForm);
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
            {filteredCustomers.map((customer) => {
              const summary = summaries[customer.id];
              const debt = summary?.saldo_total_pendiente ?? 0;
              const available = summary?.disponible_credito ?? 0;
              return (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{customer.name}</p>
                    <p className="text-[10px] text-slate-400">{customer.phone || '—'}</p>
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
            {!isLoading && filteredCustomers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400 text-sm">
                  No hay clientes registrados en esta sucursal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                  <input
                    type="number"
                    min={0}
                    placeholder="Días de crédito"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                    value={formData.default_credit_days}
                    onChange={(e) => setFormData((prev) => ({ ...prev, default_credit_days: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Política de crédito</label>
                <select
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={formData.policy}
                  onChange={(e) => setFormData((prev) => ({ ...prev, policy: e.target.value as typeof formData.policy }))}
                >
                  <option value="CERO_TOLERANCIA">Cero tolerancia</option>
                  <option value="BLOQUEO_PARCIAL">Bloqueo parcial</option>
                </select>
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

      {isHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">Notas de Crédito</h3>
                <p className="text-orange-400 font-bold tracking-widest uppercase text-[10px] mt-1">{selectedCustomer.name}</p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all"
              >
                &times;
              </button>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyNotes.map((note) => (
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
                    </tr>
                  ))}
                  {historyNotes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">Sin notas registradas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-right">Abono</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {openNotes.map((note) => (
                      <tr key={note.id}>
                        <td className="p-3 text-xs font-bold text-slate-700">{note.folio}</td>
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
                        <td colSpan={3} className="p-6 text-center text-slate-400 text-sm">
                          No hay notas abiertas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
    </div>
  );
};

export default CustomerScreen;
