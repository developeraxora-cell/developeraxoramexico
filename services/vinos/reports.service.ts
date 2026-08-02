import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface ReportsKPIs {
  total_sales: number;
  total_amount: number;
  avg_ticket: number;
  gross_profit: number;
  profit_margin: number;
  inventory_value: number;
  new_customers: number;
  top_customers: Array<{ customer_id: string; name: string; total: number; count: number }>;
  top_products: Array<{ product_id: string; name: string; sku: string; qty: number; total: number; profit: number }>;
  top_profit_products: Array<{ product_id: string; name: string; sku: string; qty: number; total: number; profit: number }>;
  loss_products: Array<{ product_id: string; name: string; sku: string; qty: number; total: number; profit: number }>;
  low_stock_products: Array<{ product_id: string; name: string; sku: string; stock: number; min_stock: number }>;
  sales_by_day: Array<{ day: string; amount: number; count: number }>;
  sales_by_weekday: Array<{ day: string; amount: number; count: number }>;
  sales_by_hour: Array<{ hour: number; amount: number; count: number }>;
  best_hours: Array<{ hour: number; amount: number; count: number }>;
  slow_hours: Array<{ hour: number; amount: number; count: number }>;
  sales_periods: {
    today: { sales: number; amount: number };
    week: { sales: number; amount: number };
    month: { sales: number; amount: number };
    year: { sales: number; amount: number };
  };
  profit_periods: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  payment_distribution: { EFECTIVO: number; TARJETA: number; TRANSFERENCIA: number; CREDITO: number; CORTESIA: number; SALDO: number };
  loyalty_distribution: { BRONCE: number; PLATA: number; ORO: number; BLACK: number };
  at_risk_customers: Array<{ id: string; name: string; status: string; last_purchase: string | null }>;
  birthdays_this_month: Array<{ id: string; name: string; birthday: string; phone: string | null }>;
}

export interface ReportsDateRange {
  startDate: string;
  endDate: string;
}

export interface ReportsItemAnalytics {
  gross_profit: number;
  profit_margin: number;
  top_products: ReportsKPIs['top_products'];
  top_profit_products: ReportsKPIs['top_profit_products'];
  loss_products: ReportsKPIs['loss_products'];
  profit_periods: ReportsKPIs['profit_periods'];
}

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

const toLocalDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfLocalWeek = (value: Date) => {
  const next = startOfLocalDay(value);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
};

const startOfLocalMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const startOfLocalYear = (value: Date) => new Date(value.getFullYear(), 0, 1);
const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const emptyPeriods = () => ({
  today: { sales: 0, amount: 0 },
  week: { sales: 0, amount: 0 },
  month: { sales: 0, amount: 0 },
  year: { sales: 0, amount: 0 },
});

const emptyProfitPeriods = () => ({ today: 0, week: 0, month: 0, year: 0 });
const SALE_ITEMS_BATCH_SIZE = 80;
const SALE_ITEMS_BATCH_CONCURRENCY = 4;

