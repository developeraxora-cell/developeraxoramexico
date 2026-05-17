import React, { useState } from 'react';
import { Plus, Search, Filter, Calendar, Truck, FileText, ArrowDownToLine } from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const VinosPurchasesScreen: React.FC<Props> = () => {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const stats = {
    total_compras: 0,
    monto_mes: 0,
    proveedores: 0,
    pendientes: 0,
  };

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total compras', value: stats.total_compras,           icon: ArrowDownToLine },
          { label: 'Monto del mes', value: formatCurrency(stats.monto_mes), icon: FileText },
          { label: 'Proveedores',    value: stats.proveedores,             icon: Truck },
          { label: 'Pendientes',     value: stats.pendientes,              icon: Calendar },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <s.icon size={14} className="text-slate-300" />
            </div>
            <p className="mt-1 text-2xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Folio, proveedor, producto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500">
          <Plus size={15} /> Nueva entrada
        </button>
      </div>

      {/* Filtros fecha */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <Filter size={16} className="mt-7 text-slate-400" />
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Proveedor</label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400">
            <option>Todos los proveedores</option>
          </select>
        </div>
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700">Aplicar</button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="py-20 text-center">
          <ArrowDownToLine size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Sin compras registradas</p>
          <p className="mt-1 text-xs text-slate-400">Registra tu primera entrada de inventario.</p>
        </div>

        {/* Tabla oculta hasta tener datos */}
        <div className="hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Folio','Fecha','Proveedor','Productos','Subtotal','IVA','Total',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VinosPurchasesScreen;
