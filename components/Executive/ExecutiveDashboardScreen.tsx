import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, DollarSign, PackageSearch, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { formatCurrency, formatNumber } from '../../services/currency';
import { Branch } from '../../types';
import ManagerInsightsPanel, { ManagerInsight } from '../common/ManagerInsightsPanel';

interface ExecutiveDashboardScreenProps {
  selectedBranchId: string;
  branches: Branch[];
}

type ExecutiveUnit = 'materiales' | 'concretera';
type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

interface TxRow {
  id: number;
  type: 'PURCHASE' | 'SALE' | 'ADJUST' | 'TRANSFER';
  created_at: string;
  nombre_cliente?: string | null;
  is_credit?: boolean | null;
  payment_type?: string | null;
  credit_amount?: number | null;
}

interface ItemRow {
  transaction_id: number;
  product_id: number;
  qty: number;
  qty_base?: number | null;
  unit_price: number | null;
  line_total?: number | null;
}

interface ProductRow {
  id: number;
  name: string;
  sku?: string | null;
  purchase_price?: number | null;
  min_stock?: number | null;
  is_active?: boolean | null;
  business_unit?: string | null;
}

interface StockRow {
  product_id: number;
  qty_base: number;
}

interface CreditNoteRow {
  due_date?: string | null;
  balance?: number | null;
  credit_customers?: { name?: string | null } | null;
  concrete_credit_customers?: { name?: string | null } | null;
}

interface PeriodMetrics {
  salesTotal: number;
  salesCount: number;
  avgTicket: number;
  purchasesTotal: number;
  marginAmount: number;
  marginPct: number;
  costedSalesTotal: number;
  missingCostSalesTotal: number;
  missingCostItems: number;
  creditSalesTotal: number;
  topProducts: Array<{ id: string; name: string; qty: number; total: number; margin: number }>;
  topCustomers: Array<{ name: string; total: number; tickets: number }>;
}

interface DashboardData {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  overdueTotal: number;
  overdueCount: number;
  topDebtCustomer?: { name: string; balance: number };
  stockCritical: Array<{ id: string; name: string; stock: number; min: number; soldQty: number; soldTotal: number }>;
  stockLowRotation: Array<{ id: string; name: string; stock: number; min: number; soldQty: number }>;
  insights: ManagerInsight[];
}

const emptyMetrics = (): PeriodMetrics => ({
  salesTotal: 0,
  salesCount: 0,
  avgTicket: 0,
  purchasesTotal: 0,
  marginAmount: 0,
  marginPct: 0,
  costedSalesTotal: 0,
  missingCostSalesTotal: 0,
  missingCostItems: 0,
  creditSalesTotal: 0,
  topProducts: [],
  topCustomers: [],
});

const lineAmount = (item: ItemRow) =>
  Number(item.line_total ?? (Number(item.qty || 0) * Number(item.unit_price || 0)));

const creditAmountFromTx = (tx: TxRow, txTotal: number) => {
  const explicitCredit = Number(tx.credit_amount ?? 0);
  if (explicitCredit > 0) return explicitCredit;
  const paymentType = String(tx.payment_type ?? '').trim().toUpperCase();
  if (tx.is_credit || paymentType === 'CREDITO' || paymentType === 'CRÉDITO') return txTotal;
  return 0;
};

const toLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateInput = (value: string, endOfDay = false) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    year,
    (month || 1) - 1,
    day || 1,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

const diffDaysInclusive = (from: Date, to: Date) =>
  Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));

const previousRange = (from: Date, to: Date) => {
  const days = diffDaysInclusive(from, to);
  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  prevTo.setHours(23, 59, 59, 999);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - days + 1);
  prevFrom.setHours(0, 0, 0, 0);
  return { from: prevFrom, to: prevTo };
};

