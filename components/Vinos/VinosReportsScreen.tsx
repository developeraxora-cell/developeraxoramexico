import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, DollarSign, ShoppingBag,
  AlertTriangle, Star, BarChart3, RefreshCw,
  Package, TrendingDown, Clock, Activity,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosReportsService, type ReportsKPIs } from '../../services/vinos/reports.service';
import { vinosCustomersService } from '../../services/vinos/customers.service';
import { vinosCashRegisterService, type CashRegisterSession } from '../../services/vinos/cashRegister.service';

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const EMPTY_REPORTS_DATA: ReportsKPIs = {
  total_sales: 0,
  total_amount: 0,
  avg_ticket: 0,
  gross_profit: 0,
  profit_margin: 0,
  inventory_value: 0,
  new_customers: 0,
  top_customers: [],
  top_products: [],
  top_profit_products: [],
  loss_products: [],
  low_stock_products: [],
  sales_by_day: [],
  sales_by_weekday: [],
  sales_by_hour: [],
  best_hours: [],
  slow_hours: [],
  sales_periods: {
    today: { sales: 0, amount: 0 },
    week: { sales: 0, amount: 0 },
    month: { sales: 0, amount: 0 },
    year: { sales: 0, amount: 0 },
  },
  profit_periods: { today: 0, week: 0, month: 0, year: 0 },
  payment_distribution: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 },
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

const formatHourRange = (hour: number) => {
  const start = String(hour).padStart(2, '0');
  const end = String((hour + 1) % 24).padStart(2, '0');
  return `${start}:00-${end}:00`;
};

const formatSessionDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const formatSessionDuration = (openedAt: string, closedAt?: string | null) => {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '—';
  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
};

const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
};

