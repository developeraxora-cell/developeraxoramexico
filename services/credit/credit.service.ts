import { supabase } from '../supabaseClient';

export type CreditPolicy = 'CERO_TOLERANCIA' | 'BLOQUEO_PARCIAL';
export type CreditPaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'YAPE' | 'PLIN' | 'OTRO';

export interface CreditCustomer {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  default_credit_days: number;
  policy: CreditPolicy;
  allow_cash_if_blocked: boolean;
  late_tolerance_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface CreditNote {
  id: string;
  branch_id: string;
  customer_id: string;
  folio: string;
  issue_date: string;
  credit_days_applied: number;
  due_date: string;
  total: number;
  paid_amount: number;
  balance: number;
  notes: string | null;
  inventory_transaction_id?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CreditPayment {
  id: string;
  note_id: string;
  paid_at: string;
  amount: number;
  method: CreditPaymentMethod;
  reference: string | null;
  notes: string | null;
}

export interface CreditNoteWithStatus extends CreditNote {
  status: 'PAGADA' | 'VENCIDA' | 'ABIERTA';
  days_overdue: number;
}

export interface CreditSummary {
  saldo_total_pendiente: number;
  disponible_credito: number;
  limite_credito: number;
  notas_vencidas: CreditNoteWithStatus[];
}

export interface CreditCustomersPage {
  rows: CreditCustomer[];
  total: number;
}

const normalizeNumber = (value: unknown) => Number(value ?? 0);

const computeStatus = (note: CreditNote, today: Date, toleranceDays: number) => {
  const balance = Number(note.balance ?? 0);
  if (balance <= 0) return { status: 'PAGADA' as const, days_overdue: 0 };

  const dueDate = new Date(`${note.due_date}T00:00:00Z`);
  const diffMs = today.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const overdue = diffDays > toleranceDays;
  return {
    status: overdue ? ('VENCIDA' as const) : ('ABIERTA' as const),
    days_overdue: overdue ? diffDays : 0,
  };
};

const buildSummary = (customer: CreditCustomer, notes: CreditNote[], today: Date) => {
  const saldo_total_pendiente = notes.reduce((acc, note) => acc + normalizeNumber(note.balance), 0);
  const limite_credito = normalizeNumber(customer.credit_limit);
  const disponible_credito = limite_credito - saldo_total_pendiente;
  const notas_vencidas = notes
    .map((note) => ({
      ...note,
      ...computeStatus(note, today, customer.late_tolerance_days ?? 0),
    }))
    .filter((note) => note.status === 'VENCIDA');

  return {
    saldo_total_pendiente,
    disponible_credito,
    limite_credito,
    notas_vencidas,
  } as CreditSummary;
};

export const creditService = {
  async listCustomersByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('credit_customers')
      .select('*')
      .eq('branch_id', branchId)
      .order('name');

    if (error) throw error;
    return (data ?? []) as CreditCustomer[];
  },

  async searchCustomersByBranch(branchId: string, searchTerm: string) {
    const term = searchTerm.trim();
    if (!branchId || term.length < 3) return [] as CreditCustomer[];

    const escaped = term.replace(/[%_,]/g, '');
    const { data, error } = await supabase
      .from('credit_customers')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,address.ilike.%${escaped}%`)
      .order('name');

    if (error) throw error;
    return (data ?? []) as CreditCustomer[];
  },

  async listCustomersByBranchPaged(branchId: string, page: number, pageSize: number, searchTerm = '') {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 5;
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    let query = supabase
      .from('credit_customers')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId);

    const term = searchTerm.trim();
    if (term) {
      const escaped = term.replace(/[%_,]/g, '');
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,address.ilike.%${escaped}%`);
    }

    const { data, error, count } = await query.order('name').range(from, to);
    if (error) throw error;

