import React, { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp, DollarSign, ShoppingBag, Users, Award,
  AlertTriangle, Cake, Trophy, Star, BarChart3, PieChart, RefreshCw,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosReportsService, type ReportsKPIs } from '../../services/vinos/reports.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';

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

const EMPTY_REPORTS_DATA: ReportsKPIs = {
  total_sales: 0,
  total_amount: 0,
  avg_ticket: 0,
  new_customers: 0,
  top_customers: [],
  top_products: [],
  sales_by_day: [],
  payment_distribution: { EFECTIVO: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 },
  loyalty_distribution: { BRONCE: 0, PLATA: 0, ORO: 0, BLACK: 0 },
  at_risk_customers: [],
  birthdays_this_month: [],
};

const SkeletonBlock: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} style={style} />
);

const LoadingRows: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
        <div className="flex flex-1 items-center gap-2">
          <SkeletonBlock className="h-6 w-6 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/3" />
          </div>
        </div>
        <SkeletonBlock className="h-3 w-14" />
      </div>
    ))}
  </div>
);

const LoadingChartBars: React.FC = () => {
  const heights = [42, 68, 36, 84, 58, 74, 48];
  return (
    <div className="flex h-48 items-end justify-between gap-2">
      {heights.map((height, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
          <SkeletonBlock className="h-3 w-12" />
          <SkeletonBlock className="w-full rounded-t-xl" style={{ height: `${height}%` } as React.CSSProperties} />
          <SkeletonBlock className="h-2.5 w-4" />
        </div>
      ))}
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ElementType;
  loading?: boolean;
}> = ({ label, value, icon: Icon, loading = false }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600">
        <Icon size={14} />
      </div>
    </div>
    {loading ? <SkeletonBlock className="mt-3 h-7 w-24" /> : <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>}
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

const toLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const VinosReportsScreen: React.FC<Props> = ({ selectedBranchId }) => {
  const [period, setPeriod] = useState<DatePreset>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<ReportsKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  useEffect(() => {
    if (period === 'custom') return;

    const today = new Date();
    const start = new Date(today);

    if (period === 'today') {
      setStartDate(toLocalDateInputValue(today));
      setEndDate(toLocalDateInputValue(today));
      return;
    }

    if (period === '7d') start.setDate(today.getDate() - 6);
    if (period === '30d') start.setDate(today.getDate() - 29);
    if (period === '90d') start.setDate(today.getDate() - 89);
    if (period === 'year') start.setDate(today.getDate() - 364);

    setStartDate(toLocalDateInputValue(start));
    setEndDate(toLocalDateInputValue(today));
  }, [period]);

  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const kpis = await vinosReportsService.getKPIs(branchDbId, { startDate, endDate });
      setData(kpis);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [branchDbId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const reportData = data ?? EMPTY_REPORTS_DATA;
  const isLoadingView = loading || !data;
  const maxSalesDay = Math.max(1, ...reportData.sales_by_day.map(d => d.amount));
  const totalLoyalty = Object.values(reportData.loyalty_distribution).reduce((s, v) => s + v, 0);
  const totalPayment = Object.values(reportData.payment_distribution).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">

      {/* Header con selector */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Dashboard CRM</h2>
          <p className="text-[11px] font-bold text-slate-400">Métricas comerciales y comportamiento de clientes</p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {([
              { v: 'today', label: 'Hoy' },
              { v: '7d', label: 'Semana' },
              { v: '30d', label: 'Mes' },
              { v: '90d', label: '90 días' },
              { v: 'year', label: 'Año' },
              { v: 'custom', label: 'Manual' },
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPeriod('custom');
                  setStartDate(e.target.value);
                }}
                className="bg-transparent text-xs font-black text-slate-700 outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPeriod('custom');
                  setEndDate(e.target.value);
                }}
                className="bg-transparent text-xs font-black text-slate-700 outline-none"
              />
            </label>
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14}/>
          </button>
        </div>
      </div>

      <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total ventas" value={reportData.total_sales} icon={ShoppingBag} loading={isLoadingView} />
            <KpiCard label="Ingresos" value={formatCurrency(reportData.total_amount)} icon={DollarSign} loading={isLoadingView} />
            <KpiCard label="Ticket promedio" value={formatCurrency(reportData.avg_ticket)} icon={TrendingUp} loading={isLoadingView} />
            <KpiCard label="Clientes nuevos" value={reportData.new_customers} icon={Users} loading={isLoadingView} />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Ventas por día */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-500" />
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Ventas del periodo</h3>
                </div>
              </div>
              <div className="p-5">
                {isLoadingView ? (
                  <LoadingChartBars />
                ) : (
                  <div className="flex items-end justify-between gap-2 h-48">
                  {reportData.sales_by_day.map((d, i) => {
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
                )}
              </div>
            </div>

            {/* Distribución lealtad */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                <PieChart size={16} className="text-slate-500" />
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Niveles de lealtad</h3>
              </div>
              <div className="p-5 space-y-3">
                {isLoadingView ? (
                  <>
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <SkeletonBlock className="h-3 w-16" />
                          <SkeletonBlock className="h-3 w-12" />
                        </div>
                        <SkeletonBlock className="h-2 w-full rounded-full" />
                      </div>
                    ))}
                  </>
                ) : (['BRONCE', 'PLATA', 'ORO', 'BLACK'] as const).map(level => {
                  const count = reportData.loyalty_distribution[level];
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
              {isLoadingView ? (
                <LoadingRows />
              ) : totalPayment === 0 ? (
                <EmptyMini icon={DollarSign} text="Sin ventas en periodo"/>
              ) : (
                <div className="space-y-3">
                  {(['EFECTIVO', 'CREDITO', 'SALDO', 'CORTESIA'] as const).map(type => {
                    const count = reportData.payment_distribution[type];
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
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.at_risk_customers.length === 0 ? (
                <EmptyMini icon={AlertTriangle} text="Sin clientes en riesgo"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.at_risk_customers.map(c => (
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
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.birthdays_this_month.length === 0 ? (
                <EmptyMini icon={Cake} text="Sin cumpleaños este mes"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.birthdays_this_month.map(c => (
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
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.top_customers.length === 0 ? (
                <EmptyMini icon={Users} text="Sin datos de ventas"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.top_customers.map((c, i) => (
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
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.top_products.length === 0 ? (
                <EmptyMini icon={ShoppingBag} text="Sin ventas registradas"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.top_products.map((p, i) => (
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
              {isLoadingView ? (
                <LoadingRows />
              ) : (
              <ul className="space-y-2 text-xs">
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ventas totales</span>
                  <span className="font-black text-slate-900">{reportData.total_sales}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ingresos</span>
                  <span className="font-black text-green-600">{formatCurrency(reportData.total_amount)}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Ticket promedio</span>
                  <span className="font-black text-slate-900">{formatCurrency(reportData.avg_ticket)}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Clientes ORO/BLACK</span>
                  <span className="font-black text-slate-900">{reportData.loyalty_distribution.ORO + reportData.loyalty_distribution.BLACK}</span>
                </li>
              </ul>
              )}
            </PanelCard>

          </div>
        </>

    </div>
  );
};

export default VinosReportsScreen;
