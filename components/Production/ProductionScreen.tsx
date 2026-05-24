import React, { useState } from 'react';
import { ArrowLeft, Edit3, Eraser, Factory, Package, PackagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { Branch, User } from '../../types';

interface ProductionScreenProps {
  selectedBranchId: string;
  currentUser: User;
  branches: Branch[];
}

type ScreenMode = 'list' | 'new';

interface ProductionRow {
  id: number;
  date: string;
  responsible: string;
  observation: string;
  registeredAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// Datos de muestra solo para visualizar el diseno (sin logica todavia)
const SAMPLE_PRODUCTIONS: ProductionRow[] = [
  { id: 98, date: '12/3/2026', responsible: 'TERE', observation: '', registeredAt: '14/3/2026 13:26' },
  { id: 97, date: '11/3/2026', responsible: 'TERE', observation: '', registeredAt: '14/3/2026 13:25' },
  { id: 96, date: '11/3/2026', responsible: 'TERE', observation: '', registeredAt: '12/3/2026 13:31' },
  { id: 95, date: '9/3/2026', responsible: 'TERE', observation: '', registeredAt: '12/3/2026 13:28' },
  { id: 94, date: '2/3/2026', responsible: 'TERE', observation: '', registeredAt: '3/3/2026 14:04' },
];

const ProductionScreen: React.FC<ProductionScreenProps> = () => {
  const [mode, setMode] = useState<ScreenMode>('list');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {mode === 'list' && (
        <ProductionListView
          productions={SAMPLE_PRODUCTIONS}
          search={search}
          onSearch={setSearch}
          onNew={() => setMode('new')}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      )}

      {mode === 'new' && <NewProductionView onBack={() => setMode('list')} />}
    </div>
  );
};

const ActionButton: React.FC<{
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: 'slate' | 'red';
}> = ({ title, onClick, icon, tone = 'slate' }) => {
  const colors = {
    slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    red: 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${colors[tone]}`}
    >
      {icon}
    </button>
  );
};

const ProductionListView: React.FC<{
  productions: ProductionRow[];
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  onEdit: (production: ProductionRow) => void;
  onDelete: (production: ProductionRow) => void;
}> = ({ productions, search, onSearch, onNew, onEdit, onDelete }) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <Factory size={21} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">Gestión de Producciones</h1>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Módulo Producción</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800"
      >
        <Plus size={16} />
        Nueva Producción
      </button>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Buscar producción por fecha, responsable u observación..."
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
      />

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-slate-900 text-left text-[10px] font-black uppercase tracking-widest text-white">
              <tr>
                <th className="px-5 py-4">ID</th>
                <th className="px-5 py-4">Fecha</th>
                <th className="px-5 py-4">Responsable</th>
                <th className="px-5 py-4">Observaciones</th>
                <th className="px-5 py-4">Fecha Registro</th>
                <th className="px-5 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-400">
                    No hay producciones registradas.
                  </td>
                </tr>
              )}
              {productions.map((production) => (
                <tr key={production.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-5 py-4 font-black text-slate-900">{production.id}</td>
                  <td className="px-5 py-4 font-bold text-slate-600">{production.date}</td>
                  <td className="px-5 py-4 font-bold text-slate-600">{production.responsible}</td>
                  <td className="px-5 py-4 font-bold text-slate-400">{production.observation || '-'}</td>
                  <td className="px-5 py-4 font-bold text-slate-600">{production.registeredAt}</td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <ActionButton
                        title="Editar producción"
                        onClick={() => onEdit(production)}
                        icon={<Edit3 size={16} />}
                        tone="slate"
                      />
                      <ActionButton
                        title="Eliminar producción"
                        onClick={() => onDelete(production)}
                        icon={<Trash2 size={16} />}
                        tone="red"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
          <span>Mostrando {productions.length} de {productions.length} producciones</span>
          <div className="flex gap-2">
            <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400" type="button">Anterior</button>
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-white" type="button">1</button>
            <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400" type="button">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const Field: React.FC<{
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}> = ({ label, type = 'text', placeholder, defaultValue }) => (
  <label className="block">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <input
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue}
      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
    />
  </label>
);

const NewProductionView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <Factory size={21} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">Nueva Producción Interna</h1>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Módulo Producción</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200"
      >
        <ArrowLeft size={16} />
        Volver al Historial
      </button>
    </div>

    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800"
      >
        <Save size={16} />
        Procesar Producción
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200"
      >
        <Eraser size={16} />
        Limpiar
      </button>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Fecha de Producción" type="date" defaultValue={today()} />
        <Field label="Responsable" placeholder="Nombre del responsable" />
        <Field label="Observaciones" placeholder="Notas adicionales" />
      </div>
    </div>

    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
        <Package className="text-orange-500" size={20} />
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Materia Prima Utilizada</h2>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-center">Stock Actual</th>
              <th className="px-4 py-3 text-center">Unidad</th>
              <th className="px-4 py-3 text-center">Cantidad Usada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-3">
                <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500">
                  <option>Seleccionar materia prima...</option>
                </select>
              </td>
              <td className="px-4 py-3">
                <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-400" />
              </td>
              <td className="px-4 py-3 text-center font-black text-slate-400">-</td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue="0"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-900 outline-none focus:border-orange-500"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="text-orange-500" size={20} />
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Productos Terminados</h2>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-emerald-600"
        >
          <PackagePlus size={15} />
          Agregar Producto
        </button>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="min-w-[920px] w-full text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-center">Actual</th>
              <th className="px-4 py-3 text-center">Número Pareas</th>
              <th className="px-4 py-3 text-center">Peso</th>
              <th className="px-4 py-3 text-center">Peso Ajustado</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-3">
                <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500">
                  <option>Seleccionar producto...</option>
                </select>
              </td>
              <td className="px-4 py-3">
                <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-400" />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-900 outline-none focus:border-orange-500"
                />
              </td>
              <td className="px-4 py-3 text-center font-black text-slate-400">-</td>
              <td className="px-4 py-3">
                <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-400" />
              </td>
              <td className="px-4 py-3 text-center">
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default ProductionScreen;