const WeekdayAreaChart: React.FC<{
  rows: ReportsKPIs['sales_by_weekday'];
}> = ({ rows }) => {
  const width = 640;
  const height = 260;
  const padding = { top: 30, right: 28, bottom: 44, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const baseY = padding.top + chartHeight;
  const maxCount = Math.max(1, ...rows.map(row => Number(row.count ?? 0)));
  const xFor = (index: number) => padding.left + (chartWidth * index) / Math.max(1, rows.length - 1);
  const countPoints = rows.map((row, index) => ({
    x: xFor(index),
    y: baseY - (Number(row.count ?? 0) / maxCount) * chartHeight,
  }));
  const countLine = createSmoothPath(countPoints);
  const countArea = `${countLine} L ${countPoints[countPoints.length - 1]?.x ?? padding.left} ${baseY} L ${padding.left} ${baseY} Z`;

  return (
    <div className="space-y-3">
      <div className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Ventas por día de la semana">
          <defs>
            <linearGradient id="weekdaySalesArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.5" />
              <stop offset="65%" stopColor="#fdba74" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#fff7ed" stopOpacity="0" />
            </linearGradient>
            <filter id="weekdayLineShadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#f97316" floodOpacity="0.18" />
            </filter>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartHeight * ratio;
            const value = Math.round(maxCount * (1 - ratio));
            return (
              <g key={ratio}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 6" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#94a3b8">
                  {value}
                </text>
              </g>
            );
          })}

          <line x1={padding.left} x2={width - padding.right} y1={baseY} y2={baseY} stroke="#cbd5e1" strokeWidth="1.4" />
          <path d={countArea} fill="url(#weekdaySalesArea)" />
          <path d={countLine} fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round" filter="url(#weekdayLineShadow)" />

          {rows.map((row, index) => {
            const point = countPoints[index];
            const isPeak = Number(row.count ?? 0) === maxCount && maxCount > 0;
            return (
              <g key={row.day}>
                <line x1={point.x} x2={point.x} y1={point.y + 7} y2={baseY} stroke="#fed7aa" strokeWidth="1" strokeDasharray="3 5" opacity="0.8" />
                <circle cx={point.x} cy={point.y} r={isPeak ? 6 : 5} fill="#ffffff" stroke={isPeak ? '#ea580c' : '#f97316'} strokeWidth="3" />
                <text x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle" fontSize={isPeak ? '13' : '11'} fontWeight="900" fill={isPeak ? '#ea580c' : '#0f172a'}>
                  {row.count}
                </text>
                <text x={point.x} y={height - 18} textAnchor="middle" fontSize="11" fontWeight="900" fill="#475569">
                  {row.day.slice(0, 3)}
                </text>
                <text x={point.x} y={height - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">
                  ventas
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Cantidad de ventas</span>
        <span className="text-slate-400">Agrupado por día de semana</span>
      </div>
    </div>
  );
};

const HourlyHistogram: React.FC<{
  rows: ReportsKPIs['sales_by_hour'];
}> = ({ rows }) => {
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 18, bottom: 38, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const baseY = padding.top + chartHeight;
  const maxCount = Math.max(1, ...rows.map(row => Number(row.count ?? 0)));
  const barGap = 6;
  const barWidth = Math.max(8, (chartWidth - barGap * (rows.length - 1)) / rows.length);

  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Histograma de ventas por horario">
        <defs>
          <linearGradient id="hourlyBarGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight * ratio;
          const value = Math.round(maxCount * (1 - ratio));
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#94a3b8">
                {value}
              </text>
            </g>
          );
        })}

        <line x1={padding.left} x2={width - padding.right} y1={baseY} y2={baseY} stroke="#cbd5e1" strokeWidth="1.4" />

        {rows.map((row, index) => {
          const count = Number(row.count ?? 0);
          const barHeight = count > 0 ? Math.max(8, (count / maxCount) * chartHeight) : 2;
          const x = padding.left + index * (barWidth + barGap);
          const y = baseY - barHeight;
          const isPeak = count === maxCount && count > 0;

          return (
            <g key={row.hour}>
              {count > 0 && (
                <text x={x + barWidth / 2} y={y - 7} textAnchor="middle" fontSize="11" fontWeight="900" fill={isPeak ? '#ea580c' : '#334155'}>
                  {count}
                </text>
              )}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="5"
                fill={count > 0 ? 'url(#hourlyBarGradient)' : '#e2e8f0'}
                opacity={count > 0 ? 1 : 0.75}
              />
              {(row.hour % 2 === 0 || count > 0) && (
                <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" fontSize="10" fontWeight="800" fill="#64748b">
                  {String(row.hour).padStart(2, '0')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const VinosReportsScreen: React.FC<Props> = ({ selectedBranchId, branches }) => {
  const [period, setPeriod] = useState<DatePreset>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<ReportsKPIs | null>(null);
  const [cashHistory, setCashHistory] = useState<CashRegisterSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchDbId, setBranchDbId] = useState<number | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

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
    let cancelled = false;
    setBranchDbId(null);
    vinosCustomersService.getBranchId(selectedBranch?.code ?? selectedBranchId)
      .then((id) => { if (!cancelled) setBranchDbId(id); })
      .catch(() => { if (!cancelled) setBranchDbId(null); });
    return () => { cancelled = true; };
  }, [selectedBranch?.code, selectedBranchId]);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const [kpis, sessions] = await Promise.all([
        vinosReportsService.getKPIs(branchDbId, { startDate, endDate }),
        branchDbId ? vinosCashRegisterService.list(branchDbId) : Promise.resolve([]),
      ]);
      setData(kpis);
      setCashHistory(sessions.slice(0, 8));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [branchDbId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const reportData = data ?? EMPTY_REPORTS_DATA;
  const isLoadingView = loading || !data;
  const maxSalesHour = Math.max(1, ...reportData.sales_by_hour.map(d => d.count));
  const hasHourlySales = reportData.sales_by_hour.some(row => row.count > 0);
  const periodRows = [
    { label: 'Hoy', sales: reportData.sales_periods.today.sales, amount: reportData.sales_periods.today.amount, profit: reportData.profit_periods.today },
    { label: 'Semana', sales: reportData.sales_periods.week.sales, amount: reportData.sales_periods.week.amount, profit: reportData.profit_periods.week },
    { label: 'Mes', sales: reportData.sales_periods.month.sales, amount: reportData.sales_periods.month.amount, profit: reportData.profit_periods.month },
    { label: 'Año', sales: reportData.sales_periods.year.sales, amount: reportData.sales_periods.year.amount, profit: reportData.profit_periods.year },
  ];

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
            <KpiCard label="Utilidad estimada" value={formatCurrency(reportData.gross_profit)} icon={TrendingUp} loading={isLoadingView} />
            <KpiCard label="Margen utilidad" value={`${reportData.profit_margin.toFixed(1)}%`} icon={Activity} loading={isLoadingView} />
            <KpiCard label="Valor inventario" value={formatCurrency(reportData.inventory_value)} icon={Package} loading={isLoadingView} />
            <KpiCard label="Poco inventario" value={reportData.low_stock_products.length} icon={AlertTriangle} loading={isLoadingView} />
            <KpiCard label="Ticket promedio" value={formatCurrency(reportData.avg_ticket)} icon={TrendingUp} loading={isLoadingView} />
          </div>

          <PanelCard title="Ventas y utilidad por periodo" icon={BarChart3}>
            {isLoadingView ? (
              <LoadingRows />
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
                {periodRows.map(row => (
                  <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.label}</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(row.amount)}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-500">{row.sales} ventas</span>
                      <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(row.profit)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard title="Días de la semana con más ventas" icon={BarChart3}>
              {isLoadingView ? (
                <LoadingChartBars />
              ) : (
                <WeekdayAreaChart rows={reportData.sales_by_weekday} />
              )}
            </PanelCard>

            <PanelCard title="Ventas por horario" icon={Clock}>
              {isLoadingView ? (
                <LoadingChartBars />
              ) : !hasHourlySales ? (
                <EmptyMini icon={Clock} text="Sin ventas por horario"/>
              ) : (
                <div className="space-y-4">
                  <HourlyHistogram rows={reportData.sales_by_hour} />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[...reportData.sales_by_hour]
                      .filter(row => row.count > 0)
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 6)
                      .map(row => (
                        <div key={row.hour} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <span className="font-bold text-slate-700">{formatHourRange(row.hour)}</span>
                          <span className="font-black text-orange-600">{row.count} ventas</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </PanelCard>
          </div>

          {/* Paneles solicitados */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

            {/* Productos con más utilidad */}
            <PanelCard title="Productos con más utilidad" icon={TrendingUp}>
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.top_profit_products.length === 0 ? (
                <EmptyMini icon={TrendingUp} text="Sin utilidad calculada"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.top_profit_products.map((p, i) => (
                    <li key={p.product_id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-[10px] font-black text-green-700">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{p.sku} · {p.qty} uds · {formatCurrency(p.total)}</p>
                      </div>
                      <span className="font-black text-green-600">{formatCurrency(p.profit)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Productos sin utilidad */}
            <PanelCard title="Sin utilidad o pérdida" icon={TrendingDown}>
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.loss_products.length === 0 ? (
                <EmptyMini icon={TrendingDown} text="Sin ventas con pérdida"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.loss_products.map((p) => (
                    <li key={p.product_id} className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/40 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{p.sku} · {p.qty} uds · {formatCurrency(p.total)}</p>
                      </div>
                      <span className="font-black text-red-600">{formatCurrency(p.profit)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Bajo inventario */}
            <PanelCard title="Productos con poco inventario" icon={Package}>
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.low_stock_products.length === 0 ? (
                <EmptyMini icon={Package} text="Inventario dentro de mínimo"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.low_stock_products.map((p) => (
                    <li key={p.product_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{p.sku}</p>
                      </div>
                      <span className="font-black text-orange-600">{p.stock} / {p.min_stock}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Horas fuertes */}
            <PanelCard title="Horas más fuertes" icon={Clock}>
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.best_hours.length === 0 ? (
                <EmptyMini icon={Clock} text="Sin ventas por hora"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.best_hours.map((row) => (
                    <li key={row.hour} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800">{formatHourRange(row.hour)}</span>
                      <span className="text-slate-500">{row.count} ventas</span>
                      <span className="font-black text-green-600">{formatCurrency(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Horas bajas */}
            <PanelCard title="Horas más bajas" icon={Clock}>
              {isLoadingView ? (
                <LoadingRows />
              ) : reportData.slow_hours.length === 0 ? (
                <EmptyMini icon={Clock} text="Sin datos suficientes"/>
              ) : (
                <ul className="space-y-2">
                  {reportData.slow_hours.map((row) => (
                    <li key={row.hour} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800">{formatHourRange(row.hour)}</span>
                      <span className="text-slate-500">{row.count} ventas</span>
                      <span className="font-black text-slate-900">{formatCurrency(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          </div>

          <PanelCard title="Historial de caja" icon={Clock}>
            {isLoadingView ? (
              <LoadingRows rows={4} />
            ) : cashHistory.length === 0 ? (
              <EmptyMini icon={Clock} text="Sin aperturas de caja registradas" />
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[1180px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Responsable</th>
                        <th className="px-4 py-3">Apertura</th>
                        <th className="px-4 py-3">Cierre</th>
                        <th className="px-4 py-3">Duración</th>
                        <th className="px-4 py-3 text-right">Inicial</th>
                        <th className="px-4 py-3 text-right">Vendido</th>
                        <th className="px-4 py-3 text-right">Efectivo</th>
                        <th className="px-4 py-3 text-right">Tarjeta</th>
                        <th className="px-4 py-3 text-right">Transf.</th>
                        <th className="px-4 py-3 text-right">Crédito</th>
                        <th className="px-4 py-3 text-right">Esperado</th>
                        <th className="px-4 py-3 text-right">Entregado</th>
                        <th className="px-4 py-3 text-right">Diferencia</th>
                        <th className="px-4 py-3">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {cashHistory.map((session) => {
                        const isOpen = !session.closed_at;
                        const difference = Number(session.cash_difference ?? 0);
                        const observations = [
                          session.opening_observations ? `Apertura: ${session.opening_observations}` : '',
                          session.closing_observations ? `Cierre: ${session.closing_observations}` : '',
                        ].filter(Boolean).join(' | ');

                        return (
                          <tr key={session.id} className="align-top hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                                {isOpen ? 'Abierta' : 'Cerrada'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-black text-slate-900">{session.cashier_name || 'Sin responsable'}</td>
                            <td className="px-4 py-3 font-bold text-slate-600">{formatSessionDateTime(session.opened_at)}</td>
                            <td className="px-4 py-3 font-bold text-slate-600">{formatSessionDateTime(session.closed_at)}</td>
                            <td className="px-4 py-3 font-bold text-slate-500">{formatSessionDuration(session.opened_at, session.closed_at)}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(Number(session.opening_cash ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-black text-orange-600">{formatCurrency(Number(session.total_sold ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{formatCurrency(Number(session.cash_sales_total ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{formatCurrency(Number(session.card_sales_total ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{formatCurrency(Number(session.transfer_sales_total ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{formatCurrency(Number(session.credit_sales_total ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(Number(session.expected_cash ?? 0))}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">{session.delivered_cash == null ? '—' : formatCurrency(Number(session.delivered_cash ?? 0))}</td>
                            <td className={`px-4 py-3 text-right font-black ${difference === 0 ? 'text-slate-900' : difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {session.cash_difference == null ? '—' : formatCurrency(difference)}
                            </td>
                            <td className="max-w-[260px] px-4 py-3 font-bold text-slate-500">
                              {observations || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] font-bold text-slate-400">Mostrando las últimas {cashHistory.length} cajas de la sucursal.</p>
              </div>
            )}
          </PanelCard>
        </>

    </div>
  );
};

export default VinosReportsScreen;
