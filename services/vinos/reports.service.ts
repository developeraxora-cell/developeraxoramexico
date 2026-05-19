import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface ReportsKPIs {
  total_sales: number;
  total_amount: number;
  avg_ticket: number;
  new_customers: number;
  top_customers: Array<{ customer_id: string; name: string; total: number; count: number }>;
  top_products: Array<{ product_id: string; name: string; sku: string; qty: number; total: number }>;
  sales_by_day: Array<{ day: string; amount: number; count: number }>;
  payment_distribution: { EFECTIVO: number; CREDITO: number; CORTESIA: number; SALDO: number };
  loyalty_distribution: { BRONCE: number; PLATA: number; ORO: number; BLACK: number };
  at_risk_customers: Array<{ id: string; name: string; status: string; last_purchase: string | null }>;
  birthdays_this_month: Array<{ id: string; name: string; birthday: string; phone: string | null }>;
}

export const vinosReportsService = {
  async getKPIs(branchId: number | null, days = 30): Promise<ReportsKPIs> {
    const empty: ReportsKPIs = {
      total_sales: 0, total_amount: 0, avg_ticket: 0, new_customers: 0,
      top_customers: [], top_products: [], sales_by_day: [],
      payment_distribution: { EFECTIVO: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 },
      loyalty_distribution: { BRONCE: 0, PLATA: 0, ORO: 0, BLACK: 0 },
      at_risk_customers: [], birthdays_this_month: [],
    };
    if (!isVinosConfigured) return empty;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromIso = fromDate.toISOString();

    // 1. Ventas en rango
    let salesQ = supabaseVinos
      .from('sales')
      .select('id, customer_id, total, payment_method, wallet_used, created_at, customer:customers(name)')
      .gte('created_at', fromIso)
      .is('deleted_at', null);
    if (branchId) salesQ = salesQ.eq('branch_id', branchId);
    const { data: salesData } = await salesQ;
    interface SaleRowRaw { id: string; customer_id: string | null; total: number; payment_method: string; wallet_used: number; created_at: string; customer?: { name: string } | { name: string }[] | null }
    const sales: SaleRowRaw[] = (salesData as SaleRowRaw[]) ?? [];

    // 2. KPIs base
    const total_sales = sales.length;
    const total_amount = sales.reduce((s, r) => s + Number(r.total), 0);
    const avg_ticket = total_sales > 0 ? total_amount / total_sales : 0;

    // 3. Payment distribution
    const payment_distribution = { EFECTIVO: 0, CREDITO: 0, CORTESIA: 0, SALDO: 0 };
    sales.forEach(s => {
      if (Number(s.wallet_used ?? 0) >= Number(s.total) && Number(s.wallet_used) > 0) payment_distribution.SALDO += 1;
      else if (s.payment_method === 'CREDITO') payment_distribution.CREDITO += 1;
      else if (s.payment_method === 'CORTESIA') payment_distribution.CORTESIA += 1;
      else payment_distribution.EFECTIVO += 1;
    });

    // 4. Sales by day (último 7 días)
    const dayMap: Record<string, { amount: number; count: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { amount: 0, count: 0 };
    }
    sales.forEach(s => {
      const key = s.created_at.slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].amount += Number(s.total);
        dayMap[key].count += 1;
      }
    });
    const sales_by_day = Object.entries(dayMap).map(([day, v]) => ({ day, amount: v.amount, count: v.count }));

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

    // 6. Top products
    const saleIds = sales.map(s => s.id);
    interface ItemRow { sale_id: string; product_id: string; qty: number; line_total: number; product?: { name: string; sku: string } | { name: string; sku: string }[] | null }
    let items: ItemRow[] = [];
    if (saleIds.length > 0) {
      const { data: itemsData } = await supabaseVinos
        .from('sale_items')
        .select('sale_id, product_id, qty, line_total, product:products(name, sku)')
        .in('sale_id', saleIds);
      items = (itemsData as ItemRow[]) ?? [];
    }
    const productAgg: Record<string, { name: string; sku: string; qty: number; total: number }> = {};
    items.forEach(it => {
      const prod = Array.isArray(it.product) ? it.product[0] : it.product;
      const k = it.product_id;
      productAgg[k] = productAgg[k] || { name: prod?.name ?? '-', sku: prod?.sku ?? '-', qty: 0, total: 0 };
      productAgg[k].qty += Number(it.qty);
      productAgg[k].total += Number(it.line_total);
    });
    const top_products = Object.entries(productAgg)
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

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
      total_sales, total_amount, avg_ticket, new_customers,
      top_customers, top_products, sales_by_day,
      payment_distribution, loyalty_distribution,
      at_risk_customers, birthdays_this_month,
    };
  },
};
