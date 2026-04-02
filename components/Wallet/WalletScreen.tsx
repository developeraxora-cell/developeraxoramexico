import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, History, PlusCircle } from 'lucide-react';
import type { Branch, User } from '../../types';
import { walletService, type CustomerWalletMovement, type CustomerWalletSummary } from '../../services/wallet.service';
import type { CreditCustomer } from '../../services/credit/credit.service';
import { formatCurrency } from '../../services/currency';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import { logMaterialsAudit } from '../../services/audit/audit.service';
import WalletCreateModal from './WalletCreateModal';
import WalletRechargeModal from './WalletRechargeModal';
import WalletHistoryModal from './WalletHistoryModal';

interface WalletScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const WalletScreen: React.FC<WalletScreenProps> = ({ selectedBranchId, branches, currentUser }) => {
  const [wallets, setWallets] = useState<CustomerWalletSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [eligibleCustomers, setEligibleCustomers] = useState<CreditCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [initialAmount, setInitialAmount] = useState('10000');
  const [createNotes, setCreateNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const [walletToRecharge, setWalletToRecharge] = useState<CustomerWalletSummary | null>(null);
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeReference, setRechargeReference] = useState('');
  const [rechargeNotes, setRechargeNotes] = useState('');
  const [rechargeError, setRechargeError] = useState<string | null>(null);
  const [isRechargeLoading, setIsRechargeLoading] = useState(false);
  const [walletToHistory, setWalletToHistory] = useState<CustomerWalletSummary | null>(null);
  const [walletMovements, setWalletMovements] = useState<CustomerWalletMovement[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('alert');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const actionLockRef = useRef(false);

  const branchId = useMemo(() => {
    const match = branches.find((branch) => branch.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return String(selectedBranchId || '');
  }, [branches, selectedBranchId]);
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === selectedBranchId) ?? null, [branches, selectedBranchId]);
  const feedbackLoading = feedbackOpen && feedbackType === 'loading';

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  };

  const loadWallets = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    try {
      const data = await walletService.listWalletsByBranch(branchId);
      setWallets(data);
    } catch (error) {
      console.error(error);
      setWallets([]);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  const filteredWallets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return wallets;
    return wallets.filter((wallet) =>
      wallet.customer_name.toLowerCase().includes(term)
      || String(wallet.customer_phone ?? '').toLowerCase().includes(term)
      || String(wallet.customer_address ?? '').toLowerCase().includes(term),
    );
  }, [wallets, searchTerm]);

  const totals = useMemo(() => ({
    active: wallets.length,
    balance: wallets.reduce((acc, wallet) => acc + wallet.current_balance, 0),
    rechargesToday: wallets.filter((wallet) => wallet.last_recharge_at && new Date(wallet.last_recharge_at).toDateString() === new Date().toDateString()).length,
  }), [wallets]);

  const handleSearchEligibleCustomers = useCallback(async (query: string) => {
    if (!branchId) return;
    const data = await walletService.listEligibleCustomers(branchId, query);
    setEligibleCustomers(data);
  }, [branchId]);

  const resetCreateState = () => {
    setSelectedCustomer(null);
    setEligibleCustomers([]);
    setInitialAmount('10000');
    setCreateNotes('');
    setCreateError(null);
    setIsCreateLoading(false);
  };

  const openCreateModal = () => {
    resetCreateState();
    setIsCreateOpen(true);
    void handleSearchEligibleCustomers('');
  };

  const handleCreateWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!branchId) return;
    if (!selectedCustomer) {
      setCreateError('Seleccione un cliente.');
      return;
    }

    const amount = Number(String(initialAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 10000) {
      setCreateError('El monto inicial mínimo es de 10,000 pesos.');
      return;
    }

    setIsCreateLoading(true);
    actionLockRef.current = true;
    showFeedback('loading', 'Creando saldo a favor', 'Registrando apertura...');
    try {
      const wallet = await walletService.createWallet({
        branch_id: branchId,
        customer_id: selectedCustomer.id,
        initial_amount: amount,
        opened_by: currentUser.name,
        notes: createNotes.trim() || null,
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'CREAR',
        entity_type: 'cliente',
        entity_id: selectedCustomer.id,
        description: `Saldo a favor creado para ${selectedCustomer.name}`,
        new_data: {
          wallet_id: wallet.id,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.name,
          opened_amount: amount,
          notes: createNotes.trim() || null,
        },
      });

      await loadWallets();
      setIsCreateOpen(false);
      resetCreateState();
      showFeedback('success', 'Saldo a favor creado', 'El saldo a favor quedó habilitado.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el saldo a favor.';
      setCreateError(message);
      showFeedback('error', 'No se pudo crear', message);
    } finally {
      setIsCreateLoading(false);
      actionLockRef.current = false;
    }
  };

  const openRechargeModal = (wallet: CustomerWalletSummary) => {
    setWalletToRecharge(wallet);
    setRechargeAmount('');
    setRechargeReference('');
    setRechargeNotes('');
    setRechargeError(null);
    setIsRechargeOpen(true);
  };

  const handleRechargeWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    if (!walletToRecharge) return;

    const amount = Number(String(rechargeAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setRechargeError('El monto de la recarga debe ser mayor a 0.');
      return;
    }

    setIsRechargeLoading(true);
    actionLockRef.current = true;
    showFeedback('loading', 'Registrando recarga', 'Actualizando saldo a favor...');
    try {
      await walletService.rechargeWallet({
        wallet_id: walletToRecharge.id,
        amount,
        created_by: currentUser.name,
        reference: rechargeReference.trim() || null,
        notes: rechargeNotes.trim() || null,
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
        justification: rechargeNotes.trim() || null,
        new_data: {
          wallet_id: walletToRecharge.id,
          amount,
          reference: rechargeReference.trim() || null,
        },
      });

      await loadWallets();
      if (walletToHistory?.id === walletToRecharge.id) {
        setIsHistoryLoading(true);
        const movements = await walletService.listWalletMovements(walletToRecharge.id);
        setWalletMovements(movements);
        setIsHistoryLoading(false);
      }
      setIsRechargeOpen(false);
      setWalletToRecharge(null);
      showFeedback('success', 'Recarga registrada', 'El saldo a favor fue actualizado.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar la recarga.';
      setRechargeError(message);
      showFeedback('error', 'No se pudo recargar', message);
    } finally {
      setIsRechargeLoading(false);
      actionLockRef.current = false;
    }
  };

  const openHistoryModal = async (wallet: CustomerWalletSummary) => {
    setWalletToHistory(wallet);
    setWalletMovements([]);
    setIsHistoryOpen(true);
    setIsHistoryLoading(true);
    try {
      const movements = await walletService.listWalletMovements(wallet.id);
      setWalletMovements(movements);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden p-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-500">Saldos a favor activos</p>
          <p className="mt-3 text-4xl font-black tracking-tighter text-slate-900">{totals.active}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Saldo total</p>
          <p className="mt-3 text-4xl font-black tracking-tighter text-emerald-600">{formatCurrency(totals.balance)}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Recargas hoy</p>
          <p className="mt-3 text-4xl font-black tracking-tighter text-slate-900">{totals.rechargesToday}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">Sucursal</p>
          <p className="mt-3 text-lg font-black uppercase tracking-tight text-slate-900">{selectedBranch?.name ?? selectedBranchId}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por cliente, teléfono o dirección..."
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
        />
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white"
        >
          <PlusCircle className="h-4 w-4" />
          Agregar cliente
        </button>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-white">
            <tr>
              <th className="p-4 text-left">Cliente</th>
              <th className="p-4 text-right">Saldo actual</th>
              <th className="p-4 text-left">Fecha de creación</th>
              <th className="p-4 text-left">Última recarga</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">Cargando saldos a favor...</td>
              </tr>
            )}
            {!isLoading && filteredWallets.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">No hay saldos a favor activos.</td>
              </tr>
            )}
            {!isLoading && filteredWallets.map((wallet) => (
              <tr key={wallet.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <p className="text-sm font-black uppercase text-slate-900">{wallet.customer_name}</p>
                  <p className="text-[11px] font-bold text-slate-400">{[wallet.customer_phone, wallet.customer_address].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</p>
                </td>
                <td className="p-4 text-right text-base font-black text-emerald-600">{formatCurrency(wallet.current_balance)}</td>
                <td className="p-4 text-xs font-semibold text-slate-600">{new Date(wallet.opened_at).toLocaleString()}</td>
                <td className="p-4 text-xs font-semibold text-slate-600">{wallet.last_recharge_at ? new Date(wallet.last_recharge_at).toLocaleString() : 'Sin recargas'}</td>
                <td className="p-4 text-center">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">{wallet.status}</span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={() => openRechargeModal(wallet)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100">
                      <CreditCard className="h-4 w-4" />
                      Recargar
                    </button>
                    <button type="button" onClick={() => void openHistoryModal(wallet)} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-200">
                      <History className="h-4 w-4" />
                      Historial
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WalletCreateModal
        isOpen={isCreateOpen}
        customers={eligibleCustomers}
        selectedCustomer={selectedCustomer}
        initialAmount={initialAmount}
        notes={createNotes}
        error={createError}
        isLoading={isCreateLoading}
        onClose={() => {
          setIsCreateOpen(false);
          resetCreateState();
        }}
        onSearch={handleSearchEligibleCustomers}
        onSelectCustomer={setSelectedCustomer}
        onInitialAmountChange={setInitialAmount}
        onNotesChange={setCreateNotes}
        onSubmit={handleCreateWallet}
      />

      <WalletRechargeModal
        isOpen={isRechargeOpen}
        wallet={walletToRecharge}
        amount={rechargeAmount}
        reference={rechargeReference}
        notes={rechargeNotes}
        error={rechargeError}
        isLoading={isRechargeLoading}
        onClose={() => {
          setIsRechargeOpen(false);
          setWalletToRecharge(null);
          setRechargeAmount('');
          setRechargeReference('');
          setRechargeNotes('');
          setRechargeError(null);
        }}
        onAmountChange={setRechargeAmount}
        onReferenceChange={setRechargeReference}
        onNotesChange={setRechargeNotes}
        onSubmit={handleRechargeWallet}
      />

      <WalletHistoryModal
        isOpen={isHistoryOpen}
        wallet={walletToHistory}
        movements={walletMovements}
        isLoading={isHistoryLoading}
        onClose={() => {
          setIsHistoryOpen(false);
          setWalletToHistory(null);
          setWalletMovements([]);
        }}
      />

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={() => {
          if (!feedbackLoading) setFeedbackOpen(false);
        }}
      />
    </div>
  );
};

export default WalletScreen;
