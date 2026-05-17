import React, { useState } from 'react';
import { Search, Filter, ClipboardList, ShoppingCart, Package, Users, Edit, Trash2, Plus } from 'lucide-react';
import { Branch, User } from '../../types';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  CREAR:    { label: 'Crear',     icon: Plus,    bg: 'bg-green-100',  text: 'text-green-700'  },
  EDITAR:   { label: 'Editar',    icon: Edit,    bg: 'bg-blue-100',   text: 'text-blue-700'   },
  ELIMINAR: { label: 'Eliminar',  icon: Trash2,  bg: 'bg-red-100',    text: 'text-red-700'    },
};

const ENTITY_ICON: Record<string, React.ElementType> = {
  venta: ShoppingCart,
  producto: Package,
  cliente: Users,
  compra: ClipboardList,
};

const VinosAuditScreen: React.FC<Props> = () => {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('todos');
  const [actionFilter, setActionFilter] = useState('todos');

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Eventos hoy',         value: 0 },
          { label: 'Eventos esta semana', value: 0 },
          { label: 'Eliminaciones',       value: 0 },
          { label: 'Usuarios activos',    value: 0 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
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
            placeholder="Buscar por usuario, descripción…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
          <Filter size={14} /> Exportar
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Entidad</label>
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400">
            <option value="todos">Todas</option>
            <option value="venta">Ventas</option>
            <option value="compra">Compras</option>
            <option value="producto">Productos</option>
            <option value="cliente">Clientes</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Acción</label>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400">
            <option value="todos">Todas</option>
            <option value="CREAR">Crear</option>
            <option value="EDITAR">Editar</option>
            <option value="ELIMINAR">Eliminar</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Rango fecha</label>
          <input type="date"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400" />
        </div>
      </div>

      {/* Tabla / Empty state */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="py-20 text-center">
          <ClipboardList size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Sin eventos de auditoría</p>
          <p className="mt-1 text-xs text-slate-400">Los movimientos se registrarán aquí automáticamente.</p>
        </div>

        {/* Tabla oculta para datos futuros */}
        <div className="hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Fecha','Usuario','Entidad','Acción','Descripción','Detalle'].map(h => (
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

export default VinosAuditScreen;
