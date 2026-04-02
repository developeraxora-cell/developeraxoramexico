import React from 'react';
import type { CustomerWalletMovement, CustomerWalletSummary } from '../../services/wallet.service';
import { formatCurrency } from '../../services/currency';

interface WalletHistoryModalProps {
  isOpen: boolean;
  wallet: CustomerWalletSummary | null;
  movements: CustomerWalletMovement[];
  isLoading: boolean;
  onClose: () => void;
}

const WalletHistoryModal: React.FC<WalletHistoryModalProps> = ({ isOpen, wallet, movements, isLoading, onClose }) => {
  if (!isOpen || !wallet) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-slate-900 p-6 text-white">
          <div>
            <h3 className="text-2xl font-black tracking-tighter">Historial de saldo a favor</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orange-300">{wallet.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-2xl transition hover:bg-red-500">&times;</button>
        </div>

        <div className="space-y-4 overflow-y-auto bg-slate-50 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo actual</p>
              <p className="mt-2 text-2xl font-black text-emerald-600">{formatCurrency(wallet.current_balance)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monto de apertura</p>
              <p className="mt-2 text-2xl font-black text-slate-800">{formatCurrency(wallet.opened_amount)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última recarga</p>
              <p className="mt-2 text-sm font-black text-slate-800">{wallet.last_recharge_at ? new Date(wallet.last_recharge_at).toLocaleString() : 'Sin recargas'}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-white">
                <tr>
                  <th className="p-4 text-left">Fecha</th>
                  <th className="p-4 text-left">Tipo</th>
                  <th className="p-4 text-right">Monto</th>
                  <th className="p-4 text-right">Saldo antes</th>
                  <th className="p-4 text-right">Saldo después</th>
                  <th className="p-4 text-left">Usuario</th>
                  <th className="p-4 text-left">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">Cargando movimientos...</td>
                  </tr>
                )}
                {!isLoading && movements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">Sin movimientos registrados.</td>
                  </tr>
                )}
                {!isLoading && movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="p-4 text-xs font-semibold text-slate-600">{new Date(movement.created_at).toLocaleString()}</td>
                    <td className="p-4 text-xs font-black text-slate-700">{movement.movement_type.replace('_', ' ')}</td>
                    <td className="p-4 text-right text-xs font-black text-slate-900">{formatCurrency(movement.amount)}</td>
                    <td className="p-4 text-right text-xs font-semibold text-slate-500">{formatCurrency(movement.balance_before)}</td>
                    <td className="p-4 text-right text-xs font-black text-emerald-600">{formatCurrency(movement.balance_after)}</td>
                    <td className="p-4 text-xs font-semibold text-slate-600">{movement.created_by || '—'}</td>
                    <td className="p-4 text-xs font-semibold text-slate-500">{movement.reference || movement.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletHistoryModal;
