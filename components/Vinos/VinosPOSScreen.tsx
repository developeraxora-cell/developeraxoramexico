import React, { useState } from 'react';
import { Search, Trash2, User as UserIcon, Tag, CreditCard, Banknote, Smartphone, Plus, Minus, Receipt } from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

type PriceTier = 'MENUDEO' | 'MEDIO_MAYOREO' | 'MAYOREO';
type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

const VinosPOSScreen: React.FC<Props> = () => {
  const [search, setSearch] = useState('');
  const [priceTier, setPriceTier] = useState<PriceTier>('MENUDEO');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 h-[calc(100vh-180px)]">

      {/* ─── Catálogo de productos ─────────────────────────── */}
      <div className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">

        {/* Buscador + tier */}
        <div className="border-b border-slate-100 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              className="w-full rounded-2xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Buscar producto por nombre o SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Selector de tipo de precio */}
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de precio</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'MENUDEO',        label: 'Menudeo',        sub: '1 pieza' },
                { v: 'MEDIO_MAYOREO',  label: 'Medio mayoreo',  sub: '6-11 pzs' },
                { v: 'MAYOREO',        label: 'Mayoreo',        sub: '12+ pzs' },
              ] as const).map(t => {
                const active = priceTier === t.v;
                return (
                  <button
                    key={t.v}
                    onClick={() => setPriceTier(t.v)}
                    className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                      active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-xs font-black ${active ? 'text-orange-700' : 'text-slate-700'}`}>{t.label}</p>
                    <p className="text-[10px] text-slate-400">{t.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 0 }).map((_, i) => (
              <button key={i} className="rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-orange-300 hover:shadow-md transition-all">
                <div className="aspect-square rounded-xl bg-slate-100 mb-2 flex items-center justify-center text-3xl">🍷</div>
                <p className="text-xs font-black text-slate-900 line-clamp-2">Producto demo</p>
                <p className="text-[10px] text-slate-400">SKU-001</p>
                <p className="mt-1 text-sm font-black text-orange-600">{formatCurrency(0)}</p>
              </button>
            ))}
          </div>
          <div className="py-20 text-center">
            <Tag size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Catálogo vacío</p>
            <p className="mt-1 text-xs text-slate-400">Agrega productos desde el módulo de Productos.</p>
          </div>
        </div>
      </div>

      {/* ─── Carrito ────────────────────────────────────────── */}
      <div className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">

        {/* Cliente */}
        <div className="border-b border-slate-100 p-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</p>
          <button className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-left hover:border-orange-400 hover:bg-orange-50/40 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <UserIcon size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-700">Público general</p>
              <p className="text-[10px] text-slate-400">Click para seleccionar cliente</p>
            </div>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="py-12 text-center">
            <Receipt size={36} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Carrito vacío</p>
            <p className="mt-1 text-xs text-slate-400">Selecciona productos del catálogo.</p>
          </div>

          {/* Item demo (oculto) */}
          <div className="hidden space-y-2">
            <div className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">Producto demo</p>
                  <p className="text-[10px] text-slate-400">SKU-001 · {formatCurrency(0)} c/u</p>
                </div>
                <button className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-1">
                  <button className="rounded-lg p-1 hover:bg-slate-100"><Minus size={12} /></button>
                  <span className="min-w-[24px] text-center text-xs font-black">1</span>
                  <button className="rounded-lg p-1 hover:bg-slate-100"><Plus size={12} /></button>
                </div>
                <p className="text-sm font-black text-slate-900">{formatCurrency(0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Totales + método pago */}
        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
          {/* Resumen */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(0)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Descuento</span><span>{formatCurrency(0)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black text-slate-900 text-base">
              <span>Total</span><span className="text-orange-600">{formatCurrency(0)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Método de pago</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'EFECTIVO',       label: 'Efectivo',  icon: Banknote },
                { v: 'TARJETA',        label: 'Tarjeta',   icon: CreditCard },
                { v: 'TRANSFERENCIA',  label: 'Transfer.', icon: Smartphone },
              ] as const).map(p => {
                const active = paymentMethod === p.v;
                return (
                  <button
                    key={p.v}
                    onClick={() => setPaymentMethod(p.v)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors ${
                      active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p.icon size={16} className={active ? 'text-orange-700' : 'text-slate-500'} />
                    <span className={`text-[10px] font-black ${active ? 'text-orange-700' : 'text-slate-600'}`}>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button className="w-full rounded-2xl bg-orange-600 py-3 text-sm font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-40">
            Cobrar venta
          </button>
        </div>
      </div>
    </div>
  );
};

export default VinosPOSScreen;
