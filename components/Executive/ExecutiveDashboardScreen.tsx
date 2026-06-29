import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CalendarDays, ClipboardList, DollarSign, PackageSearch, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { formatCurrency, formatNumber } from '../../services/currency';
import { Branch } from '../../types';
import ManagerInsightsPanel, { ManagerInsight } from '../common/ManagerInsightsPanel';

interface ExecutiveDashboardScreenProps {
  selectedBranchId: string;
  branches: Branch[];
  fixedUnit?: ExecutiveUnit;
}

type ExecutiveUnit = 'materiales' | 'concretera' | 'transporteria';
type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom';
type ActionPriority = 'alta' | 'media' | 'baja';

interface TxRow {
  id: number;
  type: 'PURCHASE' | 'SALE' | 'ADJUST' | 'TRANSFER';
  created_at: string;
  nombre_cliente?: string | null;
  created_by?: string | null;
  supplier_id?: string | number | null;
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
  customers: Array<{ name: string; total: number; tickets: number }>;
  salesMissingResponsible: number;
  purchasesMissingSupplier: number;
}

interface CustomerDrop {
  name: string;
  previousTotal: number;
  currentTotal: number;
  changePct: number;
}

interface DataQualityIssue {
  id: string;
  label: string;
  value: string;
  severity: 'alta' | 'media' | 'baja';
  description: string;
}

interface ActionRecommendation {
  id: string;
  title: string;
  description: string;
  priority: ActionPriority;
  area: string;
  suggestedOwner: string;
}

interface DashboardAssistantAgent {
  id: string;
  name: string;
  subtitle: string;
  tone: string;
  focus: string[];
}

interface ManagerCard {
  title: string;
  icon: React.ElementType;
  status: string;
  tone: string;
  summary: string;
  actions: string[];
  agent: DashboardAssistantAgent;
  context?: string[];
}

interface DashboardData {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  overdueTotal: number;
  overdueCount: number;
  topDebtCustomer?: { name: string; balance: number };
  stockCritical: Array<{ id: string; name: string; stock: number; min: number; soldQty: number; soldTotal: number }>;
  stockLowRotation: Array<{ id: string; name: string; stock: number; min: number; soldQty: number }>;
  customerDrops: CustomerDrop[];
  dataQuality: DataQualityIssue[];
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
  customers: [],
  salesMissingResponsible: 0,
  purchasesMissingSupplier: 0,
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
const formatAbsPct = (value: number) => `${formatNumber(Math.abs(value), undefined, { maximumFractionDigits: 1 })}%`;

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
  transporteria: {
    label: 'Transportería',
    txTable: 'inventory_transactions',
    itemTable: 'inventory_transaction_items',
    productTable: 'products',
    stockTable: 'inventory_stock',
    creditTable: 'credit_notes',
    creditCustomerRelation: 'credit_customers',
  },
} as const;

