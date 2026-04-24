import { supabase } from '../supabaseClient';
import type { CreditCustomer } from './credit.service';

export type WalletStatus = 'ACTIVA' | 'INACTIVA' | 'BLOQUEADA';
export type WalletMovementType = 'APERTURA' | 'RECARGA' | 'USO_VENTA' | 'AJUSTE' | 'REVERSO';

export interface CustomerWallet {
  id: string;
  branch_id: string;
  customer_id: string;
  status: WalletStatus;
  current_balance: number;
  opened_amount: number;
  opened_at: string;
  opened_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CustomerWalletSummary extends CustomerWallet {
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  last_recharge_at: string | null;
  last_recharge_amount: number | null;
}

export interface CustomerWalletMovement {
  id: string;
  wallet_id: string;
  branch_id: string;
  customer_id: string;
  movement_type: WalletMovementType;
  amount: number;
  balance_before: number;
  balance_after: number;
  sale_id: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const normalizeWallet = (row: any): CustomerWallet => ({
  id: String(row.id),
  branch_id: String(row.branch_id),
  customer_id: String(row.customer_id),
  status: String(row.status) as WalletStatus,
  current_balance: Number(row.current_balance ?? 0),
  opened_amount: Number(row.opened_amount ?? 0),
  opened_at: String(row.opened_at),
  opened_by: row.opened_by ?? null,
  created_at: String(row.created_at),
  updated_at: row.updated_at ?? null,
});

const normalizeWalletSummary = (row: any): CustomerWalletSummary => ({
  ...normalizeWallet(row),
  customer_name: String(row.customer_name ?? ''),
  customer_phone: row.customer_phone ?? null,
  customer_address: row.customer_address ?? null,
  last_recharge_at: row.last_recharge_at ?? null,
  last_recharge_amount: row.last_recharge_amount == null ? null : Number(row.last_recharge_amount),
});

const normalizeBranchId = (branchId: string | number) => Number(branchId);

const normalizeMovement = (row: any): CustomerWalletMovement => ({
  id: String(row.id),
  wallet_id: String(row.wallet_id),
  branch_id: String(row.branch_id),
  customer_id: String(row.customer_id),
  movement_type: String(row.movement_type) as WalletMovementType,
  amount: Number(row.amount ?? 0),
  balance_before: Number(row.balance_before ?? 0),
  balance_after: Number(row.balance_after ?? 0),
  sale_id: row.sale_id == null ? null : String(row.sale_id),
  reference: row.reference ?? null,
  notes: row.notes ?? null,
  created_by: row.created_by ?? null,
  created_at: String(row.created_at),
});

export const concreteWalletService = {
  async listWalletsByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('concrete_v_customer_wallets_summary')
      .select('*')
      .eq('branch_id', normalizeBranchId(branchId))
      .eq('status', 'ACTIVA')
      .order('customer_name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(normalizeWalletSummary);
  },

  async listWalletMovements(walletId: string) {
    const { data, error } = await supabase
      .from('concrete_customer_wallet_movements')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(normalizeMovement);
  },

  async listEligibleCustomers(branchId: string, query = '') {
    let customerQuery = supabase
      .from('concrete_credit_customers')
      .select('id, branch_id, name, phone, address, credit_limit, default_credit_days, policy, allow_cash_if_blocked, late_tolerance_days, is_active, created_at, updated_at')
      .eq('branch_id', normalizeBranchId(branchId))
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(50);

    const normalizedQuery = query.trim();
    if (normalizedQuery) {
      customerQuery = customerQuery.or(`name.ilike.%${normalizedQuery}%,phone.ilike.%${normalizedQuery}%,address.ilike.%${normalizedQuery}%`);
    }

    const { data: customers, error: customersError } = await customerQuery;
    if (customersError) throw customersError;

    const { data: wallets, error: walletsError } = await supabase
      .from('concrete_customer_wallets')
      .select('customer_id, status')
      .eq('branch_id', normalizeBranchId(branchId));

    if (walletsError) throw walletsError;

    const blockedCustomerIds = new Set(
      (wallets ?? [])
        .filter((row) => ['ACTIVA', 'BLOQUEADA'].includes(String(row.status ?? '')))
        .map((row) => String(row.customer_id)),
    );

    return ((customers ?? []) as CreditCustomer[]).filter((customer) => !blockedCustomerIds.has(String(customer.id)));
  },

  async getWalletByCustomer(branchId: string, customerId: string) {
    const { data, error } = await supabase
      .from('concrete_v_customer_wallets_summary')
      .select('*')
      .eq('branch_id', normalizeBranchId(branchId))
      .eq('customer_id', customerId)
      .eq('status', 'ACTIVA')
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeWalletSummary(data) : null;
  },

  async createWallet(input: {
    branch_id: string;
    customer_id: string;
    initial_amount: number;
    opened_by: string;
    notes?: string | null;
  }) {
    const { data, error } = await supabase.rpc('create_concrete_customer_wallet', {
      p_branch_id: normalizeBranchId(input.branch_id),
      p_customer_id: input.customer_id,
      p_initial_amount: input.initial_amount,
      p_opened_by: input.opened_by,
      p_notes: input.notes ?? null,
    });

    if (error) throw error;
    return normalizeWallet(data);
  },

  async rechargeWallet(input: {
    wallet_id: string;
    amount: number;
    created_by: string;
    reference?: string | null;
    notes?: string | null;
  }) {
    const { data, error } = await supabase.rpc('recharge_concrete_customer_wallet', {
      p_wallet_id: input.wallet_id,
      p_amount: input.amount,
      p_created_by: input.created_by,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
    });

    if (error) throw error;
    return normalizeWallet(data);
  },

  async applyWalletToSale(input: {
    wallet_id: string;
    sale_id: string;
    wallet_amount: number;
    cash_amount: number;
    credit_amount: number;
    payment_notes?: string | null;
    created_by: string;
  }) {
    const { data, error } = await supabase.rpc('apply_concrete_wallet_to_sale', {
      p_wallet_id: input.wallet_id,
      p_sale_id: Number(input.sale_id),
      p_wallet_amount: input.wallet_amount,
      p_cash_amount: input.cash_amount,
      p_credit_amount: input.credit_amount,
      p_payment_notes: input.payment_notes ?? null,
      p_created_by: input.created_by,
    });

    if (error) throw error;
    return data;
  },
};
