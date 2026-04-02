import React from 'react';
import type { CreditCustomer } from '../../services/credit/credit.service';
import CustomerSearchSelect from '../common/CustomerSearchSelect';

interface WalletCreateModalProps {
  isOpen: boolean;
  customers: CreditCustomer[];
  selectedCustomer: CreditCustomer | null;
  initialAmount: string;
  notes: string;
  error: string | null;
  isLoading: boolean;
  onClose: () => void;
  onSearch: (query: string) => void | Promise<void>;
  onSelectCustomer: (customer: CreditCustomer | null) => void;
  onInitialAmountChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

const WalletCreateModal: React.FC<WalletCreateModalProps> = ({
  isOpen,
  customers,
  selectedCustomer,
  initialAmount,
  notes,
  error,
  isLoading,
  onClose,
  onSearch,
  onSelectCustomer,
  onInitialAmountChange,
  onNotesChange,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-slate-900 p-6 text-white">
          <div>
            <h3 className="text-2xl font-black tracking-tighter">Agregar cliente</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orange-300">Habilitar saldo a favor</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-2xl transition hover:bg-red-500"
          >
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 bg-slate-50 p-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar cliente</label>
            <CustomerSearchSelect
              customers={customers}
              selectedCustomer={selectedCustomer}
              onSelect={onSelectCustomer}
              onSearch={onSearch}
              isLoading={isLoading}
              minQueryLength={2}
              placeholder="Buscar cliente por nombre, teléfono o dirección..."
              publicLabel="Seleccione un cliente"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Monto inicial</label>
              <input
                type="text"
                inputMode="decimal"
                value={initialAmount}
                onChange={(e) => onInitialAmountChange(e.target.value)}
                placeholder="10000"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-black text-slate-800 outline-none"
              />
              <p className="mt-2 text-xs font-bold text-slate-400">Monto mínimo requerido: $10,000.00</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observación</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Observación de apertura"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Guardando...' : 'Crear saldo a favor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WalletCreateModal;