const priorityTone: Record<ActionPriority, string> = {
  alta: 'border-red-200 bg-red-50 text-red-700',
  media: 'border-amber-200 bg-amber-50 text-amber-700',
  baja: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const ExecutiveDashboardScreen: React.FC<ExecutiveDashboardScreenProps> = ({ selectedBranchId, branches, fixedUnit }) => {
  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);

  const branchName = branches.find((b) => b.id === selectedBranchId)?.name ?? 'Sucursal activa';
  const [unit, setUnit] = useState<ExecutiveUnit>(fixedUnit ?? 'materiales');
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixedUnit) setUnit(fixedUnit);
  }, [fixedUnit]);

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
      .select('id, type, created_at, nombre_cliente, created_by, supplier_id, is_credit, payment_type, credit_amount')
      .eq('branch_id', branchId)
      .eq('is_deleted', false)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (selectedUnit !== 'concretera') txQuery = txQuery.eq('business_unit', selectedUnit);

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
    let salesMissingResponsible = 0;
    let purchasesMissingSupplier = 0;

    txList.forEach((tx) => {
      const txItems = itemsByTx[tx.id] ?? [];
      const txTotal = txItems.reduce((sum, item) => sum + lineAmount(item), 0);
      if (tx.type === 'SALE') {
        salesTotal += txTotal;
        if (!String(tx.created_by ?? '').trim()) salesMissingResponsible += 1;
        creditSalesTotal += creditAmountFromTx(tx, txTotal);
        const customer = tx.nombre_cliente?.trim() || 'Mostrador';
        if (!customerAgg[customer]) customerAgg[customer] = { total: 0, tickets: new Set<number>() };
        customerAgg[customer].total += txTotal;
        customerAgg[customer].tickets.add(tx.id);
      }
      if (tx.type === 'PURCHASE') {
        purchasesTotal += txTotal;
        if (!tx.supplier_id) purchasesMissingSupplier += 1;
      }

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
    const customers = Object.entries(customerAgg)
      .map(([name, row]) => ({ name, total: row.total, tickets: row.tickets.size }))
      .sort((a, b) => b.total - a.total);

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
      customers,
      salesMissingResponsible,
      purchasesMissingSupplier,
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
      if (unit !== 'concretera') {
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
      if (unit !== 'concretera') creditQuery = creditQuery.eq('business_unit', unit);

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
      const negativeStockCount = stockAnalysis.filter((row) => row.stock < 0).length;
      const productsWithoutCost = products.filter((product) => Number(product.purchase_price ?? 0) <= 0).length;
      const productsWithoutMinStock = products.filter((product) => Number(product.min_stock ?? 0) <= 0).length;

      const today = toLocalDateInputValue(new Date());
      const creditRows = (creditData ?? []) as CreditNoteRow[];
      const overdueRows = creditRows.filter((row) => Number(row.balance ?? 0) > 0 && row.due_date && row.due_date < today);
      const overdueTotal = overdueRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
      const topDebt = [...overdueRows].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))[0];
      const topDebtCustomer = topDebt ? {
        name: unit === 'concretera'
          ? topDebt.concrete_credit_customers?.name ?? 'Cliente sin nombre'
          : topDebt.credit_customers?.name ?? 'Cliente sin nombre',
        balance: Number(topDebt.balance ?? 0),
      } : undefined;

      const salesChange = pctChange(current.salesTotal, previous.salesTotal);
      const purchaseChange = pctChange(current.purchasesTotal, previous.purchasesTotal);
      const topProductShare = current.salesTotal > 0 && current.topProducts[0] ? current.topProducts[0].total / current.salesTotal : 0;
      const topCustomerShare = current.salesTotal > 0 && current.topCustomers[0] ? current.topCustomers[0].total / current.salesTotal : 0;
      const currentCustomerMap = current.customers.reduce<Record<string, { total: number; tickets: number }>>((acc, row) => {
        acc[row.name] = row;
        return acc;
      }, {});
      const customerDrops = previous.customers
        .filter((row) => row.name !== 'Mostrador' && row.total >= 1000)
        .map((row) => {
          const currentRow = currentCustomerMap[row.name];
          const currentTotal = currentRow?.total ?? 0;
          return {
            name: row.name,
            previousTotal: row.total,
            currentTotal,
            changePct: pctChange(currentTotal, row.total),
          };
        })
        .filter((row) => row.changePct <= -40)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 8);

      const dataQuality: DataQualityIssue[] = [
        {
          id: 'productos-sin-costo',
          label: 'Productos sin costo',
          value: String(productsWithoutCost),
          severity: productsWithoutCost > 20 ? 'alta' : productsWithoutCost > 0 ? 'media' : 'baja',
          description: 'Afecta cualquier análisis futuro de rentabilidad.',
        },
        {
          id: 'productos-sin-minimo',
          label: 'Productos sin mínimo',
          value: String(productsWithoutMinStock),
          severity: productsWithoutMinStock > 20 ? 'media' : productsWithoutMinStock > 0 ? 'baja' : 'baja',
          description: 'Limita las alertas preventivas de reabasto.',
        },
        {
          id: 'stock-negativo',
          label: 'Stock negativo',
          value: String(negativeStockCount),
          severity: negativeStockCount > 0 ? 'alta' : 'baja',
          description: 'Puede indicar ventas sin existencia, ajustes pendientes o errores de captura.',
        },
        {
          id: 'ventas-sin-responsable',
          label: 'Ventas sin responsable',
          value: String(current.salesMissingResponsible),
          severity: current.salesMissingResponsible > 0 ? 'media' : 'baja',
          description: 'Dificulta auditoría y seguimiento operativo.',
        },
        {
          id: 'compras-sin-proveedor',
          label: 'Compras sin proveedor',
          value: String(current.purchasesMissingSupplier),
          severity: current.purchasesMissingSupplier > 0 ? 'media' : 'baja',
          description: 'Reduce trazabilidad de abastecimiento.',
        },
      ];
      const generatedInsights: ManagerInsight[] = [];

      if (salesChange <= -15) {
        generatedInsights.push({
          id: 'caida-ventas',
          priority: salesChange <= -30 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Caída de ventas contra periodo previo',
          metric: formatAbsPct(salesChange),
          description: `Ventas actuales ${formatCurrency(current.salesTotal)} vs ${formatCurrency(previous.salesTotal)} del periodo previo equivalente.`,
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
          description: salesChange < 0
            ? `Ventas bajaron ${formatAbsPct(salesChange)} en el mismo comparativo.`
            : `Ventas cambiaron ${formatPct(salesChange)} en el mismo comparativo.`,
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

      if (customerDrops.length > 0) {
        generatedInsights.push({
          id: 'clientes-en-caida',
          priority: customerDrops[0].previousTotal >= current.salesTotal * 0.15 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Cliente importante en caída',
          metric: customerDrops[0].name,
          description: `Pasó de ${formatCurrency(customerDrops[0].previousTotal)} a ${formatCurrency(customerDrops[0].currentTotal)}.`,
          action: 'Contactar al cliente y revisar si hubo falta de producto, precio o atención.',
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
        customerDrops,
        dataQuality,
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
  const selectedRangeDays = startDate && endDate
    ? diffDaysInclusive(parseLocalDateInput(startDate), parseLocalDateInput(endDate, true))
    : 0;
  const previousPeriodLabel = selectedRangeDays <= 1
    ? 'ayer'
    : `los ${selectedRangeDays} días anteriores`;
  const actionRecommendations: ActionRecommendation[] = [
    ...(data?.overdueTotal
      ? [{
          id: 'cobranza-prioritaria',
          title: 'Priorizar cobranza vencida',
          description: data.topDebtCustomer
            ? `Contactar a ${data.topDebtCustomer.name} por ${formatCurrency(data.topDebtCustomer.balance)} y revisar bloqueo de crédito.`
            : `Atender ${data.overdueCount} notas vencidas por ${formatCurrency(data.overdueTotal)}.`,
          priority: 'alta' as const,
          area: 'Cobranza',
          suggestedOwner: 'Administración',
        }]
      : []),
    ...(data?.stockCritical?.length
      ? [{
          id: 'reabasto-critico',
          title: 'Resolver inventario crítico',
          description: `Revisar ${data.stockCritical[0].name}: stock ${formatNumber(data.stockCritical[0].stock)} contra mínimo ${formatNumber(data.stockCritical[0].min)}.`,
          priority: data.stockCritical[0].soldQty > 0 ? 'alta' as const : 'media' as const,
          area: 'Inventario',
          suggestedOwner: 'Compras / Almacén',
        }]
      : []),
    ...(data?.customerDrops?.length
      ? [{
          id: 'recuperar-cliente',
          title: 'Recuperar cliente en caída',
          description: `${data.customerDrops[0].name} bajó de ${formatCurrency(data.customerDrops[0].previousTotal)} a ${formatCurrency(data.customerDrops[0].currentTotal)}.`,
          priority: 'media' as const,
          area: 'Ventas',
          suggestedOwner: 'Ventas',
        }]
      : []),
    ...(current.purchasesTotal > current.salesTotal && current.purchasesTotal > 0
      ? [{
          id: 'validar-compras-vs-ventas',
          title: 'Validar compras mayores a ventas',
          description: `Compras superan ventas por ${formatCurrency(current.purchasesTotal - current.salesTotal)} en el periodo.`,
          priority: current.purchasesTotal > current.salesTotal * 1.25 ? 'alta' as const : 'media' as const,
          area: 'Compras',
          suggestedOwner: 'Compras / Dirección',
        }]
      : []),
    ...((data?.dataQuality ?? [])
      .filter((issue) => issue.severity !== 'baja' && Number(issue.value) > 0)
      .slice(0, 2)
      .map((issue) => ({
        id: `calidad-${issue.id}`,
        title: `Corregir ${issue.label.toLowerCase()}`,
        description: `${issue.value} caso(s). ${issue.description}`,
        priority: issue.severity === 'alta' ? 'alta' as const : 'media' as const,
        area: 'Datos',
        suggestedOwner: 'Administración / Sistemas',
      }))),
  ].slice(0, 6);

  const morningHighlights = [
    ...(salesChange <= -10
      ? [`Las ventas bajaron ${formatAbsPct(salesChange)} contra ${previousPeriodLabel}.`]
      : current.salesTotal > 0
        ? [`Ventas del periodo: ${formatCurrency(current.salesTotal)} en ${current.salesCount} tickets.`]
        : ['No hay ventas registradas en el periodo seleccionado.']),
    ...(data?.customerDrops?.length
      ? [`${data.customerDrops.length} cliente${data.customerDrops.length > 1 ? 's' : ''} relevante${data.customerDrops.length > 1 ? 's' : ''} bajaron fuerte su compra.`]
      : []),
    ...(data?.stockCritical?.length
      ? [`${data.stockCritical.length} producto${data.stockCritical.length > 1 ? 's' : ''} en stock crítico.`]
      : []),
    ...(data?.overdueTotal
      ? [`Cartera vencida: ${formatCurrency(data.overdueTotal)} en ${data.overdueCount} nota${data.overdueCount !== 1 ? 's' : ''}.`]
      : []),
    ...(current.purchasesTotal > current.salesTotal && current.purchasesTotal > 0
      ? [`Compras superan ventas por ${formatCurrency(current.purchasesTotal - current.salesTotal)}.`]
      : []),
    ...((data?.dataQuality ?? [])
      .filter((issue) => issue.severity !== 'baja' && Number(issue.value) > 0)
      .slice(0, 2)
      .map((issue) => `${issue.label}: ${issue.value} caso${Number(issue.value) === 1 ? '' : 's'} por corregir.`)),
  ].slice(0, 7);

  const generalExecutiveSummary = (() => {
    const dataIssues = (data?.dataQuality ?? [])
      .filter((issue) => issue.severity !== 'baja' && Number(issue.value) > 0)
      .slice(0, 2)
      .map((issue) => `${issue.label.toLowerCase()}: ${issue.value}`);
    const commercialReading = salesChange <= -10
      ? `tomando en cuenta lo que muestra el Gerente Comercial, tenemos que recuperar venta porque bajó ${formatAbsPct(salesChange)} contra ${previousPeriodLabel}${data?.customerDrops?.length ? ` y ${data.customerDrops.length} clientes importantes bajaron su compra` : ''}`
      : `tomando en cuenta lo que muestra el Gerente Comercial, la venta actual es de ${formatCurrency(current.salesTotal)} en ${current.salesCount} tickets y conviene cuidar a los clientes principales`;
    const financialReading = data?.overdueTotal
      ? `desde el Gerente Financiero, la prioridad es cobrar ${formatCurrency(data.overdueTotal)} de cartera vencida${data.topDebtCustomer ? `, empezando por ${data.topDebtCustomer.name}` : ''}, para proteger flujo`
      : 'desde el Gerente Financiero, no se detecta cartera vencida crítica con estos filtros, pero se debe mantener vigilancia de crédito';
    const purchasingReading = data?.stockCritical?.length
      ? `el Gerente de Compras indica que hay ${data.stockCritical.length} producto${data.stockCritical.length === 1 ? '' : 's'} con inventario crítico y hay que resolver reabasto o traspaso antes de comprometer pedidos nuevos`
      : 'el Gerente de Compras no detecta inventario crítico, pero recomienda sostener compras alineadas a consumo real';
    const productionReading = unit === 'materiales'
      ? 'el Gerente de Producción sugiere completar la medición de tiempos muertos, desperdicio y eficiencia para saber dónde se pierde capacidad operativa'
      : unit === 'concretera'
        ? 'el Gerente de Producción sugiere registrar tiempos, retrasos, desperdicio y eficiencia de planta para ubicar pérdidas operativas'
        : 'el Gerente de Producción sugiere medir rutas, tiempos de entrega, rendimiento y rechazos para controlar la operación';
    const directionReading = current.purchasesTotal > current.salesTotal && current.purchasesTotal > 0
      ? `además, como las compras superan ventas por ${formatCurrency(current.purchasesTotal - current.salesTotal)}, Dirección debe validar si ese dinero quedó en inventario sano o si está presionando el flujo`
      : 'además, Dirección debe mantener compras, ventas e inventario alineados para no generar presión de flujo';
    const qualityReading = dataIssues.length
      ? `también hay datos que corregir (${dataIssues.join(', ')}), porque afectan la calidad del análisis gerencial`
      : 'los datos principales no muestran alertas fuertes de calidad en este corte';

    return `El análisis del módulo de ${unitConfig[unit].label} para ${branchName} muestra que tenemos ventas por ${formatCurrency(current.salesTotal)}, compras por ${formatCurrency(current.purchasesTotal)} y ${data?.overdueTotal ? `cartera vencida de ${formatCurrency(data.overdueTotal)}` : 'cartera vencida controlada'}; por lo tanto tenemos que mejorar en flujo, recuperación comercial, disponibilidad de inventario y disciplina operativa. ${commercialReading}; ${financialReading}; ${purchasingReading}; ${productionReading}; ${directionReading}; ${qualityReading}. Por consiguiente, ¿con qué quieres que empecemos?`;
  })();

  const managerCards: ManagerCard[] = [
    {
      title: 'Gerente General',
      icon: ClipboardList,
      status: actionRecommendations.length > 0 ? `${actionRecommendations.length} prioridades` : 'Sin focos rojos',
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      summary: generalExecutiveSummary,
      actions: [],
      agent: {
        id: 'general',
        name: 'Gerente General',
        subtitle: 'Director general digital',
        tone: 'Integra todas las áreas, prioriza por impacto económico y pide decisiones concretas.',
        focus: ['prioridades del día', 'impacto económico', 'riesgos cruzados', 'coordinación entre gerentes'],
      },
    },
    {
      title: 'Gerente Comercial',
      icon: Users,
      status: data?.customerDrops?.length ? `${data.customerDrops.length} clientes en caída` : `${current.topCustomers.length} clientes activos`,
      tone: 'border-blue-200 bg-blue-50 text-blue-700',
      summary: data?.customerDrops?.[0]
        ? `Recuperar a ${data.customerDrops[0].name}; cayó ${formatAbsPct(data.customerDrops[0].changePct)}.`
        : current.topCustomers[0]
          ? `Cliente principal: ${current.topCustomers[0].name} con ${formatCurrency(current.topCustomers[0].total)}.`
          : 'Sin clientes para analizar en el periodo.',
      actions: [
        ...(data?.customerDrops ?? []).slice(0, 3).map((customer) => `Llamar a ${customer.name}`),
        ...(current.topCustomers[0] ? [`Cuidar relación con ${current.topCustomers[0].name}`] : []),
      ].slice(0, 3),
      agent: {
        id: 'comercial',
        name: 'Gerente Comercial',
        subtitle: 'Ventas, clientes y oportunidades',
        tone: 'Directo, orientado a recuperar clientes, aumentar ventas y convertir oportunidades en llamadas o visitas.',
        focus: ['ventas', 'clientes', 'seguimiento comercial', 'retención', 'oportunidades'],
      },
    },
    {
      title: 'Gerente Financiero',
      icon: DollarSign,
      status: data?.overdueTotal ? formatCurrency(data.overdueTotal) : 'Cartera controlada',
      tone: 'border-red-200 bg-red-50 text-red-700',
      summary: data?.topDebtCustomer
        ? `Priorizar cobro a ${data.topDebtCustomer.name} por ${formatCurrency(data.topDebtCustomer.balance)}.`
        : current.creditSalesTotal > 0
          ? `Ventas a crédito del periodo: ${formatCurrency(current.creditSalesTotal)}.`
          : 'No hay cartera vencida detectada.',
      actions: [
        ...(data?.topDebtCustomer ? [`Cobrar a ${data.topDebtCustomer.name}`] : []),
        ...(current.creditSalesTotal > 0 ? ['Revisar ventas a crédito del periodo'] : []),
        ...(current.purchasesTotal > current.salesTotal ? ['Validar presión de flujo por compras'] : []),
      ].slice(0, 3),
      agent: {
        id: 'financiero',
        name: 'Gerente Financiero',
        subtitle: 'Flujo, cobranza y riesgo',
        tone: 'Conservador, numérico y enfocado en proteger caja, cobrar primero lo vencido y evitar presión de flujo.',
        focus: ['flujo', 'cartera vencida', 'crédito', 'cobranza', 'riesgo financiero'],
      },
    },
    {
      title: 'Gerente de Compras',
      icon: PackageSearch,
      status: data?.stockCritical?.length ? `${data.stockCritical.length} críticos` : 'Sin críticos',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      summary: data?.stockCritical?.[0]
        ? `Revisar ${data.stockCritical[0].name}: ${formatNumber(data.stockCritical[0].stock)} contra mínimo ${formatNumber(data.stockCritical[0].min)}.`
        : current.topProducts[0]
          ? `Producto líder: ${current.topProducts[0].name}.`
          : 'Sin ventas suficientes para sugerir compra.',
      actions: [
        ...(data?.stockCritical ?? []).slice(0, 3).map((product) => `Reabasto/traspaso de ${product.name}`),
        ...(current.purchasesTotal > current.salesTotal ? ['Auditar compras mayores a ventas'] : []),
      ].slice(0, 3),
      agent: {
        id: 'compras',
        name: 'Gerente de Compras',
        subtitle: 'Inventario, consumo y proveedores',
        tone: 'Práctico, evita compras impulsivas y prioriza reabasto por rotación, mínimos y urgencia real.',
        focus: ['inventario', 'stock crítico', 'proveedores', 'reabasto', 'rotación'],
      },
    },
    {
      title: 'Gerente de Producción',
      icon: CalendarDays,
      status: 'Datos por ampliar',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      summary: unit === 'materiales'
        ? 'Puede usar producción registrada, pero aún falta medir tiempos muertos y desperdicio.'
        : unit === 'concretera'
          ? 'Para concretera falta registrar tiempos, retrasos, desperdicio y eficiencia de planta.'
          : 'Para transportería falta registrar rutas, tiempos de entrega, rendimiento y rechazos operativos.',
      actions: [
        'Definir métricas de producción diaria',
        'Registrar tiempos muertos y causas',
        'Separar desperdicio, devolución y merma',
      ],
      agent: {
        id: 'produccion',
        name: 'Gerente de Producción',
        subtitle: 'Operación, eficiencia y capacidad',
        tone: 'Operativo, busca causas medibles, tiempos muertos, desperdicio, capacidad y acciones de mejora diaria.',
        focus: ['producción', 'tiempos muertos', 'desperdicio', 'eficiencia', 'capacidad operativa'],
      },
    },
  ];
  const [generalManager, ...specializedManagers] = managerCards;

  const analyzeWithAI = (source: { title: string; description: string; priority?: ActionPriority; area?: string; agent: DashboardAssistantAgent }) => {
    const prompt = [
      '[DASHBOARD_GERENCIAL]',
      `Agente: ${source.agent.name}.`,
      `Rol: ${source.agent.subtitle}.`,
      `Analiza esta señal del Reporte Gerencial de ${unitConfig[unit].label} desde tu especialidad.`,
      `Sucursal: ${branchName}.`,
      `Periodo: ${startDate} a ${endDate}.`,
      `Título: ${source.title}.`,
      `Descripción: ${source.description}.`,
      source.priority ? `Prioridad: ${source.priority}.` : '',
      source.area ? `Área: ${source.area}.` : '',
      'No consultes SQL ni muestres datos técnicos. Esta señal ya fue calculada por el reporte gerencial.',
      `Respóndeme como ${source.agent.name}, con tu personalidad: ${source.agent.tone}`,
    ].filter(Boolean).join('\n');
    window.dispatchEvent(new CustomEvent('lopar:open-assistant', { detail: { prompt, agent: source.agent } }));
  };

  const renderManagerCard = (manager: ManagerCard, extraClass = '') => {
    const Icon = manager.icon;
    const isGeneral = manager.title === 'Gerente General';
    return (
      <div key={manager.title} className={`flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4 ${extraClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`rounded-xl border p-2 ${manager.tone}`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{manager.title}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{manager.status}</p>
              </div>
            </div>
            <p className={`mt-3 font-semibold text-slate-600 ${
              isGeneral ? 'text-base leading-8' : 'text-xs leading-5'
            }`}>
              {manager.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={() => analyzeWithAI({
              title: manager.title,
              description: `${manager.summary} Acciones sugeridas: ${manager.actions.join('; ') || 'sin acciones críticas'}`,
              area: manager.title,
              priority: manager.title === 'Gerente General' ? 'alta' : 'media',
              agent: manager.agent,
            })}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300"
          >
            <Bot size={12} /> IA
          </button>
        </div>

        {!isGeneral && manager.context?.length ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Lectura por área</p>
            <div className="mt-3 space-y-2">
              {manager.context.map((item) => (
                <p key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-700">
                  {item}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {manager.actions.length > 0 && (
        <div className={`mt-3 space-y-1.5 ${isGeneral ? 'mt-auto pt-4' : ''}`}>
          {isGeneral && manager.actions.length > 0 && (
            <p className="pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Prioridades directivas</p>
          )}
          {manager.actions.slice(0, isGeneral ? 5 : 3).map((action) => (
            <p key={action} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700">
              {action}
            </p>
          ))}
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 lg:gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 xl:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-500">Reporte Gerencial</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Resumen ejecutivo del negocio</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {branchName}. Comparativo del periodo seleccionado contra {previousPeriodLabel}.
              </p>
            </div>
            <button
              onClick={() => void loadDashboard()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-3 ${fixedUnit ? 'lg:grid-cols-[1fr_1fr_1fr]' : 'lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_1fr_1fr]'}`}>
            {!fixedUnit && (
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Unidad</span>
                <div className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {(['materiales', 'concretera', 'transporteria'] as ExecutiveUnit[]).map((value) => (
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
            )}
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

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/15 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-300">Director General Digital</p>
                <h3 className="mt-3 text-2xl font-black tracking-tight">Buenos días.</h3>
                <p className="mt-2 text-sm font-semibold text-slate-300">
                  Detecté estas situaciones importantes para {unitConfig[unit].label.toLowerCase()}.
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-orange-300">
                <Bot size={20} />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {morningHighlights.map((item, index) => (
                <div key={`${item}-${index}`} className="flex gap-3 rounded-2xl bg-white/8 px-4 py-3 ring-1 ring-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-6 text-slate-100">{item}</p>
                </div>
              ))}
              {morningHighlights.length === 0 && (
                <div className="rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10">
                  No hay situaciones críticas con los filtros actuales.
                </div>
              )}
            </div>
          </article>

          {generalManager && renderManagerCard(generalManager, 'h-full bg-white p-5 shadow-sm md:p-6')}
        </section>

        <section>
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Gerentes especializados</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Cada gerente observa una parte del negocio y propone acciones.</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{specializedManagers.length} gerentes</div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {specializedManagers.map((manager) => renderManagerCard(manager, 'h-full'))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
};

export default ExecutiveDashboardScreen;
