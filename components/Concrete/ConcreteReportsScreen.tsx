import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Download, Filter, ShoppingCart, TrendingUp, Truck } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { catalogService } from '../../services/concretera/catalog.service';
import { formatCurrency, formatNumber } from '../../services/currency';
import { Branch } from '../../types';
import ManagerInsightsPanel, { ManagerInsight } from '../common/ManagerInsightsPanel';

interface ReportsScreenProps {
  selectedBranchId: string;
  branches: Branch[];
}

interface CategoryRow {
  id: number;
  name: string;
}

interface ProductRow {
  id: string | number;
  name: string;
  sku?: string | null;
  category_id?: number | null;
  base_uom_id?: number | null;
  branch_id?: number | null;
  stock?: number | null;
  min_stock?: number | null;
  wholesale_price?: number | null;
  retail_price?: number | null;
  purchase_price?: number | null;
}

interface StockRow {
  product_id: string;
  qty_base: number;
}


interface TransactionRow {
  id: number;
  type: 'PURCHASE' | 'SALE' | 'ADJUST' | 'TRANSFER';
  created_at: string;
  purchase_date?: string | null;
  reference?: string | null;
  notes?: string | null;
  nombre_cliente?: string | null;
  is_credit?: boolean | null;
  concrete_suppliers?: { name?: string | null } | null;
}

interface ItemRow {
  transaction_id: number;
  product_id: number;
  qty: number;
  unit_price: number | null;
  line_total?: number | null;
}

interface CreditNoteRow {
  folio?: string | null;
  due_date?: string | null;
  balance?: number | null;
  total?: number | null;
  concrete_credit_customers?: { name?: string | null } | null;
}

const formatQty = (value: number) =>
  formatNumber(value || 0, undefined, { maximumFractionDigits: 2 });

const lineAmount = (item: ItemRow) =>
  Number(item.line_total ?? (Number(item.qty || 0) * Number(item.unit_price || 0)));

const normalizeISO = (value: string) => (value.endsWith('Z') ? value : `${value}Z`);

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

const toDateKey = (value: Date, granularity: 'day' | 'week' | 'month') => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  if (granularity === 'day') return `${year}-${month}-${day}`;
  if (granularity === 'month') return `${year}-${month}`;
  const firstDay = new Date(value);
  const diff = (value.getDay() + 6) % 7; // monday start
  firstDay.setDate(value.getDate() - diff);
  const weekYear = firstDay.getFullYear();
  const weekMonth = String(firstDay.getMonth() + 1).padStart(2, '0');
  const weekDay = String(firstDay.getDate()).padStart(2, '0');
  return `${weekYear}-${weekMonth}-${weekDay}`;
};

