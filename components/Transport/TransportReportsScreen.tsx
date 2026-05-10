import React from 'react';
import { Branch } from '../../types';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
}

const TransportReportsScreen: React.FC<Props> = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.26em] text-slate-400">Módulo en construcción</p>
        <p className="mt-4 text-2xl font-black tracking-tighter text-slate-900">Reportes — Transportería</p>
        <p className="mt-2 text-sm font-semibold text-slate-500 max-w-md mx-auto">
          Los reportes de ventas, compras, rotación de inventario y márgenes de Transportería estarán disponibles en la próxima entrega.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
          {[
            'Ventas por período',
            'Compras por proveedor',
            'Rotación de inventario',
            'Márgenes por producto',
            'Deudas pendientes',
            'Resumen por sucursal',
          ].map((r) => (
            <div key={r} className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="text-slate-400 text-xs">◎</span>
              <span className="text-xs font-semibold text-slate-500">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransportReportsScreen;
