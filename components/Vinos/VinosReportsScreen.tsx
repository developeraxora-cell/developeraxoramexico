import React, { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp, DollarSign, ShoppingBag, Users, Award,
  AlertTriangle, Cake, Trophy, Star, BarChart3, PieChart, RefreshCw,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosReportsService, type ReportsKPIs } from '../../services/vinos/reports.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const LOYALTY_COLORS: Record<string, string> = {
  BRONCE: 'bg-amber-400',
  PLATA:  'bg-slate-400',
  ORO:    'bg-yellow-400',
  BLACK:  'bg-slate-900',
};

const PAYMENT_COLORS: Record<string, string> = {
  EFECTIVO: 'bg-green-500',
  CREDITO:  'bg-red-500',
  CORTESIA: 'bg-slate-400',
  SALDO:    'bg-purple-500',
};

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ElementType;
}> = ({ label, value, icon: Icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600">
        <Icon size={14} />
      </div>
    </div>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
  </div>
);

const PanelCard: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
      <Icon size={16} className="text-slate-500" />
      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">{title}</h3>
    </div>
    <div className="flex-1 p-5">{children}</div>
  </div>
);

const EmptyMini: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
  <div className="py-8 text-center">
    <Icon size={28} className="mx-auto text-slate-300" />
    <p className="mt-2 text-xs font-bold text-slate-400">{text}</p>
  </div>
);

const VinosReportsScreen: React.FC<Props> = ({ selectedBranchId }) => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'year'>('30d');
  const [data, setData] = useState<ReportsKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
      const kpis = await vinosReportsService.getKPIs(branchDbId, days);
      setData(kpis);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [branchDbId, period]);

  useEffect(() => { load(); }, [load]);

  const maxSalesDay = data ? Math.max(1, ...data.sales_by_day.map(d => d.amount)) : 1;
  const totalLoyalty = data ? Object.values(data.loyalty_distribution).reduce((s, v) => s + v, 0) : 0;
  const totalPayment = data ? Object.values(data.payment_distribution).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="space-y-6">

      {/* Header con selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Dashboard CRM</h2>
          <p className="text-[11px] font-bold text-slate-400">Métricas comerciales y comportamiento de clientes</p>
        </div>
        <div className="flex gap-2">
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
          <button onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14}/>
          </button>
        </div>
      </div>

      {loading || !data ? (
        <p className="py-20 text-center text-sm text-slate-400">Cargando reportes…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total ventas"        value={data.total_sales}                  icon={ShoppingBag} />
            <KpiCard label="Ingresos"            value={formatCurrency(data.total_amount)} icon={DollarSign} />
            <KpiCard label="Ticket promedio"     value={formatCurrency(data.avg_ticket)}   icon={TrendingUp} />
            <KpiCard label="Clientes nuevos"     value={data.new_customers}                 icon={Users} />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Ventas por día */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-500" />
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Ventas últimos 7 días</h3>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-end justify-between gap-2 h-48">
                  {data.sales_by_day.map((d, i) => {
                    const hPercent = (d.amount / maxSalesDay) * 100;
                    const dayLabel = ['D','L','M','M','J','V','S'][new Date(d.day).getDay()];
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500">{formatCurrency(d.amount)}</span>
                        <div className="w-full rounded-t-xl bg-gradient-to-t from-orange-500 to-orange-300 transition-all" style={{ height: `${Math.max(2, hPercent)}%` }} title={`${d.count} ventas`} />
                        <span className="text-[10px] font-bold text-slate-400">{dayLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Distribución lealtad */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                <PieChart size={16} className="text-slate-500" />
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Niveles de lealtad</h3>
              </div>
              <div className="p-5 space-y-3">
                {(['BRONCE', 'PLATA', 'ORO', 'BLACK'] as const).map(level => {
                  const count = data.loyalty_distribution[level];
                  const pct = totalLoyalty > 0 ? (count / totalLoyalty) * 100 : 0;
                  return (
                    <div key={level}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-700">{level}</span>
                        <span className="text-slate-400">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full ${LOYALTY_COLORS[level]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Paneles inferiores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Distribución método pago */}
            <PanelCard title="Métodos de pago" icon={DollarSign}>
              {totalPayment === 0 ? (
                <EmptyMini icon={DollarSign} text="Sin ventas en periodo"/>
              ) : (
                <div className="space-y-3">
                  {(['EFECTIVO', 'CREDITO', 'SALDO', 'CORTESIA'] as const).map(type => {
                    const count = data.payment_distribution[type];
                    const pct = totalPayment > 0 ? (count / totalPayment) * 100 : 0;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-slate-700">{type}</span>
                          <span className="text-slate-400">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${PAYMENT_COLORS[type]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </PanelCard>

            {/* Clientes en riesgo */}
            <PanelCard title="Clientes en riesgo" icon={AlertTriangle}>
              {data.at_risk_customers.length === 0 ? (
                <EmptyMini icon={AlertTriangle} text="Sin clientes en riesgo"/>
              ) : (
                <ul className="space-y-2">
                  {data.at_risk_customers.map(c => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800 truncate">{c.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${c.status === 'PERDIDO' ? 'bg-red-100 text-red-700' : c.status === 'EN_RIESGO' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Cumpleaños del mes */}
            <PanelCard title="Cumpleaños del mes" icon={Cake}>
              {data.birthdays_this_month.length === 0 ? (
                <EmptyMini icon={Cake} text="Sin cumpleaños este mes"/>
              ) : (
                <ul className="space-y-2">
                  {data.birthdays_this_month.map(c => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800 truncate">{c.name}</span>
                      <span className="text-slate-500">{c.birthday.slice(5, 10)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Top clientes */}
            <PanelCard title="Top clientes (ingresos)" icon={Trophy}>
              {data.top_customers.length === 0 ? (
                <EmptyMini icon={Users} text="Sin datos de ventas"/>
              ) : (
                <ul className="space-y-2">
                  {data.top_customers.map((c, i) => (
                    <li key={c.customer_id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[10px] font-black text-orange-600">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400">{c.count} compras</p>
                      </div>
                      <span className="font-black text-slate-900">{formatCurrency(c.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Top productos */}
            <PanelCard title="Productos más vendidos" icon={Star}>
              {data.top_products.length === 0 ? (
                <EmptyMini icon={ShoppingBag} text="Sin ventas registradas"/>
              ) : (
                <ul className="space-y-2">
                  {data.top_products.map((p, i) => (
                    <li key={p.product_id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[10px] font-black text-orange-600">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.sku} · {p.qty} uds</p>
                      </div>
                      <span className="font-black text-slate-900">{formatCurrency(p.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Resumen rápido */}
            <PanelCard title="Resumen del periodo" icon={Award}>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ventas totales</span>
                  <span className="font-black text-slate-900">{data.total_sales}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ingresos</span>
                  <span className="font-black text-green-600">{formatCurrency(data.total_amount)}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ticket promedio</span>
                  <span className="font-black text-slate-900">{formatCurrency(data.avg_ticket)}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Clientes ORO/BLACK</span>
                  <span className="font-black text-slate-900">{data.loyalty_distribution.ORO + data.loyalty_distribution.BLACK}</span>
                </li>
              </ul>
            </PanelCard>

          </div>
        </>
      )}

    </div>
  );
};

export default VinosReportsScreen;