const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escape = (value: string | number) => {
    const raw = String(value ?? '');
    if (raw.includes(',') || raw.includes('\n') || raw.includes('"')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const cardBaseClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const ReportsScreen: React.FC<ReportsScreenProps> = ({ selectedBranchId, branches }) => {
  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);
  const [datePreset, setDatePreset] = useState<'today' | '7d' | '30d' | 'month' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [uomsById, setUomsById] = useState<Record<string, { code?: string | null; name?: string | null }>>({});
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState({
    salesTotal: 0,
    salesCount: 0,
    avgTicket: 0,
    purchasesTotal: 0,
    stockCritical: 0,
    topProduct: null as { name: string; qty: number; total: number } | null,
  });

  const [salesSeries, setSalesSeries] = useState<Array<{ date: string; total: number }>>([]);
  const [purchaseSeries, setPurchaseSeries] = useState<Array<{ date: string; total: number }>>([]);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; qty: number; total: number }>>([]);
  const [lowProducts, setLowProducts] = useState<Array<{ name: string; qty: number; total: number }>>([]);
  const [stockTable, setStockTable] = useState<Array<{ name: string; stock: number; min: number; status: string }>>([]);
  const [salesTable, setSalesTable] = useState<Array<{ id: number; date: string; customer: string; items: number; total: number }>>([]);
  const [purchasesTable, setPurchasesTable] = useState<Array<{ id: number; date: string; supplier: string; items: number; total: number; credit: boolean }>>([]);
  const [managerInsights, setManagerInsights] = useState<ManagerInsight[]>([]);
  const [stockVisibleCount, setStockVisibleCount] = useState(4);
  const [salesVisibleCount, setSalesVisibleCount] = useState(4);
  const [purchasesVisibleCount, setPurchasesVisibleCount] = useState(4);

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

  const loadReference = useCallback(async () => {
    if (!branchId) return;
    try {
      const [categoryRes, productRes, uomRes, stockRes] = await Promise.all([
        supabase.from('concrete_categories').select('id, name').order('name'),
        catalogService.listProductsByBranch(branchId),
        supabase.from('concrete_uoms').select('id, code, name'),
        catalogService.listStockByBranch(branchId),
      ]);

      if (categoryRes.error) throw categoryRes.error;
      if (productRes.error) throw productRes.error;
      if (uomRes.error) throw uomRes.error;
      if (stockRes.error) throw stockRes.error;

      setCategories(categoryRes.data ?? []);
      setProducts(productRes as any);
      const uomMap = (uomRes.data ?? []).reduce<Record<string, { code?: string | null; name?: string | null }>>((acc, row: any) => {
        acc[String(row.id)] = { code: row.code, name: row.name };
        return acc;
      }, {});
      setUomsById(uomMap);
      const stockMap = (stockRes ?? []).reduce<Record<string, number>>((acc: Record<string, number>, row: StockRow) => {
        acc[String(row.product_id)] = Number(row.qty_base ?? 0);
        return acc;
      }, {});
      setStockByProduct(stockMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar referencias.';
      setError(message);
    }
  }, [branchId]);

  useEffect(() => {
    loadReference();
  }, [loadReference]);

  const loadReport = useCallback(async () => {
    if (!branchId || !startDate || !endDate) return;
    setIsLoading(true);
    setError(null);

    try {
      const rangeStart = parseLocalDateInput(startDate);
      const rangeEnd = parseLocalDateInput(endDate, true);

      const txQuery = supabase
        .from('concrete_inventory_transactions')
        .select('id, type, created_at, purchase_date, reference, notes, nombre_cliente, is_credit, concrete_suppliers ( name )')
        .eq('branch_id', branchId)
        .eq('is_deleted', false)
        .gte('created_at', rangeStart.toISOString())
        .lte('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: false });

      const creditQuery = supabase
        .from('concrete_credit_notes')
        .select('folio, due_date, balance, total, concrete_credit_customers ( name )')
        .eq('branch_id', branchId)
        .gt('balance', 0)
        .order('due_date', { ascending: true });

      const [
        { data: transactions, error: txError },
        { data: creditNotes, error: creditError },
      ] = await Promise.all([txQuery, creditQuery]);

      if (txError) throw txError;
      if (creditError) throw creditError;

      const txList: TransactionRow[] = (transactions ?? []) as TransactionRow[];
      const creditRows = (creditNotes ?? []) as CreditNoteRow[];
      const txIds = txList.map((tx) => tx.id);

      let items: ItemRow[] = [];
      if (txIds.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from('concrete_inventory_transaction_items')
          .select('transaction_id, product_id, qty, unit_price, line_total')
          .in('transaction_id', txIds);
        if (itemsError) throw itemsError;
        items = (itemsData ?? []) as ItemRow[];
      }

      const productMap = products.reduce<Record<string, ProductRow>>((acc, product) => {
        acc[String(product.id)] = product;
        return acc;
      }, {});


      const matchesFilters = (productIdValue?: number | string) => {
        if (productId && String(productIdValue) !== productId) return false;
        if (categoryId) {
          const prod = productIdValue ? productMap[String(productIdValue)] : null;
          if (!prod?.category_id || String(prod.category_id) !== categoryId) return false;
        }
        return true;
      };

      const itemsByTx = items.reduce<Record<number, ItemRow[]>>((acc, item) => {
        if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
        acc[item.transaction_id].push(item);
        return acc;
      }, {} as Record<number, ItemRow[]>);

      const txTotals = txList.reduce<Record<number, number>>((acc, tx) => {
        const txItems = (itemsByTx[tx.id] ?? []).filter((item) => matchesFilters(item.product_id));
        acc[tx.id] = txItems.reduce((sum, item) => sum + lineAmount(item), 0);
        return acc;
      }, {} as Record<number, number>);

      const txItemsCount = txList.reduce<Record<number, number>>((acc, tx) => {
        const txItems = (itemsByTx[tx.id] ?? []).filter((item) => matchesFilters(item.product_id));
        acc[tx.id] = txItems.length;
        return acc;
      }, {} as Record<number, number>);

      const salesTx = txList.filter((tx) => tx.type === 'SALE').filter((tx) => (txTotals[tx.id] ?? 0) > 0);
      const purchaseTx = txList.filter((tx) => tx.type === 'PURCHASE').filter((tx) => (txTotals[tx.id] ?? 0) > 0);

      const salesTotal = salesTx.reduce((sum, tx) => sum + (txTotals[tx.id] ?? 0), 0);
      const purchasesTotal = purchaseTx.reduce((sum, tx) => sum + (txTotals[tx.id] ?? 0), 0);
      const salesCount = salesTx.length;
      const avgTicket = salesCount > 0 ? salesTotal / salesCount : 0;

      const soldByProduct = items.reduce<Record<string, { qty: number; total: number }>>((acc, item) => {
        if (!matchesFilters(item.product_id)) return acc;
        const tx = txList.find((t) => t.id === item.transaction_id);
        if (!tx || tx.type !== 'SALE') return acc;
        const key = String(item.product_id);
        const current = acc[key] ?? { qty: 0, total: 0 };
        current.qty += Number(item.qty);
        current.total += lineAmount(item);
        acc[key] = current;
        return acc;
      }, {} as Record<string, { qty: number; total: number }>);

      const soldItems = Object.entries(soldByProduct)
        .map(([id, data]) => ({
          id,
          name: productMap[id]?.name ?? `Producto ${id}`,
          qty: data.qty,
          total: data.total,
        }))
        .filter((item) => item.qty > 0);

      const topList = [...soldItems]
        .sort((a, b) => b.total - a.total || b.qty - a.qty)
        .slice(0, 5);
      const lowCandidates = [...soldItems].sort((a, b) => a.qty - b.qty || a.total - b.total);
      const distinctLowList = lowCandidates.reduce<Array<(typeof lowCandidates)[number]>>((acc, item) => {
          if (acc.length >= 5) return acc;
          if (acc.some((current) => current.qty === item.qty)) return acc;
          acc.push(item);
          return acc;
        }, []);
      const lowList = distinctLowList
        .concat(lowCandidates.filter((item) => !distinctLowList.includes(item)))
        .slice(0, 5);

      const rangeDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
      const granularity: 'day' | 'week' | 'month' = rangeDays <= 14 ? 'day' : rangeDays <= 90 ? 'week' : 'month';

      const buildSeries = (txs: TransactionRow[]) => {
        const seriesMap = new Map<string, number>();
        txs.forEach((tx) => {
          const dateValue = tx.type === 'PURCHASE' && tx.purchase_date
            ? parseLocalDateInput(tx.purchase_date)
            : new Date(normalizeISO(tx.created_at));
          const key = toDateKey(dateValue, granularity);
          const nextTotal = (seriesMap.get(key) ?? 0) + (txTotals[tx.id] ?? 0);
          seriesMap.set(key, nextTotal);
        });
        return Array.from(seriesMap.entries())
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => a.date.localeCompare(b.date));
      };

      const salesSeriesData = buildSeries(salesTx);
      const purchaseSeriesData = buildSeries(purchaseTx);

      const stockCandidates = products
        .filter((product) => matchesFilters(product.id))
        .map((product) => {
          const stockValue = Number(product.stock ?? stockByProduct[String(product.id)] ?? 0);
          const minValue = Number(product.min_stock ?? 0);
          let status = 'ok';
          if (minValue > 0 && stockValue <= minValue) status = 'critical';
          if (minValue > 0 && stockValue > minValue && stockValue <= minValue + Math.max(1, minValue * 0.1)) status = 'warning';
          const uom = product.base_uom_id ? uomsById[String(product.base_uom_id)] : null;
          const unitLabel = uom?.code ?? uom?.name ?? 'UND';
          return {
            name: product.name,
            stock: stockValue,
            min: minValue,
            status,
            unitLabel,
          };
        });
      const criticalStockRows = stockCandidates
        .filter((row) => row.status === 'critical')
        .sort((a, b) => {
          const aGap = a.min - a.stock;
          const bGap = b.min - b.stock;
          return bGap - aGap;
        });

      const stockCandidatesByName = stockCandidates.reduce<Record<string, (typeof stockCandidates)[number]>>((acc, row) => {
        acc[row.name] = row;
        return acc;
      }, {});
      const soldStockRows = topList
        .map((item) => stockCandidatesByName[item.name])
        .filter((row): row is (typeof stockCandidates)[number] => Boolean(row))
        .filter((row) => row.stock > 0 || row.min > 0);
      const filterComparableRows = (rows: (typeof stockCandidates)[number][]) =>
        rows.filter((row) => {
          if (row.stock <= 0 || row.min <= 0) return false;
          const higher = Math.max(row.stock, row.min);
          const lower = Math.min(row.stock, row.min);
          return higher / Math.max(lower, 1) <= 4;
        });
      const pickSimilarScaleRows = (rows: (typeof stockCandidates)[number][]) => {
        if (rows.length <= 1) return rows;
        const sorted = [...rows].sort((a, b) => Math.max(a.stock, a.min) - Math.max(b.stock, b.min));
        const targetSize = Math.min(10, sorted.length);
        let bestWindow = sorted.slice(0, targetSize);
        let bestRatio = Infinity;

        for (let index = 0; index <= sorted.length - targetSize; index += 1) {
          const window = sorted.slice(index, index + targetSize);
          const low = Math.max(1, Math.max(window[0].stock, window[0].min));
          const high = Math.max(window[window.length - 1].stock, window[window.length - 1].min);
          const ratio = high / low;
          if (ratio < bestRatio) {
            bestRatio = ratio;
            bestWindow = window;
          }
        }

        return bestWindow;
      };
      const sortBySimilarity = (rows: (typeof stockCandidates)[number][]) =>
        [...rows].sort((a, b) => {
          const aHasMin = a.min > 0 ? 0 : 1;
          const bHasMin = b.min > 0 ? 0 : 1;
          if (aHasMin !== bHasMin) return aHasMin - bHasMin;
          const aSimilarity = Math.abs(a.stock - a.min) / Math.max(a.stock, a.min, 1);
          const bSimilarity = Math.abs(b.stock - b.min) / Math.max(b.stock, b.min, 1);
          if (aSimilarity !== bSimilarity) return aSimilarity - bSimilarity;
          return Math.abs(a.stock - a.min) - Math.abs(b.stock - b.min);
        });
      const comparableSoldRows = sortBySimilarity(filterComparableRows(soldStockRows));
      const comparableFallbackRows = sortBySimilarity(filterComparableRows(stockCandidates));
      const fallbackStockRows = sortBySimilarity(stockCandidates.filter((row) => row.stock > 0 || row.min > 0));
      const stockRows = pickSimilarScaleRows(comparableSoldRows.length > 0
        ? comparableSoldRows
        : comparableFallbackRows.length > 0
        ? comparableFallbackRows
        : sortBySimilarity(soldStockRows.length > 0 ? soldStockRows : fallbackStockRows))
        .slice(0, 10);

      const criticalCount = criticalStockRows.length;

      const salesTableRows = salesTx.map((tx) => ({
        id: tx.id,
        date: new Date(normalizeISO(tx.created_at)).toLocaleString(),
        customer: tx.nombre_cliente ?? 'Mostrador',
        items: txItemsCount[tx.id] ?? 0,
        total: txTotals[tx.id] ?? 0,
      }));

      const purchasesTableRows = purchaseTx.map((tx) => ({
        id: tx.id,
        date: tx.purchase_date
          ? parseLocalDateInput(tx.purchase_date).toLocaleDateString()
          : new Date(normalizeISO(tx.created_at)).toLocaleDateString(),
        supplier: tx.concrete_suppliers?.name ?? '—',
        items: txItemsCount[tx.id] ?? 0,
        total: txTotals[tx.id] ?? 0,
        credit: Boolean(tx.is_credit),
      }));

      const today = toLocalDateInputValue(new Date());
      const overdueRows = creditRows.filter((row) => Number(row.balance ?? 0) > 0 && row.due_date && row.due_date < today);
      const overdueTotal = overdueRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
      const topDebt = [...overdueRows].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))[0];
      const topCriticalProduct = topList.find((item) => stockCandidatesByName[item.name]?.status === 'critical');
      const topProductShare = salesTotal > 0 && topList[0] ? topList[0].total / salesTotal : 0;
      const lowRotationWithStock = lowList
        .map((item) => ({ ...item, stock: stockCandidatesByName[item.name]?.stock ?? 0 }))
        .filter((item) => item.stock > 0)
        .sort((a, b) => b.stock - a.stock)[0];
      const generatedInsights: ManagerInsight[] = [];

      if (overdueTotal > 0) {
        generatedInsights.push({
          id: 'cartera-vencida-concreto',
          priority: overdueTotal >= salesTotal * 0.25 || overdueRows.length >= 5 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Cartera vencida de concretera',
          metric: formatCurrency(overdueTotal),
          description: `${overdueRows.length} nota${overdueRows.length === 1 ? '' : 's'} vencida${overdueRows.length === 1 ? '' : 's'} con saldo pendiente.`,
          action: topDebt
            ? `Priorizar cobranza a ${topDebt.concrete_credit_customers?.name ?? 'cliente sin nombre'} por ${formatCurrency(Number(topDebt.balance ?? 0))}.`
            : 'Revisar saldos antes de autorizar nuevos pedidos a crédito.',
        });
      }

      if (topCriticalProduct) {
        const stock = stockCandidatesByName[topCriticalProduct.name];
        generatedInsights.push({
          id: 'mezcla-insumo-stock',
          priority: 'alta',
          kind: 'risk',
          title: 'Producto clave con stock crítico',
          metric: topCriticalProduct.name,
          description: `Movió ${formatQty(topCriticalProduct.qty)} en el periodo y está en ${formatQty(stock.stock)} contra mínimo ${formatQty(stock.min)}.`,
          action: 'Validar disponibilidad antes de comprometer nuevas entregas u obras.',
        });
      } else if (criticalStockRows.length > 0) {
        generatedInsights.push({
          id: 'stock-critico-concreto',
          priority: 'media',
          kind: 'risk',
          title: 'Inventario crítico en concretera',
          metric: `${criticalStockRows.length} productos`,
          description: `${criticalStockRows[0].name} es el caso más presionado: ${formatQty(criticalStockRows[0].stock)} contra mínimo ${formatQty(criticalStockRows[0].min)}.`,
          action: 'Cruzar inventario con pedidos recientes para evitar retrasos por falta de insumo.',
        });
      }

      if (topProductShare >= 0.35 && topList[0]) {
        generatedInsights.push({
          id: 'concentracion-concreto',
          priority: 'media',
          kind: 'opportunity',
          title: 'Concentración en producto principal',
          metric: `${Math.round(topProductShare * 100)}%`,
          description: `${topList[0].name} concentra una parte relevante de la venta del periodo.`,
          action: 'Revisar margen, precio y capacidad de entrega de este producto antes de impulsar más volumen.',
        });
      }

      if (purchasesTotal > salesTotal * 1.25 && purchasesTotal > 0) {
        generatedInsights.push({
          id: 'compras-vs-ventas-concreto',
          priority: salesTotal === 0 ? 'alta' : 'media',
          kind: 'risk',
          title: 'Compras superiores a ventas',
          metric: formatCurrency(purchasesTotal - salesTotal),
          description: 'Las compras superan la venta del periodo. Puede afectar flujo si no corresponde a pedidos próximos.',
          action: 'Validar que el abastecimiento esté ligado a producción programada o compromisos de obra.',
        });
      }

      if (lowRotationWithStock) {
        generatedInsights.push({
          id: 'baja-rotacion-concreto',
          priority: 'baja',
          kind: 'opportunity',
          title: 'Producto con baja rotación',
          metric: lowRotationWithStock.name,
          description: `Movió ${formatQty(lowRotationWithStock.qty)} y conserva ${formatQty(lowRotationWithStock.stock)} en stock.`,
          action: 'Revisar si conviene promoverlo, ajustar compra o sustituirlo en pedidos nuevos.',
        });
      }

      setKpis({
        salesTotal,
        salesCount,
        avgTicket,
        purchasesTotal,
        stockCritical: criticalCount,
        topProduct: topList[0] ? { name: topList[0].name, qty: topList[0].qty, total: topList[0].total } : null,
      });

      setSalesSeries(salesSeriesData);
      setPurchaseSeries(purchaseSeriesData);
      setTopProducts(topList);
      setLowProducts(lowList);
      setStockTable(stockRows);
      setSalesTable(salesTableRows.slice(0, 8));
      setPurchasesTable(purchasesTableRows.slice(0, 8));
      setManagerInsights(generatedInsights.slice(0, 6));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar reportes.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, startDate, endDate, categoryId, productId, categories, products, uomsById, stockByProduct]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const productOptions = useMemo(() => {
    if (!categoryId) return products;
    return products.filter((product) => String(product.category_id ?? '') === categoryId);
  }, [products, categoryId]);
  const visibleStockRows = useMemo(() => stockTable.slice(0, stockVisibleCount), [stockTable, stockVisibleCount]);
  const canShowMoreStock = stockVisibleCount < stockTable.length;
  const visibleSalesRows = useMemo(() => salesTable.slice(0, salesVisibleCount), [salesTable, salesVisibleCount]);
  const visiblePurchasesRows = useMemo(() => purchasesTable.slice(0, purchasesVisibleCount), [purchasesTable, purchasesVisibleCount]);
  const canShowMoreSales = salesVisibleCount < salesTable.length;
  const canShowMorePurchases = purchasesVisibleCount < purchasesTable.length;

  useEffect(() => {
    setStockVisibleCount(4);
  }, [stockTable]);

  useEffect(() => {
    setSalesVisibleCount(4);
  }, [salesTable]);

  useEffect(() => {
    setPurchasesVisibleCount(4);
  }, [purchasesTable]);

  const downloadSalesCsv = () => {
    downloadCsv(
      `ventas-${startDate}-${endDate}.csv`,
      ['ID', 'Fecha', 'Cliente', 'Items', 'Total'],
      salesTable.map((row) => [row.id, row.date, row.customer, row.items, row.total])
    );
  };

  const downloadPurchasesCsv = () => {
    downloadCsv(
      `compras-${startDate}-${endDate}.csv`,
      ['ID', 'Fecha', 'Proveedor', 'Items', 'Total', 'Crédito'],
      purchasesTable.map((row) => [row.id, row.date, row.supplier, row.items, row.total, row.credit ? 'Sí' : 'No'])
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 lg:gap-6">
        <section className={`${cardBaseClass} p-4 md:p-5 xl:p-6`}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'today', label: 'Hoy' },
                { id: '7d', label: '7 días' },
                { id: '30d', label: '30 días' },
                { id: 'month', label: 'Mes actual' },
                { id: 'custom', label: 'Personalizado' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setDatePreset(preset.id as typeof datePreset)}
                  className={`rounded-2xl border px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                    datePreset === preset.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Desde</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Categoría</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="">Todas</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Producto</span>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="">Todos</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={String(product.id)}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={downloadSalesCsv}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Download size={14} /> Exportar ventas CSV
              </button>
              <button
                onClick={downloadPurchasesCsv}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Download size={14} /> Exportar compras CSV
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
        )}

        <ManagerInsightsPanel
          insights={managerInsights}
          isLoading={isLoading}
          subtitle="Concretera: señales gerenciales sobre ventas, compras, inventario y cartera."
        />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {[
            {
              label: 'Ventas totales',
              value: formatCurrency(kpis.salesTotal),
              help: `${kpis.salesCount} ventas en el periodo`,
              icon: ShoppingCart,
              tone: 'from-orange-500 to-orange-600 text-white border-orange-500 shadow-orange-500/20',
              iconTone: 'bg-white/15 text-white',
            },
            {
              label: 'Compras totales',
              value: formatCurrency(kpis.purchasesTotal),
              help: `${purchasesTable.length} compras recientes visibles`,
              icon: Truck,
              tone: 'from-slate-900 to-slate-800 text-white border-slate-800 shadow-slate-900/20',
              iconTone: 'bg-white/10 text-white',
            },
            {
              label: 'Ticket promedio',
              value: formatCurrency(kpis.avgTicket),
              help: kpis.topProduct ? `Top actual: ${kpis.topProduct.name}` : 'Sin top producto',
              icon: TrendingUp,
              tone: 'from-emerald-50 to-white text-slate-900 border-emerald-100',
              iconTone: 'bg-emerald-100 text-emerald-700',
            },
            {
              label: 'Stock crítico',
              value: String(kpis.stockCritical),
              help: 'Productos igual o debajo del mínimo',
              icon: AlertTriangle,
              tone: 'from-red-50 to-white text-slate-900 border-red-100',
              iconTone: 'bg-red-100 text-red-700',
            },
          ].map((card) => {
            const Icon = card.icon;
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
                <p className="mt-5 text-xs font-semibold opacity-80">{card.help}</p>
              </article>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Ventas en el tiempo</h3>
                <p className="mt-1 text-xs text-slate-500">Evolución acumulada por periodo seleccionado.</p>
              </div>
              <div className="rounded-2xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-600">{salesSeries.length} puntos</div>
            </div>
            <div className="h-72 rounded-2xl bg-slate-50/80 p-0 md:h-80 md:p-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesSeries} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="total" stroke="#f97316" fill="url(#salesFill)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Compras en el tiempo</h3>
                <p className="mt-1 text-xs text-slate-500">Comportamiento de entradas y abastecimiento.</p>
              </div>
              <div className="rounded-2xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600">{purchaseSeries.length} puntos</div>
            </div>
            <div className="h-72 rounded-2xl bg-slate-50/80 p-0 md:h-80 md:p-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={purchaseSeries} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="total" stroke="#1d4ed8" fill="url(#purchaseFill)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Top productos</h3>
                <p className="mt-1 text-xs text-slate-500">Mayor facturación dentro del periodo filtrado.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-600">{topProducts.length} productos</div>
            </div>
            <div className="h-72 rounded-2xl bg-slate-50/80 p-0 md:h-80 md:p-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" width={78} fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Bar dataKey="total" fill="#10b981" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Menos vendidos</h3>
                <p className="mt-1 text-xs text-slate-500">Referencias con menor movimiento dentro del periodo.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-600">{lowProducts.length} productos</div>
            </div>
            <div className="h-72 rounded-2xl bg-slate-50/80 p-0 md:h-80 md:p-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lowProducts} layout="vertical" margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" width={78} fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => formatQty(Number(value))} labelFormatter={() => 'Cantidad vendida'} />
                  <Bar dataKey="qty" fill="#f97316" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className={`${cardBaseClass} p-4 md:p-5`}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Stock actual vs mínimo</h3>
              <p className="mt-1 text-xs text-slate-500">Señales rápidas para reordenar antes de quedarte sin inventario.</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{stockTable.length} productos monitoreados</div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
            <div className="h-80 rounded-2xl bg-slate-50/80 p-0 md:p-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleStockRows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={10} tick={false} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={70} />
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => {
                      const unit = props?.payload?.unitLabel ? ` ${props.payload.unitLabel}` : '';
                      const label = name === 'stock' || name === 'Stock' ? 'Stock' : 'Mínimo';
                      return [`${formatQty(Number(value))}${unit}`, label];
                    }}
                    labelFormatter={(label) => String(label)}
                  />
                  <Legend />
                  <Bar dataKey="stock" name="Stock" radius={[8, 8, 0, 0]}>
                    {visibleStockRows.map((row, index) => (
                      <Cell
                        key={`stock-cell-${row.name}-${index}`}
                        fill={row.status === 'critical' ? '#ef4444' : row.status === 'warning' ? '#f59e0b' : '#10b981'}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="min" name="Mínimo" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {visibleStockRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-700">{row.name}</p>
                    <p className="text-xs text-slate-400">Mínimo esperado: {formatQty(row.min)} {row.unitLabel}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                      row.status === 'critical'
                        ? 'bg-red-100 text-red-600'
                        : row.status === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {formatQty(row.stock)} {row.unitLabel}
                  </span>
                </div>
              ))}
              {canShowMoreStock && (
                <button
                  type="button"
                  onClick={() => setStockVisibleCount((prev) => prev + 4)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 hover:bg-white"
                >
                  Mostrar 4 más
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Ventas recientes</h3>
                <p className="mt-1 text-xs text-slate-500">Últimas operaciones visibles dentro del filtro aplicado.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-600">{salesTable.length} filas</div>
            </div>

            <div className="space-y-3 md:hidden">
              {visibleSalesRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{row.customer}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.date}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-1 text-[11px] font-black text-slate-600 shadow-sm">#{row.id}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="font-black uppercase tracking-widest text-slate-400">Items</p>
                      <p className="mt-1 font-bold text-slate-700">{row.items}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right">
                      <p className="font-black uppercase tracking-widest text-slate-400">Total</p>
                      <p className="mt-1 font-bold text-slate-700">{formatCurrency(row.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {salesTable.length === 0 && !isLoading && <p className="py-4 text-sm text-slate-400">Sin ventas en este periodo.</p>}
              {canShowMoreSales && (
                <button
                  type="button"
                  onClick={() => setSalesVisibleCount((prev) => prev + 4)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Mostrar 4 más
                </button>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="py-2 text-left">Fecha</th>
                    <th className="text-left">Cliente</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {visibleSalesRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="py-3 text-xs text-slate-500">{row.date}</td>
                      <td className="font-medium">{row.customer}</td>
                      <td className="text-right">{row.items}</td>
                      <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {salesTable.length === 0 && !isLoading && <p className="py-4 text-sm text-slate-400">Sin ventas en este periodo.</p>}
              {canShowMoreSales && (
                <button
                  type="button"
                  onClick={() => setSalesVisibleCount((prev) => prev + 4)}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Mostrar 4 más
                </button>
              )}
            </div>
          </article>

          <article className={`${cardBaseClass} p-4 md:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">Compras recientes</h3>
                <p className="mt-1 text-xs text-slate-500">Compras más recientes para entender abastecimiento y crédito.</p>
              </div>
              <div className="rounded-2xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-600">{purchasesTable.length} filas</div>
            </div>

            <div className="space-y-3 md:hidden">
              {visiblePurchasesRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{row.supplier}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.date}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-1 text-[11px] font-black text-slate-600 shadow-sm">#{row.id}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="font-black uppercase tracking-widest text-slate-400">Items</p>
                      <p className="mt-1 font-bold text-slate-700">{row.items}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right">
                      <p className="font-black uppercase tracking-widest text-slate-400">Total</p>
                      <p className="mt-1 font-bold text-slate-700">{formatCurrency(row.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {purchasesTable.length === 0 && !isLoading && <p className="py-4 text-sm text-slate-400">Sin compras en este periodo.</p>}
              {canShowMorePurchases && (
                <button
                  type="button"
                  onClick={() => setPurchasesVisibleCount((prev) => prev + 4)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Mostrar 4 más
                </button>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="py-2 text-left">Fecha</th>
                    <th className="text-left">Proveedor</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {visiblePurchasesRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="py-3 text-xs text-slate-500">{row.date}</td>
                      <td className="font-medium">{row.supplier}</td>
                      <td className="text-right">{row.items}</td>
                      <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {purchasesTable.length === 0 && !isLoading && <p className="py-4 text-sm text-slate-400">Sin compras en este periodo.</p>}
              {canShowMorePurchases && (
                <button
                  type="button"
                  onClick={() => setPurchasesVisibleCount((prev) => prev + 4)}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Mostrar 4 más
                </button>
              )}
            </div>
          </article>
        </section>

        {isLoading && <div className="text-sm text-slate-400">Cargando reportes…</div>}
      </div>
    </div>
  );
};

export default ReportsScreen;
