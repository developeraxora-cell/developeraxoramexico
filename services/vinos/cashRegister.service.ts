import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface CashRegisterSession {
  id: string;
  branch_id: number;
  branch_code: string | null;
  branch_name: string | null;
  cashier_user_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  cash_sales_total: number;
  card_sales_total: number;
  transfer_sales_total: number;
  credit_sales_total: number;
  courtesy_total: number;
  discounts_total: number;
  cancellations_total: number;
  cancellations_count: number;
  total_sold: number;
  expected_cash: number;
  delivered_cash: number | null;
  cash_difference: number | null;
  opening_observations: string | null;
  closing_observations: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashRegisterSummary {
  cash_sales_total: number;
  card_sales_total: number;
  transfer_sales_total: number;
  credit_sales_total: number;
  courtesy_total: number;
  discounts_total: number;
  cancellations_total: number;
  cancellations_count: number;
  total_sold: number;
  expected_cash: number;
}

interface SaleForCashRegister {
  payment_method: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;
  deleted_at: string | null;
}

const MEXICO_TZ = 'America/Mexico_City';
const MEXICO_UTC_OFFSET = '-06:00';

const getMexicoDateParts = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: parts.find(part => part.type === 'year')?.value ?? '1970',
    month: parts.find(part => part.type === 'month')?.value ?? '01',
    day: parts.find(part => part.type === 'day')?.value ?? '01',
  };
};

const getMexicoDayCloseDate = (openedAt: string) => {
  const { year, month, day } = getMexicoDateParts(openedAt);
  return new Date(`${year}-${month}-${day}T23:59:59${MEXICO_UTC_OFFSET}`);
};

const getAutoCloseObservation = (previous?: string | null) => {
  const autoNote = 'Cierre automático a las 23:59 hora de México.';
  const trimmed = previous?.trim();
  return trimmed ? `${trimmed} | ${autoNote}` : autoNote;
};

const isMissingCloseExpiredRpc = (error: unknown) => {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const text = `${err?.code ?? ''} ${err?.message ?? ''} ${err?.details ?? ''}`.toLowerCase();
  return (
    text.includes('close_expired_cash_register_sessions') &&
    (text.includes('schema cache') || text.includes('function') || text.includes('does not exist') || text.includes('not found'))
  );
};

const emptySummary = (openingCash = 0): CashRegisterSummary => ({
  cash_sales_total: 0,
  card_sales_total: 0,
  transfer_sales_total: 0,
  credit_sales_total: 0,
  courtesy_total: 0,
  discounts_total: 0,
  cancellations_total: 0,
  cancellations_count: 0,
  total_sold: 0,
  expected_cash: openingCash,
});

const paymentKey = (value: string | null | undefined) =>
  String(value ?? '').trim().toUpperCase();

const calculateSummary = (sales: SaleForCashRegister[], openingCash: number): CashRegisterSummary => {
  const summary = emptySummary(openingCash);

  sales.forEach((sale) => {
    const total = Number(sale.total ?? 0);
    const subtotal = Number(sale.subtotal ?? 0);
    const discount = Number(sale.discount_amount ?? 0);
    const method = paymentKey(sale.payment_method);

    if (sale.deleted_at) {
      summary.cancellations_count += 1;
      summary.cancellations_total += total;
      return;
    }

    summary.total_sold += total;
    summary.discounts_total += discount;

    if (method === 'EFECTIVO') summary.cash_sales_total += total;
    else if (method === 'TARJETA') summary.card_sales_total += total;
    else if (method === 'TRANSFERENCIA' || method === 'TRANSFER' || method === 'TRANSFERENCIAS') summary.transfer_sales_total += total;
    else if (method === 'CREDITO' || method === 'CRÉDITO') summary.credit_sales_total += total;
    else if (method === 'CORTESIA' || method === 'CORTESÍA') summary.courtesy_total += subtotal;
  });

  summary.expected_cash = Number(openingCash || 0) + summary.cash_sales_total;
  return summary;
};

