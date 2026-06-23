import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface CustomerStats {
  credit_limit: number;
  debt: number;
  available: number;
  wallet_balance: number;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_default: boolean;
  created_at: string;
}

export interface WalletMovement {
  id: string;
  customer_id: string;
  amount: number;
  type: 'RECARGA' | 'USO' | 'AJUSTE' | 'APERTURA';
  related_sale_id: string | null;
  deposit_type?: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface CreditPayment {
  id: string;
  customer_id: string;
  sale_id: string | null;
  amount: number;
  payment_method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'SALDO_FAVOR';
  reference: string | null;
  notes: string | null;
  evidence_url: string | null;
  evidence_public_id: string | null;
  evidence_resource_type: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface CreditSaleSummary {
  id: string;
  created_at: string;
  total: number;
  credit_used: number;
  paid: number;
  pending: number;
  notes: string | null;
}

export const vinosCustomerMgmtService = {

  // ── Stats ──────────────────────────────────────────────
  async getStats(customerId: string): Promise<CustomerStats> {
    if (!isVinosConfigured) return { credit_limit: 0, debt: 0, available: 0, wallet_balance: 0 };

    const [{ data: cust }, { data: sales }, { data: payments }] = await Promise.all([
      supabaseVinos.from('customers').select('credit_limit, wallet_balance').eq('id', customerId).single(),
      supabaseVinos.from('sales').select('credit_used').eq('customer_id', customerId).eq('payment_method', 'CREDITO').is('deleted_at', null),
      supabaseVinos.from('credit_payments').select('amount').eq('customer_id', customerId).is('deleted_at', null),
    ]);

    const totalCredit = (sales ?? []).reduce((s: number, r: { credit_used: number }) => s + Number(r.credit_used ?? 0), 0);
    const totalPaid = (payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0);
    const debt = Math.max(0, totalCredit - totalPaid);

    const limit = Number(cust?.credit_limit ?? 0);
    return {
      credit_limit: limit,
      debt,
      available: Math.max(0, limit - debt),
      wallet_balance: Number(cust?.wallet_balance ?? 0),
    };
  },

  // ── Direcciones ────────────────────────────────────────
  async getDebtsMap(branchId?: number): Promise<Record<string, number>> {
    if (!isVinosConfigured) return {};
    let salesQuery = supabaseVinos
      .from('sales')
      .select('customer_id, credit_used')
      .eq('payment_method', 'CREDITO')
      .is('deleted_at', null);
    if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);
    const { data: sales, error: sErr } = await salesQuery;
    if (sErr) return {};

    const creditTotalByCustomer: Record<string, number> = {};
    (sales ?? []).forEach((s: { customer_id: string | null; credit_used: number }) => {
      if (!s.customer_id) return;
      creditTotalByCustomer[s.customer_id] = (creditTotalByCustomer[s.customer_id] ?? 0) + Number(s.credit_used ?? 0);
    });

    const customerIds = Object.keys(creditTotalByCustomer);
    if (customerIds.length === 0) return {};

    const { data: pays } = await supabaseVinos
      .from('credit_payments')
      .select('customer_id, amount')
      .in('customer_id', customerIds)
      .is('deleted_at', null);

    const paidByCustomer: Record<string, number> = {};
    (pays ?? []).forEach((p: { customer_id: string; amount: number }) => {
      paidByCustomer[p.customer_id] = (paidByCustomer[p.customer_id] ?? 0) + Number(p.amount);
    });

    const result: Record<string, number> = {};
    customerIds.forEach(id => {
      result[id] = Math.max(0, creditTotalByCustomer[id] - (paidByCustomer[id] ?? 0));
    });
    return result;
  },

  async listAddresses(customerId: string): Promise<CustomerAddress[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CustomerAddress[];
  },

  async createAddress(input: Omit<CustomerAddress, 'id' | 'created_at'>): Promise<CustomerAddress> {
    if (input.is_default) {
      await supabaseVinos.from('customer_addresses').update({ is_default: false }).eq('customer_id', input.customer_id);
    }
    const { data, error } = await supabaseVinos
      .from('customer_addresses')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as CustomerAddress;
  },

  async updateAddress(id: string, input: Partial<Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at'>>): Promise<void> {
    if (input.is_default) {
      const { data } = await supabaseVinos.from('customer_addresses').select('customer_id').eq('id', id).single();
      if (data) await supabaseVinos.from('customer_addresses').update({ is_default: false }).eq('customer_id', data.customer_id);
    }
    const { error } = await supabaseVinos.from('customer_addresses').update(input).eq('id', id);
    if (error) throw error;
  },

  async deleteAddress(id: string): Promise<void> {
    const { error } = await supabaseVinos.from('customer_addresses').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Wallet ─────────────────────────────────────────────
  async listWalletMovements(customerId: string): Promise<WalletMovement[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('customer_wallet_movements')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as WalletMovement[];
  },

  async rechargeWallet(input: { customer_id: string; amount: number; deposit_type?: string; notes?: string; actorId?: string; actorName?: string }): Promise<void> {
    if (input.amount <= 0) throw new Error('Monto debe ser mayor a 0.');
    const { data: cust } = await supabaseVinos
      .from('customers')
      .select('wallet_balance, wallet_enabled')
      .eq('id', input.customer_id)
      .single();
    if (!cust) throw new Error('Cliente no encontrado.');

    const newBalance = Number(cust.wallet_balance ?? 0) + input.amount;
    await supabaseVinos
      .from('customers')
      .update({
        wallet_balance: newBalance,
        wallet_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.customer_id);

    await supabaseVinos.from('customer_wallet_movements').insert({
      customer_id: input.customer_id,
      amount: input.amount,
      type: 'RECARGA',
      deposit_type: input.deposit_type ?? null,
      notes: input.notes ?? 'Recarga manual',
      created_by: input.actorId ?? null,
      created_by_name: input.actorName ?? null,
    });
  },

  // ── Credit payments (abonos) ───────────────────────────
  async listCreditPayments(customerId: string): Promise<CreditPayment[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('credit_payments')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as CreditPayment[];
  },

  async registerCreditPayment(input: {
    customer_id: string;
    sale_id?: string | null;
    amount: number;
    payment_method: CreditPayment['payment_method'];
    reference?: string;
    notes?: string;
    evidence_url?: string | null;
    evidence_public_id?: string | null;
    evidence_resource_type?: string | null;
    actorId?: string;
  }): Promise<void> {
    if (input.amount <= 0) throw new Error('Monto debe ser mayor a 0.');

    // Si método es SALDO_FAVOR descontar de wallet
    if (input.payment_method === 'SALDO_FAVOR') {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance')
        .eq('id', input.customer_id)
        .single();
      const balance = Number(cust?.wallet_balance ?? 0);
      if (balance < input.amount) throw new Error(`Saldo insuficiente. Disponible: $${balance.toFixed(2)}`);

      await supabaseVinos
        .from('customers')
        .update({
          wallet_balance: balance - input.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.customer_id);

      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: input.customer_id,
        amount: -input.amount,
        type: 'USO',
        notes: `Abono a crédito${input.reference ? ` ref: ${input.reference}` : ''}`,
        created_by: input.actorId ?? null,
      });
    }

    await supabaseVinos.from('credit_payments').insert({
      customer_id: input.customer_id,
      sale_id: input.sale_id ?? null,
      amount: input.amount,
      payment_method: input.payment_method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      evidence_url: input.evidence_url ?? null,
      evidence_public_id: input.evidence_public_id ?? null,
      evidence_resource_type: input.evidence_resource_type ?? null,
      created_by: input.actorId ?? null,
    });
  },

  async updateCreditPayment(id: string, patch: {
    amount?: number;
    payment_method?: CreditPayment['payment_method'];
    reference?: string | null;
    notes?: string | null;
    evidence_url?: string | null;
    evidence_public_id?: string | null;
    evidence_resource_type?: string | null;
  }): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB no configurada');
    const { error } = await supabaseVinos.from('credit_payments').update(patch).eq('id', id);
    if (error) throw error;
  },

  async addPaymentEvidences(paymentId: string, evidences: Array<{ file_url: string; file_name: string; file_size_kb?: number; cloudinary_public_id?: string; cloudinary_resource_type?: string }>): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB no configurada');
    if (evidences.length === 0) return;
    const rows = evidences.map(e => ({
      payment_id: paymentId,
      file_url: e.file_url,
      file_name: e.file_name,
      file_size_kb: e.file_size_kb ?? null,
      cloudinary_public_id: e.cloudinary_public_id ?? null,
      cloudinary_resource_type: e.cloudinary_resource_type ?? null,
    }));
    const { error } = await supabaseVinos.from('credit_payment_evidences').insert(rows);
    if (error) throw error;
  },

