import React, { useState } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Award,
  AlertTriangle, Cake, Trophy, Star, Sparkles, BarChart3, PieChart, Calendar,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

// ─── Tarjeta KPI reutilizable ─────────────────────────────────────────────
const KpiCard: React.FC<{
  label: string;
  value: string | number;
  delta?: string;
  deltaUp?: boolean;
  icon: React.ElementType;
}> = ({ label, value, delta, deltaUp, icon: Icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600">
        <Icon size={14} />
      </div>
    </div>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
    {delta && (
      <p className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${deltaUp ? 'text-green-600' : 'text-red-500'}`}>
        {deltaUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {delta} vs semana anterior
      </p>
    )}
  </div>
);

// ─── Tarjeta de panel ─────────────────────────────────────────────────────
const PanelCard: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }> =
  ({ title, icon: Icon, children, action }) => (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-slate-500" />
          <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">{title}</h3>
        </div>
        {action}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );

// ─── Lista vacía genérica ─────────────────────────────────────────────────
const EmptyMini: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
  <div className="py-8 text-center">
    <Icon size={28} className="mx-auto text-slate-300" />
    <p className="mt-2 text-xs font-bold text-slate-400">{text}</p>
  </div>
);

// ─── Loyalty bar ──────────────────────────────────────────────────────────
const LOYALTY_COLORS: Record<string, string> = {
  BRONCE: 'bg-amber-400',
  PLATA:  'bg-slate-400',
  ORO:    'bg-yellow-400',
  BLACK:  'bg-slate-900',
};

// ─── Component ────────────────────────────────────────────────────────────

const VinosReportsScreen: React.FC<Props> = () => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'year'>('30d');

  // Mock loyalty distribution (vacío)
  const loyaltyData = [
    { level: 'BRONCE', count: 0, pct: 0 },
    { level: 'PLATA',  count: 0, pct: 0 },
    { level: 'ORO',    count: 0, pct: 0 },
    { level: 'BLACK',  count: 0, pct: 0 },
  ];

  return (
    <div className="space-y-6">

      {/* Header con selector periodo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Dashboard CRM</h2>
          <p className="text-[11px] font-bold text-slate-400">Métricas comerciales y comportamiento de clientes</p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
          {([
            { v: '7d',   label: '7 días'  },
            { v: '30d',  label: '30 días' },
            { v: '90d',  label: '90 días' },
            { v: 'year', label: 'Año'     },
          ] as const).map(p => (
            <button
              key={p.v}
              onClick={() => setPeriod(p.v)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
                period === p.v ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ventas del periodo" value={formatCurrency(0)} delta="0%" deltaUp icon={DollarSign} />
        <KpiCard label="Ticket promedio"    value={formatCurrency(0)} delta="0%" deltaUp icon={ShoppingBag} />
        <KpiCard label="Clientes nuevos"    value={0}                 delta="0%" deltaUp icon={Users} />
        <KpiCard label="Tasa retención"     value="0%"                delta="0%" icon={Award} />
      </div>

      {/* Gráficas principales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfica ventas semanal */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-slate-500" />
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Ventas por día</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400">últimos 7 días</span>
          </div>
          <div className="p-5">
            <div className="flex items-end justify-between gap-2 h-48">
              {['L','M','M','J','V','S','D'].map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-t-xl bg-gradient-to-t from-orange-500 to-orange-300" style={{ height: `${20 + (i * 10) % 80}%` }} />
                  <span className="text-[10px] font-bold text-slate-400">{d}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-400">Datos demo · se llenará con ventas reales</p>
          </div>
        </div>

        {/* Distribución loyalty */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <PieChart size={16} className="text-slate-500" />
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Niveles de lealtad</h3>
          </div>
          <div className="p-5 space-y-3">
            {loyaltyData.map(l => (
              <div key={l.level}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700">{l.level}</span>
                  <span className="text-slate-400">{l.count} ({l.pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${LOYALTY_COLORS[l.level]}`} style={{ width: `${l.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Paneles inferiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Clientes en riesgo */}
        <PanelCard
          title="Clientes en riesgo"
          icon={AlertTriangle}
          action={<span className="text-[10px] font-bold text-orange-500">Ver todos</span>}
        >
          <EmptyMini icon={AlertTriangle} text="Sin clientes en riesgo todavía" />
        </PanelCard>

        {/* Cumpleaños del mes */}
        <PanelCard
          title="Cumpleaños del mes"
          icon={Cake}
          action={<span className="text-[10px] font-bold text-orange-500">Enviar promo</span>}
        >
          <EmptyMini icon={Calendar} text="Ningún cumpleaños este mes" />
        </PanelCard>

        {/* Top clientes */}
        <PanelCard
          title="Top clientes (LTV)"
          icon={Trophy}
        >
          <EmptyMini icon={Users} text="Aún no hay datos de ventas" />
        </PanelCard>

        {/* Top productos */}
        <PanelCard
          title="Productos más vendidos"
          icon={Star}
        >
          <EmptyMini icon={ShoppingBag} text="Sin ventas registradas" />
        </PanelCard>

        {/* Ventas por categoría */}
        <PanelCard
          title="Ventas por categoría"
          icon={PieChart}
        >
          <EmptyMini icon={BarChart3} text="Sin datos de categorías" />
        </PanelCard>

        {/* Recomendaciones por afinidad */}
        <PanelCard
          title="Recomendaciones IA"
          icon={Sparkles}
          action={<span className="rounded-md bg-purple-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-purple-700">Beta</span>}
        >
          <EmptyMini icon={Sparkles} text="Se generan tras 50+ ventas" />
        </PanelCard>

      </div>

    </div>
  );
};

export default VinosReportsScreen;