export const vinosCashRegisterService = {
  async closeExpired(branchId?: number): Promise<CashRegisterSession[]> {
    if (!isVinosConfigured) return [];

    const { error: rpcError } = await supabaseVinos.rpc('close_expired_cash_register_sessions', {
      p_branch_id: branchId ?? null,
    });
    if (!rpcError) return [];
    if (!isMissingCloseExpiredRpc(rpcError)) throw rpcError;

    let query = supabaseVinos
      .from('cash_register_sessions')
      .select('*')
      .is('closed_at', null);
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const closedSessions: CashRegisterSession[] = [];

    for (const session of ((data ?? []) as CashRegisterSession[])) {
      const closeDate = getMexicoDayCloseDate(session.opened_at);
      if (closeDate.getTime() > now) continue;

      const summary = await this.previewClose(session, closeDate);
      const { data: closed, error: closeError } = await supabaseVinos
        .from('cash_register_sessions')
        .update({
          closed_at: closeDate.toISOString(),
          cash_sales_total: summary.cash_sales_total,
          card_sales_total: summary.card_sales_total,
          transfer_sales_total: summary.transfer_sales_total,
          credit_sales_total: summary.credit_sales_total,
          courtesy_total: summary.courtesy_total,
          discounts_total: summary.discounts_total,
          cancellations_total: summary.cancellations_total,
          cancellations_count: summary.cancellations_count,
          total_sold: summary.total_sold,
          expected_cash: summary.expected_cash,
          delivered_cash: summary.expected_cash,
          cash_difference: 0,
          closing_observations: getAutoCloseObservation(session.closing_observations),
          updated_at: closeDate.toISOString(),
        })
        .eq('id', session.id)
        .is('closed_at', null)
        .select()
        .maybeSingle();
      if (closeError) throw closeError;
      if (closed) closedSessions.push(closed as CashRegisterSession);
    }

    return closedSessions;
  },

  async getActive(branchId: number, cashierUserId: string): Promise<CashRegisterSession | null> {
    if (!isVinosConfigured) return null;
    await this.closeExpired(branchId);
    const { data, error } = await supabaseVinos
      .from('cash_register_sessions')
      .select('*')
      .eq('branch_id', branchId)
      .eq('cashier_user_id', cashierUserId)
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as CashRegisterSession | null;
  },

  async list(branchId: number, cashierUserId?: string): Promise<CashRegisterSession[]> {
    if (!isVinosConfigured) return [];
    await this.closeExpired(branchId);
    let query = supabaseVinos
      .from('cash_register_sessions')
      .select('*')
      .eq('branch_id', branchId)
      .order('opened_at', { ascending: false })
      .limit(100);
    if (cashierUserId) query = query.eq('cashier_user_id', cashierUserId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CashRegisterSession[];
  },

  async open(input: {
    branch_id: number;
    branch_code?: string | null;
    branch_name?: string | null;
    cashier_user_id: string;
    cashier_name: string;
    opening_cash: number;
    opening_observations?: string | null;
  }): Promise<CashRegisterSession> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    await this.closeExpired(input.branch_id);
    const current = await this.getActive(input.branch_id, input.cashier_user_id);
    if (current) throw new Error('Ya existe una caja abierta para esta cajera.');

    const openingCash = Number(input.opening_cash || 0);
    const { data, error } = await supabaseVinos
      .from('cash_register_sessions')
      .insert({
        branch_id: input.branch_id,
        branch_code: input.branch_code ?? null,
        branch_name: input.branch_name ?? null,
        cashier_user_id: input.cashier_user_id,
        cashier_name: input.cashier_name,
        opening_cash: openingCash,
        expected_cash: openingCash,
        opening_observations: input.opening_observations?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as CashRegisterSession;
  },

  async previewClose(session: CashRegisterSession, closedAt = new Date()): Promise<CashRegisterSummary> {
    if (!isVinosConfigured) return emptySummary(Number(session.opening_cash ?? 0));
    const { data, error } = await supabaseVinos
      .from('sales')
      .select('payment_method, subtotal, discount_amount, total, deleted_at')
      .eq('branch_id', session.branch_id)
      .eq('created_by', session.cashier_user_id)
      .gte('created_at', session.opened_at)
      .lte('created_at', closedAt.toISOString());
    if (error) throw error;
    return calculateSummary((data ?? []) as SaleForCashRegister[], Number(session.opening_cash ?? 0));
  },

  async close(input: {
    session: CashRegisterSession;
    delivered_cash: number;
    closing_observations?: string | null;
  }): Promise<CashRegisterSession> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const closedAt = new Date();
    const summary = await this.previewClose(input.session, closedAt);
    const deliveredCash = Number(input.delivered_cash || 0);
    const difference = deliveredCash - summary.expected_cash;

    const { data, error } = await supabaseVinos
      .from('cash_register_sessions')
      .update({
        closed_at: closedAt.toISOString(),
        cash_sales_total: summary.cash_sales_total,
        card_sales_total: summary.card_sales_total,
        transfer_sales_total: summary.transfer_sales_total,
        credit_sales_total: summary.credit_sales_total,
        courtesy_total: summary.courtesy_total,
        discounts_total: summary.discounts_total,
        cancellations_total: summary.cancellations_total,
        cancellations_count: summary.cancellations_count,
        total_sold: summary.total_sold,
        expected_cash: summary.expected_cash,
        delivered_cash: deliveredCash,
        cash_difference: difference,
        closing_observations: input.closing_observations?.trim() || null,
        updated_at: closedAt.toISOString(),
      })
      .eq('id', input.session.id)
      .select()
      .single();
    if (error) throw error;
    return data as CashRegisterSession;
  },
};
