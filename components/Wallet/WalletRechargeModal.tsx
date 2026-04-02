import React from 'react';
import type { CustomerWalletSummary } from '../../services/wallet.service';
import { formatCurrency } from '../../services/currency';

interface WalletRechargeModalProps {
  isOpen: boolean;
  wallet: CustomerWalletSummary | null;
  amount: string;
  reference: string;
  notes: string;
  error: string | null;
  isLoading: boolean;
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

const REFERENCE_OPTIONS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'DEPOSITO', label: 'Deposito' },
  { value: 'OTRO', label: 'Otro' },
] as const;

const WalletRechargeModal: React.FC<WalletRechargeModalProps> = ({
  isOpen,
  wallet,
  amount,
  reference,
  notes,
  error,
  isLoading,
  onClose,
  onAmountChange,
  onReferenceChange,
  onNotesChange,
  onSubmit,
}) => {
  if (!isOpen || !wallet) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-emerald-600 p-6 text-white">
          <div>
            <h3 className="text-2xl font-black tracking-tighter">Recargar saldo a favor</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-100">{wallet.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-2xl transition hover:bg-red-500">&times;</button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 bg-slate-50 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo actual</p>
              <p className="mt-3 text-3xl font-black tracking-tighter text-emerald-600">{formatCurrency(wallet.current_balance)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Monto de recarga</label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-black text-slate-800 outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de deposito</label>
              <select
                value={reference}
                onChange={(e) => onReferenceChange(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="">Seleccione una opcion</option>
                {REFERENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observacion</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Observacion de la recarga"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
              />
            </div>
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={isLoading} className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isLoading} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
              {isLoading ? 'Guardando...' : 'Guardar recarga'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WalletRechargeModal;