const pctChange = (current: number, previous: number) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${formatNumber(value, undefined, { maximumFractionDigits: 1 })}%`;

const unitConfig = {
  materiales: {
    label: 'Materiales',
    txTable: 'inventory_transactions',
    itemTable: 'inventory_transaction_items',
    productTable: 'products',
    stockTable: 'inventory_stock',
    creditTable: 'credit_notes',
    creditCustomerRelation: 'credit_customers',
  },
  concretera: {
    label: 'Concretera',
    txTable: 'concrete_inventory_transactions',
    itemTable: 'concrete_inventory_transaction_items',
    productTable: 'concrete_products',
    stockTable: 'concrete_inventory_stock',
    creditTable: 'concrete_credit_notes',
    creditCustomerRelation: 'concrete_credit_customers',
  },
} as const;

const statusTone = (value: number) =>
  value >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100';

const ExecutiveDashboardScreen: React.FC<ExecutiveDashboardScreenProps> = ({ selectedBranchId, branches }) => {
  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  const branchName = branches.find((b) => b.id === selectedBranchId)?.name ?? 'Sucursal activa';
  const [unit, setUnit] = useState<ExecutiveUnit>('materiales');
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    if (datePreset === 'today') {
      setStartDate(toLocalDateInputValue(today));
      setEndDate(toLocalDateInputValue(today));
      return;
    }
    if (datePreset === '7d') {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      setStartDate(toLocalDateInputValue(start));
      setEndDate(toLocalDateInputValue(today));
      return;
    }
    if (datePreset === '30d') {
      const start = new Date();
      start.setDate(today.getDate() - 29);
      setStartDate(toLocalDateInputValue(start));
      setEndDate(toLocalDateInputValue(today));
      return;
    }
    if (datePreset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(toLocalDateInputValue(start));
      setEndDate(toLocalDateInputValue(end));
    }
  }, [datePreset]);

  const loadPeriodMetrics = useCallback(async (
    selectedUnit: ExecutiveUnit,
    from: Date,
    to: Date,
    productMap: Record<string, ProductRow>,
  ): Promise<PeriodMetrics> => {
    const cfg = unitConfig[selectedUnit];
    let txQuery = supabase
      .from(cfg.txTable)
      .select('id, type, created_at, nombre_cliente, is_credit, payment_type, credit_amount')
      .eq('branch_id', branchId)
      .eq('is_deleted', false)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (selectedUnit === 'materiales') txQuery = txQuery.eq('business_unit', selectedUnit);

    const { data: txData, error: txError } = await txQuery;
    if (txError) throw txError;

    const txList = (txData ?? []) as TxRow[];
    const txIds = txList.map((tx) => tx.id);
    let items: ItemRow[] = [];

    if (txIds.length > 0) {
      const { data: itemData, error: itemError } = await supabase
        .from(cfg.itemTable)
        .select('transaction_id, product_id, qty, qty_base, unit_price, line_total')
        .in('transaction_id', txIds);
      if (itemError) throw itemError;
      items = (itemData ?? []) as ItemRow[];
    }

    const txById = txList.reduce<Record<number, TxRow>>((acc, tx) => {
      acc[tx.id] = tx;
      return acc;
    }, {});
    const itemsByTx = items.reduce<Record<number, ItemRow[]>>((acc, item) => {
      if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
      acc[item.transaction_id].push(item);
      return acc;
    }, {});

    const productAgg: Record<string, { qty: number; total: number; margin: number }> = {};
    const customerAgg: Record<string, { total: number; tickets: Set<number> }> = {};
    let salesTotal = 0;
    let purchasesTotal = 0;
    let marginAmount = 0;
    let costedSalesTotal = 0;
    let missingCostSalesTotal = 0;
    let missingCostItems = 0;
    let creditSalesTotal = 0;

    txList.forEach((tx) => {
      const txItems = itemsByTx[tx.id] ?? [];
      const txTotal = txItems.reduce((sum, item) => sum + lineAmount(item), 0);
      if (tx.type === 'SALE') {
        salesTotal += txTotal;
        creditSalesTotal += creditAmountFromTx(tx, txTotal);
        const customer = tx.nombre_cliente?.trim() || 'Mostrador';
        if (!customerAgg[customer]) customerAgg[customer] = { total: 0, tickets: new Set<number>() };
        customerAgg[customer].total += txTotal;
        customerAgg[customer].tickets.add(tx.id);
      }
      if (tx.type === 'PURCHASE') purchasesTotal += txTotal;

      if (tx.type !== 'SALE') return;
      txItems.forEach((item) => {
        const key = String(item.product_id);
        const amount = lineAmount(item);
        const product = productMap[key];
        const purchasePrice = Number(product?.purchase_price ?? 0);
        const hasRegisteredCost = Number.isFinite(purchasePrice) && purchasePrice > 0;
        const cost = hasRegisteredCost ? purchasePrice * Number(item.qty_base ?? item.qty ?? 0) : 0;
        const itemMargin = amount - cost;
        if (!productAgg[key]) productAgg[key] = { qty: 0, total: 0, margin: 0 };
        productAgg[key].qty += Number(item.qty ?? 0);
        productAgg[key].total += amount;
        if (hasRegisteredCost) {
          productAgg[key].margin += itemMargin;
          marginAmount += itemMargin;
          costedSalesTotal += amount;
        } else {
          missingCostSalesTotal += amount;
          missingCostItems += 1;
        }
      });
    });

    const salesCount = txList.filter((tx) => tx.type === 'SALE' && (itemsByTx[tx.id] ?? []).length > 0).length;
    const topProducts = Object.entries(productAgg)
      .map(([id, row]) => ({ id, name: productMap[id]?.name ?? `Producto ${id}`, ...row }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const topCustomers = Object.entries(customerAgg)
      .map(([name, row]) => ({ name, total: row.total, tickets: row.tickets.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      salesTotal,
      salesCount,
      avgTicket: salesCount > 0 ? salesTotal / salesCount : 0,
      purchasesTotal,
      marginAmount,
      marginPct: costedSalesTotal > 0 ? (marginAmount / costedSalesTotal) * 100 : 0,
      costedSalesTotal,
      missingCostSalesTotal,
      missingCostItems,
      creditSalesTotal,
      topProducts,
      topCustomers,
    };
  }, [branchId]);

  const loadDashboard = useCallback(async () => {
    if (!branchId || !startDate || !endDate) return;
    setIsLoading(true);
    setError(null);

    try {
      const cfg = unitConfig[unit];
      const rangeStart = parseLocalDateInput(startDate);
      const rangeEnd = parseLocalDateInput(endDate, true);
      const prev = previousRange(rangeStart, rangeEnd);

      let productQuery = supabase
        .from(cfg.productTable)
        .select('id, name, sku, purchase_price, min_stock, is_active')
        .eq('branch_id', branchId);
      if (unit === 'materiales') {
        productQuery = supabase
          .from(cfg.productTable)
          .select('id, name, sku, purchase_price, min_stock, is_active, business_unit')
          .eq('branch_id', branchId)
          .eq('business_unit', unit);
      }

      const creditSelect = `due_date, balance, ${cfg.creditCustomerRelation} ( name )`;
      let creditQuery = supabase
        .from(cfg.creditTable)
        .select(creditSelect)
        .eq('branch_id', branchId)
        .gt('balance', 0);
      if (unit === 'materiales') creditQuery = creditQuery.eq('business_unit', unit);

      const [
        { data: productData, error: productError },
        { data: stockData, error: stockError },
        { data: creditData, error: creditError },
      ] = await Promise.all([
        productQuery,
        supabase.from(cfg.stockTable).select('product_id, qty_base').eq('branch_id', branchId),
        creditQuery,
      ]);

      if (productError) throw productError;
      if (stockError) throw stockError;
      if (creditError) throw creditError;

      const products = ((productData ?? []) as ProductRow[]).filter((product) => product.is_active !== false);
      const productMap = products.reduce<Record<string, ProductRow>>((acc, product) => {
        acc[String(product.id)] = product;
        return acc;
      }, {});

      const [current, previous] = await Promise.all([
        loadPeriodMetrics(unit, rangeStart, rangeEnd, productMap),
        loadPeriodMetrics(unit, prev.from, prev.to, productMap),
      ]);

      const stockRows = (stockData ?? []) as StockRow[];
      const soldByProduct = current.topProducts.reduce<Record<string, { qty: number; total: number }>>((acc, product) => {
        acc[product.id] = { qty: product.qty, total: product.total };
        return acc;
      }, {});

      const stockAnalysis = stockRows
        .map((row) => {
          const product = productMap[String(row.product_id)];
          if (!product) return null;
          const stock = Number(row.qty_base ?? 0);
          const min = Number(product.min_stock ?? 0);
          const sold = soldByProduct[String(row.product_id)] ?? { qty: 0, total: 0 };
          return { id: String(row.product_id), name: product.name, stock, min, soldQty: sold.qty, soldTotal: sold.total };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const stockCritical = stockAnalysis
        .filter((row) => row.min > 0 && row.stock <= row.min)
        .sort((a, b) => (b.soldTotal - a.soldTotal) || ((b.min - b.stock) - (a.min - a.stock)))
        .slice(0, 8);
      const stockLowRotation = stockAnalysis
        .filter((row) => row.stock > 0 && row.soldQty <= 1)
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 8);

      const today = toLocalDateInputValue(new Date());
      const creditRows = (creditData ?? []) as CreditNoteRow[];
      const overdueRows = creditRows.filter((row) => Number(row.balance ?? 0) > 0 && row.due_date && row.due_date < today);
      const overdueTotal = overdueRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
      const topDebt = [...overdueRows].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))[0];
      const topDebtCustomer = topDebt ? {
        name: unit === 'materiales'
          ? topDebt.credit_customers?.name ?? 'Cliente sin nombre'
          : topDebt.concrete_credit_customers?.name ?? 'Cliente sin nombre',
        balance: Number(topDebt.balance ?? 0),
      } : undefined;

      const salesChange = pctChange(current.salesTotal, previous.salesTotal);
      const purchaseChange = pctChange(current.purchasesTotal, previous.purchasesTotal);
      const topProductShare = current.salesTotal > 0 && current.topProducts[0] ? current.topProducts[0].total / current.salesTotal : 0;
      const topCustomerShare = current.salesTotal > 0 && current.topCustomers[0] ? current.topCustomers[0].total / current.salesTotal : 0;
      const generatedInsights: ManagerInsight[] = [];

      if (salesChange <= -15) {
        generatedInsights.push({
          id: 'caida-ventas',
          priority: salesChange <= -30 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Caída de ventas contra periodo anterior',
          metric: formatPct(salesChange),
          description: `Ventas actuales ${formatCurrency(current.salesTotal)} vs ${formatCurrency(previous.salesTotal)} del periodo anterior.`,
          action: 'Revisar clientes principales, producto líder y días sin operación para ubicar la causa.',
        });
      }

      if (overdueTotal > 0) {
        generatedInsights.push({
          id: 'cartera-vencida',
          priority: overdueTotal >= current.salesTotal * 0.25 || overdueRows.length >= 5 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Cartera vencida activa',
          metric: formatCurrency(overdueTotal),
          description: `${overdueRows.length} nota${overdueRows.length === 1 ? '' : 's'} vencida${overdueRows.length === 1 ? '' : 's'} con saldo pendiente.`,
          action: topDebtCustomer
            ? `Priorizar cobranza a ${topDebtCustomer.name} por ${formatCurrency(topDebtCustomer.balance)}.`
            : 'Revisar saldos antes de autorizar más crédito.',
        });
      }

      if (current.purchasesTotal > current.salesTotal && current.purchasesTotal > 0) {
        generatedInsights.push({
          id: 'compras-superan-ventas',
          priority: current.salesTotal === 0 || current.purchasesTotal > current.salesTotal * 1.25 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Compras superan ventas del periodo',
          metric: formatCurrency(current.purchasesTotal - current.salesTotal),
          description: `Compras ${formatCurrency(current.purchasesTotal)} contra ventas ${formatCurrency(current.salesTotal)}.`,
          action: 'Validar si la diferencia quedó en inventario o si hay compras no relacionadas con venta inmediata.',
        });
      }

      if (stockCritical.length > 0) {
        generatedInsights.push({
          id: 'stock-critico',
          priority: stockCritical[0].soldQty > 0 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Inventario crítico',
          metric: stockCritical[0].name,
          description: `Stock ${formatNumber(stockCritical[0].stock)} contra mínimo ${formatNumber(stockCritical[0].min)}.`,
          action: stockCritical[0].soldQty > 0
            ? 'Es producto con movimiento reciente; revisar reabasto o transferencia hoy.'
            : 'Validar si el mínimo sigue vigente antes de comprar.',
        });
      }

      if (purchaseChange > salesChange + 25 && current.purchasesTotal > 0) {
        generatedInsights.push({
          id: 'compras-crecen-mas',
          priority: 'media',
          kind: 'risk',
          title: 'Compras crecen más que ventas',
          metric: `Compras ${formatPct(purchaseChange)}`,
          description: `Ventas cambiaron ${formatPct(salesChange)} en el mismo comparativo.`,
          action: 'Confirmar que el abastecimiento responda a pedidos reales o productos de alta rotación.',
        });
      }

      if (topProductShare >= 0.35 && current.topProducts[0]) {
        generatedInsights.push({
          id: 'concentracion-producto',
          priority: 'media',
          kind: 'opportunity',
          title: 'Alta concentración en producto líder',
          metric: `${Math.round(topProductShare * 100)}%`,
          description: `${current.topProducts[0].name} concentra una parte importante de la venta.`,
          action: 'Proteger disponibilidad y revisar condiciones comerciales antes de depender más de ese producto.',
        });
      }

      if (topCustomerShare >= 0.4 && current.topCustomers[0]) {
        generatedInsights.push({
          id: 'concentracion-cliente',
          priority: 'media',
          kind: 'risk',
          title: 'Dependencia de cliente principal',
          metric: `${Math.round(topCustomerShare * 100)}%`,
          description: `${current.topCustomers[0].name} concentra gran parte de la venta del periodo.`,
          action: 'Revisar condiciones comerciales y abrir seguimiento de retención.',
        });
      }

      setData({
        current,
        previous,
        overdueTotal,
        overdueCount: overdueRows.length,
        topDebtCustomer,
        stockCritical,
        stockLowRotation,
        insights: generatedInsights.slice(0, 8),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard gerencial.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, startDate, endDate, unit, loadPeriodMetrics]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const current = data?.current ?? emptyMetrics();
  const previous = data?.previous ?? emptyMetrics();
  const salesChange = pctChange(current.salesTotal, previous.salesTotal);
  const purchaseChange = pctChange(current.purchasesTotal, previous.purchasesTotal);
  const creditChange = pctChange(current.creditSalesTotal, previous.creditSalesTotal);
  const creditShare = current.salesTotal > 0 ? (current.creditSalesTotal / current.salesTotal) * 100 : 0;
  const cashSalesTotal = Math.max(0, current.salesTotal - current.creditSalesTotal);
  const topProductName = current.topProducts[0]?.name ?? 'Sin ventas';
  const topCustomerName = current.topCustomers[0]?.name ?? 'Sin clientes';

  const kpiCards = [
    {
      label: 'Ventas',
      value: formatCurrency(current.salesTotal),
      change: salesChange,
      icon: DollarSign,
      help: `${current.salesCount} tickets`,
      tone: 'from-slate-900 to-slate-800 text-white border-slate-800',
      iconTone: 'bg-white/10 text-white',
    },
    {
      label: 'Compras',
      value: formatCurrency(current.purchasesTotal),
      change: purchaseChange,
      icon: PackageSearch,
      help: 'Abastecimiento del periodo',
      tone: 'from-orange-500 to-orange-600 text-white border-orange-500',
      iconTone: 'bg-white/15 text-white',
    },
    {
      label: 'Ventas a crédito',
      value: formatCurrency(current.creditSalesTotal),
      change: creditChange,
      icon: CalendarDays,
      help: `${formatNumber(creditShare, undefined, { maximumFractionDigits: 1 })}% de ventas`,
      tone: 'from-blue-50 to-white text-slate-900 border-blue-100',
      iconTone: 'bg-blue-100 text-blue-700',
    },
    {
      label: 'Cartera vencida',
      value: formatCurrency(data?.overdueTotal ?? 0),
      change: 0,
      icon: AlertTriangle,
      help: `${data?.overdueCount ?? 0} notas vencidas`,
      tone: 'from-red-50 to-white text-slate-900 border-red-100',
      iconTone: 'bg-red-100 text-red-700',
    },
  ];

  return (
    <div className="h-full w-full overflow-y-auto px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 lg:gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 xl:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-500">Dashboard Gerencial</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Resumen ejecutivo del negocio</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {branchName}. Comparativo del periodo seleccionado contra el periodo anterior equivalente.
              </p>
            </div>
            <button
              onClick={() => void loadDashboard()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_1fr_1fr]">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Unidad</span>
              <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {(['materiales', 'concretera'] as ExecutiveUnit[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setUnit(value)}
                    className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest transition ${
                      unit === value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {unitConfig[value].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Periodo</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'today', label: 'Hoy' },
                  { id: '7d', label: '7 días' },
                  { id: '30d', label: '30 días' },
                  { id: 'month', label: 'Mes' },
                  { id: 'custom', label: 'Manual' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setDatePreset(preset.id as DatePreset)}
                    className={`rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-widest transition ${
                      datePreset === preset.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Desde</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setStartDate(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Hasta</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setEndDate(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            const TrendIcon = card.change >= 0 ? ArrowUpRight : ArrowDownRight;
            return (
              <article key={card.label} className={`min-h-[170px] rounded-[28px] border bg-gradient-to-br p-5 shadow-lg ${card.tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] opacity-80">{card.label}</p>
                    <p className="mt-4 break-words text-3xl font-black tracking-tight md:text-4xl">{card.value}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconTone}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold opacity-80">{card.help}</p>
                  {card.label !== 'Cartera vencida' && !card.hideChange && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${statusTone(card.change)}`}>
                      <TrendIcon size={12} /> {formatPct(card.change)}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <ManagerInsightsPanel
          insights={data?.insights ?? []}
          isLoading={isLoading}
          subtitle={`${unitConfig[unit].label}: riesgos, oportunidades y acciones sugeridas con comparativo vs periodo anterior.`}
        />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {[
            { label: 'Ventas de contado', value: formatCurrency(cashSalesTotal), help: 'Venta no cubierta por crédito', icon: DollarSign },
            { label: 'Stock crítico', value: String(data?.stockCritical.length ?? 0), help: 'Productos debajo del mínimo', icon: AlertTriangle },
            { label: 'Producto líder', value: topProductName, help: current.topProducts[0] ? formatCurrency(current.topProducts[0].total) : 'Sin ventas', icon: PackageSearch },
            { label: 'Cliente principal', value: topCustomerName, help: current.topCustomers[0] ? formatCurrency(current.topCustomers[0].total) : 'Sin clientes', icon: Users },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                    <p className="mt-3 line-clamp-2 break-words text-2xl font-black text-slate-900">{item.value}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{item.help}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
                    <Icon size={18} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Productos clave</h3>
            <div className="mt-4 space-y-3">
              {current.topProducts.slice(0, 5).map((product, index) => (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{index + 1}. {product.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{formatNumber(product.qty, undefined, { maximumFractionDigits: 2 })} vendidos</p>
                  </div>
                  <p className="text-sm font-black text-slate-900">{formatCurrency(product.total)}</p>
                </div>
              ))}
              {current.topProducts.length === 0 && <p className="text-sm font-semibold text-slate-500">Sin ventas en el periodo.</p>}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Clientes principales</h3>
            <div className="mt-4 space-y-3">
              {current.topCustomers.slice(0, 5).map((customer, index) => (
                <div key={`${customer.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{index + 1}. {customer.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{customer.tickets} tickets</p>
                  </div>
                  <p className="text-sm font-black text-slate-900">{formatCurrency(customer.total)}</p>
                </div>
              ))}
              {current.topCustomers.length === 0 && <p className="text-sm font-semibold text-slate-500">Sin clientes en el periodo.</p>}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Inventario crítico</h3>
            <div className="mt-4 space-y-3">
              {(data?.stockCritical ?? []).slice(0, 5).map((product, index) => (
                <div key={product.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-900">{index + 1}. {product.name}</p>
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">
                      {formatNumber(product.stock)} / {formatNumber(product.min)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Venta periodo: {formatNumber(product.soldQty, undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
              {(data?.stockCritical.length ?? 0) === 0 && <p className="text-sm font-semibold text-slate-500">Sin stock crítico detectado.</p>}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
};

export default ExecutiveDashboardScreen;
