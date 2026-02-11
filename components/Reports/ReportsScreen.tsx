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
import { Download } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { catalogService } from '../../services/inventory/catalog.service';
import { Branch } from '../../types';

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
  suppliers?: { name?: string | null } | null;
}

interface ItemRow {
  transaction_id: number;
  product_id: number;
  qty: number;
  unit_price: number | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value || 0);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value || 0);

const normalizeISO = (value: string) => (value.endsWith('Z') ? value : `${value}Z`);

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

  useEffect(() => {
    const today = new Date();
    const toISO = (value: Date) => value.toISOString().slice(0, 10);

    if (datePreset === 'today') {
      setStartDate(toISO(today));
      setEndDate(toISO(today));
      return;
    }
    if (datePreset === '7d') {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      setStartDate(toISO(start));
      setEndDate(toISO(today));
      return;
    }
    if (datePreset === '30d') {
      const start = new Date();
      start.setDate(today.getDate() - 29);
      setStartDate(toISO(start));
      setEndDate(toISO(today));
      return;
    }
    if (datePreset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(toISO(start));
      setEndDate(toISO(end));
    }
  }, [datePreset]);

  const loadReference = useCallback(async () => {
    if (!branchId) return;
    try {
      const [categoryRes, productRes, uomRes, stockRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        catalogService.listProductsByBranch(branchId),
        supabase.from('uoms').select('id, code, name'),
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
      const rangeStart = new Date(`${startDate}T00:00:00Z`);
      const rangeEnd = new Date(`${endDate}T23:59:59Z`);

      const { data: transactions, error: txError } = await supabase
        .from('inventory_transactions')
        .select('id, type, created_at, purchase_date, reference, notes, nombre_cliente, is_credit, suppliers ( name )')
        .eq('branch_id', branchId)
        .gte('created_at', rangeStart.toISOString())
        .lte('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: false });

      if (txError) throw txError;

      const txList: TransactionRow[] = (transactions ?? []) as TransactionRow[];
      const txIds = txList.map((tx) => tx.id);

      let items: ItemRow[] = [];
      if (txIds.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from('inventory_transaction_items')
          .select('transaction_id, product_id, qty, unit_price')
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
        acc[tx.id] = txItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_price || 0), 0);
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
        current.total += Number(item.qty) * Number(item.unit_price || 0);
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
        .sort((a, b) => b.qty - a.qty);

      const topList = soldItems.slice(0, 5);
      const lowList = [...soldItems].reverse().filter((item) => item.qty > 0).slice(0, 5);

      const rangeDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
      const granularity: 'day' | 'week' | 'month' = rangeDays <= 14 ? 'day' : rangeDays <= 90 ? 'week' : 'month';

      const buildSeries = (txs: TransactionRow[]) => {
        const seriesMap = new Map<string, number>();
        txs.forEach((tx) => {
          const dateValue = tx.type === 'PURCHASE' && tx.purchase_date
            ? new Date(`${tx.purchase_date}T00:00:00Z`)
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

      const stockRows = products
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
        })
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 10);

      const criticalCount = stockRows.filter((row) => row.status === 'critical').length;

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
          ? new Date(`${tx.purchase_date}T00:00:00Z`).toLocaleDateString()
          : new Date(normalizeISO(tx.created_at)).toLocaleDateString(),
        supplier: tx.suppliers?.name ?? '—',
        items: txItemsCount[tx.id] ?? 0,
        total: txTotals[tx.id] ?? 0,
        credit: Boolean(tx.is_credit),
      }));

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
    <div className="h-full w-full overflow-y-auto px-4 md:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Reportería</h1>
          <p className="text-sm text-slate-500">Panel BI para ventas, compras y stock crítico.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadSalesCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} /> Exportar ventas CSV
          </button>
          <button
            onClick={downloadPurchasesCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} /> Exportar compras CSV
          </button>
        </div>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
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
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                  datePreset === preset.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Desde</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setStartDate(e.target.value);
                }}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Hasta</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setEndDate(e.target.value);
                }}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Categoría</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Todas</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[220px]">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Producto</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
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
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2 gap-4">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-3xl p-6 shadow-lg shadow-orange-500/20 border border-orange-500 xl:row-span-2">
          <p className="text-xs md:text-sm uppercase tracking-[0.25em] font-black text-orange-100">Ventas totales</p>
          <p className="text-4xl md:text-5xl font-black mt-4">{formatCurrency(kpis.salesTotal)}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-lg shadow-slate-900/20 border border-slate-800 xl:row-span-2">
          <p className="text-xs md:text-sm uppercase tracking-[0.25em] font-black text-slate-300">Compras totales</p>
          <p className="text-4xl md:text-5xl font-black mt-4">{formatCurrency(kpis.purchasesTotal)}</p>
        </div>
        {[
          { label: 'Número de ventas', value: kpis.salesCount },
          { label: 'Ticket promedio', value: formatCurrency(kpis.avgTicket) },
          { label: 'Stock crítico', value: kpis.stockCritical },
          { label: 'Top producto', value: kpis.topProduct ? `${kpis.topProduct.name} (${formatNumber(kpis.topProduct.qty)})` : '—' },
        ].map((card, idx) => (
          <div key={idx} className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{card.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Ventas en el tiempo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesSeries} margin={{ top: 16, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                <Area type="monotone" dataKey="total" stroke="#f97316" fill="url(#salesFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Compras en el tiempo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={purchaseSeries} margin={{ top: 16, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                <Area type="monotone" dataKey="total" stroke="#1d4ed8" fill="url(#purchaseFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Top productos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ top: 16, right: 20, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="name" type="category" width={100} fontSize={11} />
                <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                <Bar dataKey="total" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Menos vendidos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lowProducts} layout="vertical" margin={{ top: 16, right: 20, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="name" type="category" width={100} fontSize={11} />
                <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                <Bar dataKey="total" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Stock actual vs mínimo</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockTable} margin={{ top: 16, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={10} tick={false} />
                <YAxis fontSize={11} />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    const unit = props?.payload?.unitLabel ? ` ${props.payload.unitLabel}` : '';
                    const label = name === 'stock' || name === 'Stock' ? 'Stock' : 'Mínimo';
                    return [`${formatNumber(Number(value))}${unit}`, label];
                  }}
                  labelFormatter={(label) => String(label)}
                />
                <Legend />
                <Bar dataKey="stock" name="Stock" radius={[6, 6, 0, 0]}>
                  {stockTable.map((row, index) => (
                    <Cell
                      key={`stock-cell-${row.name}-${index}`}
                      fill={row.status === 'critical' ? '#ef4444' : row.status === 'warning' ? '#f59e0b' : '#10b981'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="min" name="Mínimo" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {stockTable.map((row) => (
              <div key={row.name} className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200">
                <div>
                  <p className="font-bold text-sm text-slate-700">{row.name}</p>
                  <p className="text-xs text-slate-400">Mín: {formatNumber(row.min)} {row.unitLabel}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                    row.status === 'critical'
                      ? 'bg-red-100 text-red-600'
                      : row.status === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {formatNumber(row.stock)} {row.unitLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Ventas recientes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {salesTable.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 text-xs text-slate-500">{row.date}</td>
                    <td className="font-medium">{row.customer}</td>
                    <td className="text-right">{row.items}</td>
                    <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {salesTable.length === 0 && !isLoading && (
              <p className="text-sm text-slate-400 py-4">Sin ventas en este periodo.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Compras recientes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left">Proveedor</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {purchasesTable.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 text-xs text-slate-500">{row.date}</td>
                    <td className="font-medium">{row.supplier}</td>
                    <td className="text-right">{row.items}</td>
                    <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {purchasesTable.length === 0 && !isLoading && (
              <p className="text-sm text-slate-400 py-4">Sin compras en este periodo.</p>
            )}
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="text-sm text-slate-400">Cargando reportes…</div>
      )}
    </div>
  );
};

export default ReportsScreen;