  async listPaymentEvidences(paymentId: string): Promise<Array<{ id: string; file_url: string; file_name: string; file_size_kb: number | null; cloudinary_public_id: string | null; uploaded_at: string }>> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('credit_payment_evidences')
      .select('id, file_url, file_name, file_size_kb, cloudinary_public_id, uploaded_at')
      .eq('payment_id', paymentId)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async deletePaymentEvidence(id: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB no configurada');
    const { error } = await supabaseVinos.from('credit_payment_evidences').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteCreditPayment(id: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB no configurada');
    // Si era SALDO_FAVOR, revertir wallet
    const { data: pay } = await supabaseVinos
      .from('credit_payments')
      .select('customer_id, amount, payment_method')
      .eq('id', id)
      .single();
    if (pay?.payment_method === 'SALDO_FAVOR') {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance')
        .eq('id', pay.customer_id)
        .single();
      const restored = Number(cust?.wallet_balance ?? 0) + Number(pay.amount);
      await supabaseVinos
        .from('customers')
        .update({ wallet_balance: restored, updated_at: new Date().toISOString() })
        .eq('id', pay.customer_id);
      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: pay.customer_id,
        amount: Number(pay.amount),
        type: 'AJUSTE',
        notes: `Reverso por eliminación de abono`,
      });
    }
    const { error } = await supabaseVinos.from('credit_payments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  // ── Credit sales con balance ───────────────────────────
  async listCreditSales(customerId: string): Promise<CreditSaleSummary[]> {
    if (!isVinosConfigured) return [];
    const { data: sales } = await supabaseVinos
      .from('sales')
      .select('id, created_at, total, credit_used, notes')
      .eq('customer_id', customerId)
      .eq('payment_method', 'CREDITO')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const saleIds = (sales ?? []).map(s => s.id);
    const { data: pays } = saleIds.length > 0
      ? await supabaseVinos.from('credit_payments').select('sale_id, amount').in('sale_id', saleIds).is('deleted_at', null)
      : { data: [] };
    const paidBySale: Record<string, number> = {};
    (pays ?? []).forEach((p: { sale_id: string; amount: number }) => {
      paidBySale[p.sale_id] = (paidBySale[p.sale_id] ?? 0) + Number(p.amount);
    });

    return (sales ?? []).map(s => ({
      id: s.id,
      created_at: s.created_at,
      total: Number(s.total),
      credit_used: Number(s.credit_used ?? 0),
      paid: paidBySale[s.id] ?? 0,
      pending: Math.max(0, Number(s.credit_used ?? 0) - (paidBySale[s.id] ?? 0)),
      notes: s.notes,
    }));
  },

  async listCashSales(customerId: string): Promise<Array<{ id: string; created_at: string; total: number; payment_method: string; cash_received: number; notes: string | null }>> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('sales')
      .select('id, created_at, total, payment_method, cash_received, notes')
      .eq('customer_id', customerId)
      .neq('payment_method', 'CREDITO')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []);
  },
};
