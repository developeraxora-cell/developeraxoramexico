import React from 'react';
import { Branch, User } from '../../types';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const TransportCustomersScreen: React.FC<Props> = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-dashed border-orange-200 bg-orange-50 p-10 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.26em] text-orange-400">Módulo en construcción</p>
        <p className="mt-4 text-2xl font-black tracking-tighter text-slate-900">Clientes / Crédito — Transportería</p>
        <p className="mt-2 text-sm font-semibold text-slate-500 max-w-md mx-auto">
          La gestión de clientes con crédito, pagarés y saldo a favor para Transportería estará disponible en la próxima entrega.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 max-w-xs mx-auto text-left">
          {[
            'Registro de clientes',
            'Límites de crédito',
            'Historial de notas de crédito',
            'Saldo a favor',
            'Abonos y pagos',
            'Alertas de vencimiento',
          ].map((feat) => (
            <div key={feat} className="flex items-center gap-2 rounded-xl bg-white border border-orange-100 px-3 py-2">
              <span className="text-orange-400 text-xs">◉</span>
              <span className="text-xs font-semibold text-slate-600">{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransportCustomersScreen;