const resolveDateRange = (range: number | ReportsDateRange) => {
  if (typeof range === 'number') {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - Math.max(1, range) + 1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  return {
    start: parseLocalDateInput(range.startDate),
    end: parseLocalDateInput(range.endDate, true),
  };
};

interface ItemRow {
  sale_id: string;
  product_id: string;
  qty: number;
  qty_base: number;
  line_total: number;
  product?: { name: string; sku: string } | { name: string; sku: string }[] | null;
}

const fetchSaleItemsBySaleIds = async (saleIds: string[], includeProduct: boolean): Promise<ItemRow[]> => {
  const uniqueSaleIds = Array.from(new Set(saleIds.filter(Boolean)));
  const batches: string[][] = [];
  for (let index = 0; index < uniqueSaleIds.length; index += SALE_ITEMS_BATCH_SIZE) {
    batches.push(uniqueSaleIds.slice(index, index + SALE_ITEMS_BATCH_SIZE));
  }

  const fetchBatch = async (batch: string[]) => {
    const { data, error } = await supabaseVinos
      .from('sale_items')
      .select(includeProduct
        ? 'sale_id, product_id, qty, qty_base, line_total, product:products(name, sku)'
        : 'sale_id, product_id, qty, qty_base, line_total'
      )
      .in('sale_id', batch);
    if (error) throw error;
    return (data as ItemRow[]) ?? [];
  };

  const rows: ItemRow[] = [];
  for (let index = 0; index < batches.length; index += SALE_ITEMS_BATCH_CONCURRENCY) {
    const chunk = batches.slice(index, index + SALE_ITEMS_BATCH_CONCURRENCY);
    const results = await Promise.all(chunk.map(fetchBatch));
    results.forEach((batchRows) => rows.push(...batchRows));
  }
  return rows;
};

export const vinosReportsService = {
  async getKPIs(branchId: number | null, range: number | ReportsDateRange = 30, options?: { includeItemAnalytics?: boolean }): Promise<ReportsKPIs> {
    const empty: ReportsKPIs = {
      total_sales: 0, total_amount: 0, avg_ticket: 0, gross_profit: 0, profit_margin: 0, inventory_value: 0, new_customers: 0,
      top_customers: [], top_products: [], top_profit_products: [], loss_products: [], low_stock_products: [],
      sales_by_day: [], sales_by_weekday: [], sales_by_hour: [], best_hours: [], slow_hours: [],
      sales_periods: emptyPeriods(), profit_periods: emptyProfitPeriods(),
      payment_distribution: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 },
      loyalty_distribution: { BRONCE: 0, PLATA: 0, ORO: 0, BLACK: 0 },
      at_risk_customers: [], birthdays_this_month: [],
    };
    if (!isVinosConfigured) return empty;

    const { start: fromDate, end: toDate } = resolveDateRange(range);
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const weekStart = startOfLocalWeek(now);
    const monthStart = startOfLocalMonth(now);
    const yearStart = startOfLocalYear(now);
    const periodFromIso = yearStart.toISOString();

    const productsQuery = supabaseVinos
      .from('products')
      .select('id, name, sku, min_stock, product_stocks(qty, branch_id)')
      .eq('is_active', true)
      .is('deleted_at', null);

    let purchasesQuery = supabaseVinos
      .from('purchases')
      .select('id, purchase_date, created_at, branch_id, items:purchase_items(product_id, qty, qty_base, cost_per_unit, subtotal)')
      .is('deleted_at', null)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3000);
    if (branchId) purchasesQuery = purchasesQuery.eq('branch_id', branchId);

    const [productsRes, purchasesRes] = await Promise.all([productsQuery, purchasesQuery]);
    if (productsRes.error) throw productsRes.error;
    if (purchasesRes.error) throw purchasesRes.error;

    const costByProduct = new Map<string, number>();
    const productMeta = new Map<string, { name: string; sku: string; stock: number; min_stock: number }>();

    ((purchasesRes.data ?? []) as Array<{
      items: Array<{ product_id: string; qty: number; qty_base: number; cost_per_unit: number; subtotal: number }> | { product_id: string; qty: number; qty_base: number; cost_per_unit: number; subtotal: number } | null;
    }>).forEach((purchase) => {
      const items = Array.isArray(purchase.items) ? purchase.items : purchase.items ? [purchase.items] : [];
      items.forEach((item) => {
        if (costByProduct.has(item.product_id)) return;
        const qtyBase = Number(item.qty_base ?? Number(item.qty ?? 0));
        const subtotal = Number(item.subtotal ?? Number(item.qty ?? 0) * Number(item.cost_per_unit ?? 0));
        const baseCost = qtyBase > 0 ? subtotal / qtyBase : Number(item.cost_per_unit ?? 0);
        costByProduct.set(item.product_id, roundCurrency(baseCost));
      });
    });

    ((productsRes.data ?? []) as Array<{
      id: string; name: string; sku: string; min_stock: number;
      product_stocks?: Array<{ qty: number; branch_id: number }> | null;
    }>).forEach((product) => {
      const stocks = product.product_stocks ?? [];
      const stock = branchId
        ? stocks.filter((row) => row.branch_id === branchId).reduce((sum, row) => sum + Number(row.qty ?? 0), 0)
        : stocks.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
      productMeta.set(product.id, {
        name: product.name,
        sku: product.sku,
        stock,
        min_stock: Number(product.min_stock ?? 0),
      });
    });

    const inventory_value = Array.from(productMeta.entries()).reduce((sum, [productId, product]) => {
      return sum + (Number(product.stock ?? 0) * Number(costByProduct.get(productId) ?? 0));
    }, 0);

    const low_stock_products = Array.from(productMeta.entries())
      .filter(([, product]) => product.min_stock > 0 && product.stock <= product.min_stock)
      .map(([product_id, product]) => ({ product_id, ...product }))
      .sort((a, b) => (a.stock - a.min_stock) - (b.stock - b.min_stock))
      .slice(0, 8);

    // 1. Ventas en rango
    let salesQ = supabaseVinos
      .from('sales')
      .select('id, customer_id, subtotal, discount_amount, total, payment_method, wallet_used, created_at, customer:customers(name)')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .is('deleted_at', null);
    if (branchId) salesQ = salesQ.eq('branch_id', branchId);
    const { data: salesData } = await salesQ;
    interface SaleRowRaw { id: string; customer_id: string | null; subtotal: number; discount_amount: number; total: number; payment_method: string; wallet_used: number; created_at: string; customer?: { name: string } | { name: string }[] | null }
    const sales: SaleRowRaw[] = (salesData as SaleRowRaw[]) ?? [];

    let periodSalesQ = supabaseVinos
      .from('sales')
      .select('id, subtotal, discount_amount, total, payment_method, wallet_used, created_at')
      .gte('created_at', periodFromIso)
      .lte('created_at', now.toISOString())
      .is('deleted_at', null);
    if (branchId) periodSalesQ = periodSalesQ.eq('branch_id', branchId);
    const { data: periodSalesData } = await periodSalesQ;
    const periodSales = (periodSalesData as SaleRowRaw[]) ?? [];

    // 2. KPIs base
    const total_sales = sales.length;
    const total_amount = sales.reduce((s, r) => s + Number(r.total), 0);
    const avg_ticket = total_sales > 0 ? total_amount / total_sales : 0;

    // 3. Payment distribution
    const payment_distribution = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 };
    sales.forEach(s => {
      if (Number(s.wallet_used ?? 0) >= Number(s.total) && Number(s.wallet_used) > 0) payment_distribution.SALDO += 1;
      else if (s.payment_method === 'CREDITO') payment_distribution.CREDITO += 1;
      else if (s.payment_method === 'CORTESIA') payment_distribution.CORTESIA += 1;
      else if (s.payment_method === 'TARJETA') payment_distribution.TARJETA += 1;
      else if (s.payment_method === 'TRANSFERENCIA') payment_distribution.TRANSFERENCIA += 1;
      else payment_distribution.EFECTIVO += 1;
    });

    const sales_periods = emptyPeriods();
    periodSales.forEach((sale) => {
      const createdAt = new Date(sale.created_at);
      const apply = (key: keyof typeof sales_periods) => {
        sales_periods[key].sales += 1;
        sales_periods[key].amount += Number(sale.total ?? 0);
      };
      if (createdAt >= todayStart) apply('today');
      if (createdAt >= weekStart) apply('week');
      if (createdAt >= monthStart) apply('month');
      if (createdAt >= yearStart) apply('year');
    });

    // 4. Sales by day
    const dayMap: Record<string, { amount: number; count: number }> = {};
    const rangeDays = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
    const chartStart = new Date(rangeDays <= 14 ? fromDate : toDate);
    if (rangeDays > 14) chartStart.setDate(toDate.getDate() - 6);
    chartStart.setHours(0, 0, 0, 0);
    const chartEnd = new Date(toDate);
    chartEnd.setHours(0, 0, 0, 0);

    for (let d = new Date(chartStart); d <= chartEnd; d.setDate(d.getDate() + 1)) {
      const key = toLocalDateKey(d);
      dayMap[key] = { amount: 0, count: 0 };
    }
    sales.forEach(s => {
      const key = toLocalDateKey(new Date(s.created_at));
      if (dayMap[key]) {
        dayMap[key].amount += Number(s.total);
        dayMap[key].count += 1;
      }
    });
    const sales_by_day = Object.entries(dayMap).map(([day, v]) => ({ day, amount: v.amount, count: v.count }));

    const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const weekdayMap = weekdayLabels.reduce<Record<string, { amount: number; count: number }>>((acc, day) => {
      acc[day] = { amount: 0, count: 0 };
      return acc;
    }, {});
    const hourMap = Array.from({ length: 24 }).reduce<Record<number, { amount: number; count: number }>>((acc, _, hour) => {
      acc[hour] = { amount: 0, count: 0 };
      return acc;
    }, {});
    sales.forEach((sale) => {
      const createdAt = new Date(sale.created_at);
      const weekday = weekdayLabels[createdAt.getDay()];
      const hour = createdAt.getHours();
      weekdayMap[weekday].amount += Number(sale.total ?? 0);
      weekdayMap[weekday].count += 1;
      hourMap[hour].amount += Number(sale.total ?? 0);
      hourMap[hour].count += 1;
    });
    const sales_by_weekday = weekdayLabels.map((day) => ({ day, ...weekdayMap[day] }));
    const sales_by_hour = Object.entries(hourMap).map(([hour, value]) => ({ hour: Number(hour), ...value }));
    const activeHours = sales_by_hour.filter((row) => row.count > 0);
    const best_hours = [...activeHours].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 5);
    const slow_hours = [...activeHours].sort((a, b) => a.count - b.count || a.amount - b.amount).slice(0, 5);

    // 5. Top customers
    const customerAgg: Record<string, { total: number; count: number; name: string }> = {};
    sales.forEach(s => {
      if (!s.customer_id) return;
      const cust = Array.isArray(s.customer) ? s.customer[0] : s.customer;
      const name = cust?.name ?? '-';
      const k = s.customer_id;
      customerAgg[k] = customerAgg[k] || { total: 0, count: 0, name };
      customerAgg[k].total += Number(s.total);
      customerAgg[k].count += 1;
    });
    const top_customers = Object.entries(customerAgg)
      .map(([customer_id, v]) => ({ customer_id, name: v.name, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    let gross_profit = 0;
    let sold_cost_total = 0;
    let profit_margin = 0;
    let top_products: ReportsKPIs['top_products'] = [];
    let top_profit_products: ReportsKPIs['top_profit_products'] = [];
    let loss_products: ReportsKPIs['loss_products'] = [];
    const profit_periods = emptyProfitPeriods();

    if (options?.includeItemAnalytics !== false) {
    // 6. Top products
    const saleIds = sales.map(s => s.id);
    const items = saleIds.length > 0 ? await fetchSaleItemsBySaleIds(saleIds, true) : [];
    const saleItemsTotal = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.sale_id] = (acc[item.sale_id] ?? 0) + Number(item.line_total ?? 0);
      return acc;
    }, {});
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));

    const productAgg: Record<string, { name: string; sku: string; qty: number; total: number; profit: number }> = {};
    items.forEach(it => {
      const product = productMeta.get(it.product_id);
      if (!product) return;
      const sale = saleById.get(it.sale_id);
      const lineTotal = Number(it.line_total ?? 0);
      const saleLineTotal = Number(saleItemsTotal[it.sale_id] ?? 0);
      const discountShare = saleLineTotal > 0 ? (lineTotal / saleLineTotal) * Number(sale?.discount_amount ?? 0) : 0;
      const netLineTotal = Math.max(0, lineTotal - discountShare);
      const qtyBase = Number(it.qty_base ?? it.qty ?? 0);
      const costTotal = qtyBase * Number(costByProduct.get(it.product_id) ?? 0);
      const profit = roundCurrency(netLineTotal - costTotal);
      const k = it.product_id;
      productAgg[k] = productAgg[k] || { name: product.name, sku: product.sku, qty: 0, total: 0, profit: 0 };
      productAgg[k].qty += Number(it.qty);
      productAgg[k].total += netLineTotal;
      productAgg[k].profit += profit;
      gross_profit += profit;
      sold_cost_total += costTotal;
    });
    top_products = Object.entries(productAgg)
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    top_profit_products = Object.entries(productAgg)
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
    loss_products = Object.entries(productAgg)
      .map(([product_id, v]) => ({ product_id, ...v }))
      .filter((row) => row.profit <= 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);
    profit_margin = sold_cost_total > 0 ? (gross_profit / sold_cost_total) * 100 : 0;

    const periodSaleIds = periodSales.map((sale) => sale.id);
    const periodItems = periodSaleIds.length > 0 ? await fetchSaleItemsBySaleIds(periodSaleIds, false) : [];
    const periodSaleById = new Map(periodSales.map((sale) => [sale.id, sale]));
    const periodSaleItemsTotal = periodItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.sale_id] = (acc[item.sale_id] ?? 0) + Number(item.line_total ?? 0);
      return acc;
    }, {});
    const profitBySale = periodItems.reduce<Record<string, number>>((acc, item) => {
      if (!productMeta.has(item.product_id)) return acc;
      const sale = periodSaleById.get(item.sale_id);
      const lineTotal = Number(item.line_total ?? 0);
      const saleLineTotal = Number(periodSaleItemsTotal[item.sale_id] ?? 0);
      const discountShare = saleLineTotal > 0 ? (lineTotal / saleLineTotal) * Number(sale?.discount_amount ?? 0) : 0;
      const netLineTotal = Math.max(0, lineTotal - discountShare);
      const qtyBase = Number(item.qty_base ?? item.qty ?? 0);
      const profit = roundCurrency(netLineTotal - (qtyBase * Number(costByProduct.get(item.product_id) ?? 0)));
      acc[item.sale_id] = (acc[item.sale_id] ?? 0) + profit;
      return acc;
    }, {});
    periodSales.forEach((sale) => {
      const createdAt = new Date(sale.created_at);
      const profit = Number(profitBySale[sale.id] ?? 0);
      if (createdAt >= todayStart) profit_periods.today += profit;
      if (createdAt >= weekStart) profit_periods.week += profit;
      if (createdAt >= monthStart) profit_periods.month += profit;
      if (createdAt >= yearStart) profit_periods.year += profit;
    });
    }

    // 7. Nuevos clientes
    let custQ = supabaseVinos
      .from('customers')
      .select('id, name, status, last_purchase_date, birthday, phone, loyalty_level, created_at')
      .eq('is_active', true);
    if (branchId) custQ = custQ.eq('branch_id', branchId);
    const { data: allCustomers } = await custQ;
    interface CustRow { id: string; name: string; status: string; last_purchase_date: string | null; birthday: string | null; phone: string | null; loyalty_level: string; created_at: string }
    const customersAll: CustRow[] = (allCustomers as CustRow[]) ?? [];
    const new_customers = customersAll.filter(c => c.created_at >= fromIso).length;

    // 8. Loyalty distribution
    const loyalty_distribution = { BRONCE: 0, PLATA: 0, ORO: 0, BLACK: 0 };
    customersAll.forEach(c => {
      const lvl = c.loyalty_level as keyof typeof loyalty_distribution;
      if (lvl in loyalty_distribution) loyalty_distribution[lvl] += 1;
    });

    // 9. At-risk (DORMIDO/EN_RIESGO/PERDIDO)
    const at_risk_customers = customersAll
      .filter(c => c.status === 'DORMIDO' || c.status === 'EN_RIESGO' || c.status === 'PERDIDO')
      .slice(0, 10)
      .map(c => ({ id: c.id, name: c.name, status: c.status, last_purchase: c.last_purchase_date }));

    // 10. Cumpleaños del mes
    const month = (new Date()).getMonth() + 1;
    const birthdays_this_month = customersAll
      .filter(c => {
        if (!c.birthday) return false;
        const m = Number(c.birthday.slice(5, 7));
        return m === month;
      })
      .slice(0, 10)
      .map(c => ({ id: c.id, name: c.name, birthday: c.birthday!, phone: c.phone }));

    return {
      total_sales, total_amount, avg_ticket, gross_profit, profit_margin, inventory_value, new_customers,
      top_customers, top_products, top_profit_products, loss_products, low_stock_products,
      sales_by_day, sales_by_weekday, sales_by_hour, best_hours, slow_hours,
      sales_periods, profit_periods,
      payment_distribution, loyalty_distribution,
      at_risk_customers, birthdays_this_month,
    };
  },

  async getItemAnalytics(branchId: number | null, range: number | ReportsDateRange = 30): Promise<ReportsItemAnalytics> {
    const data = await this.getKPIs(branchId, range, { includeItemAnalytics: true });
    return {
      gross_profit: data.gross_profit,
      profit_margin: data.profit_margin,
      top_products: data.top_products,
      top_profit_products: data.top_profit_products,
      loss_products: data.loss_products,
      profit_periods: data.profit_periods,
    };
  },
};