    return {
      rows: (data ?? []) as CreditCustomer[],
      total: Number(count ?? 0),
    } as CreditCustomersPage;
  },

  async createCustomer(input: {
    branch_id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    credit_limit: number;
    default_credit_days: number;
    policy: CreditPolicy;
    allow_cash_if_blocked?: boolean;
    is_active?: boolean;
  }) {
    const { data, error } = await supabase
      .from('credit_customers')
      .insert([
        {
          ...input,
          allow_cash_if_blocked: input.allow_cash_if_blocked ?? true,
          late_tolerance_days: 0,
          is_active: input.is_active ?? true,
        },
      ])
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditCustomer;
  },

  async updateCustomer(id: string, updates: Partial<CreditCustomer>) {
    const { data, error } = await supabase
      .from('credit_customers')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditCustomer;
  },

  async listNotesByCustomer(customerId: string) {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('issue_date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listOpenNotesByCustomer(customerId: string) {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('customer_id', customerId)
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listOpenNotesByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('branch_id', branchId)
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listPaymentsByNoteIds(noteIds: string[]) {
    if (noteIds.length === 0) return [] as CreditPayment[];

    const { data, error } = await supabase
      .from('credit_payments')
      .select('*')
      .in('note_id', noteIds)
      .order('paid_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as CreditPayment[];
  },

  async getCustomerSummary(customer: CreditCustomer, today = new Date()) {
    const notes = await creditService.listOpenNotesByCustomer(customer.id);
    return buildSummary(customer, notes, today);
  },

  async getSummariesForCustomers(customers: CreditCustomer[], today = new Date()) {
    if (customers.length === 0) return {} as Record<string, CreditSummary>;

    const ids = customers.map((customer) => customer.id);
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .in('customer_id', ids)
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) throw error;

    const notesByCustomer = (data ?? []).reduce<Record<string, CreditNote[]>>((acc, row) => {
      const note = row as CreditNote;
      if (!acc[note.customer_id]) acc[note.customer_id] = [];
      acc[note.customer_id].push(note);
      return acc;
    }, {});

    return customers.reduce<Record<string, CreditSummary>>((acc, customer) => {
      acc[customer.id] = buildSummary(customer, notesByCustomer[customer.id] ?? [], today);
      return acc;
    }, {});
  },

  async createPayment(input: {
    note_id: string;
    amount: number;
    method: CreditPaymentMethod;
    reference?: string | null;
    notes?: string | null;
    paid_at?: string;
  }) {
    const payload = {
      note_id: input.note_id,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paid_at: input.paid_at ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('credit_payments')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditPayment;
  },

  async getNoteById(noteId: string) {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error) throw error;
    return data as CreditNote;
  },

  async deleteNote(noteId: string) {
    const { error: paymentsError } = await supabase
      .from('credit_payments')
      .delete()
      .eq('note_id', noteId);

    if (paymentsError) throw paymentsError;

    const { error } = await supabase
      .from('credit_notes')
      .delete()
      .eq('id', noteId);

    if (error) throw error;
  },

  async createCreditNote(input: {
    branch_id: string;
    customer_id: string;
    total: number;
    credit_days_applied: number;
    notes?: string | null;
    inventory_transaction_id?: string | null;
  }) {
    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + Number(input.credit_days_applied || 0));

    const folio = `CR-${input.branch_id}-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, '0')}${String(issueDate.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const payload = {
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      folio,
      issue_date: issueDate.toISOString().slice(0, 10),
      credit_days_applied: input.credit_days_applied,
      due_date: dueDate.toISOString().slice(0, 10),
      total: input.total,
      paid_amount: 0,
      balance: input.total,
      notes: input.notes ?? null,
      inventory_transaction_id: input.inventory_transaction_id ?? null,
    };

    const { data, error } = await supabase
      .from('credit_notes')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditNote;
  },

  async canSellOnCredit(input: {
    customer: CreditCustomer;
    totalVenta: number;
    today?: Date;
  }) {
    const today = input.today ?? new Date();
    const summary = await creditService.getCustomerSummary(input.customer, today);
    const saldo_total = summary.saldo_total_pendiente;
    const disponible = summary.disponible_credito;
    const limite = summary.limite_credito;
    const vencidas = summary.notas_vencidas;

    let allowedCredit = true;
    let reason: 'VENCIDAS' | 'LIMITE' | null = null;

    if (vencidas.length > 0) {
      allowedCredit = false;
      reason = 'VENCIDAS';
    } else if (saldo_total + input.totalVenta > limite) {
      allowedCredit = false;
      reason = 'LIMITE';
    }

    return {
      allowedCredit,
      reason,
      policy: input.customer.policy,
      allowCash: input.customer.allow_cash_if_blocked,
      vencidas,
      saldo_total,
      disponible,
      limite,
    };
  },
};
