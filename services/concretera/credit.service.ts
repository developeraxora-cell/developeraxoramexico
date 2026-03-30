import { supabase } from '../supabaseClient';
const concreteDb = supabase;

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

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string | null;
  address: string;
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface CreditNote {
  id: string;
  branch_id: string;
  customer_id: string;
  folio: string;
  sale_reference?: string | null;
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
const DAY_IN_MS = 1000 * 60 * 60 * 24;

const toDateOnly = (value: string | Date) => {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

const diffDaysInclusive = (issueDate: string, dueDate: string) => {
  const issue = new Date(`${issueDate}T00:00:00Z`);
  const due = new Date(`${dueDate}T00:00:00Z`);
  const diff = Math.round((due.getTime() - issue.getTime()) / DAY_IN_MS);
  return Math.max(1, diff);
};

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
  async listAddressesByCustomer(customerId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CustomerAddress[];
  },

  async addAddress(input: {
    customer_id: string;
    address: string;
    label?: string | null;
    is_default?: boolean;
  }) {
    const { data: existingRows, error: existingError } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .select('id')
      .eq('customer_id', input.customer_id);

    if (existingError) throw existingError;

    const shouldBeDefault = input.is_default ?? (existingRows?.length ?? 0) === 0;
    if (shouldBeDefault) {
      const { error: resetError } = await concreteDb
        .from('concrete_credit_customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', input.customer_id);
      if (resetError) throw resetError;
    }

    const payload = {
      customer_id: input.customer_id,
      address: input.address.trim(),
      label: input.label?.trim() || null,
      is_default: shouldBeDefault,
    };

    const { data, error } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    if (payload.is_default) {
      const { error: customerError } = await concreteDb
        .from('concrete_credit_customers')
        .update({ address: payload.address })
        .eq('id', input.customer_id);
      if (customerError) throw customerError;
    }
    return data as CustomerAddress;
  },

  async updateAddress(addressId: string, input: {
    label?: string | null;
    address: string;
  }) {
    const { data: current, error: currentError } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .select('*')
      .eq('id', addressId)
      .single();

    if (currentError) throw currentError;

    const payload = {
      label: input.label?.trim() || null,
      address: input.address.trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .update(payload)
      .eq('id', addressId)
      .select('*')
      .single();

    if (error) throw error;
    if ((current as CustomerAddress).is_default) {
      const { error: customerError } = await concreteDb
        .from('concrete_credit_customers')
        .update({ address: payload.address })
        .eq('id', (current as CustomerAddress).customer_id);
      if (customerError) throw customerError;
    }

    return data as CustomerAddress;
  },

  async deleteAddress(addressId: string) {
    const { data: current, error: currentError } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .select('*')
      .eq('id', addressId)
      .single();

    if (currentError) throw currentError;

    const customerId = (current as CustomerAddress).customer_id;
    const deletedWasDefault = Boolean((current as CustomerAddress).is_default);

    const { error: deleteError } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .delete()
      .eq('id', addressId);

    if (deleteError) throw deleteError;

    const { data: remainingRows, error: remainingError } = await concreteDb
      .from('concrete_credit_customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (remainingError) throw remainingError;

    const remaining = (remainingRows ?? []) as CustomerAddress[];
    if (remaining.length === 0) {
      const { error: customerError } = await concreteDb
        .from('concrete_credit_customers')
        .update({ address: null })
        .eq('id', customerId);
      if (customerError) throw customerError;
      return;
    }

    let nextDefault = remaining.find((row) => row.is_default) ?? null;
    if (deletedWasDefault || !nextDefault) {
      nextDefault = remaining[0];
      const { error: resetError } = await concreteDb
        .from('concrete_credit_customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', customerId);
      if (resetError) throw resetError;

      const { error: defaultError } = await concreteDb
        .from('concrete_credit_customer_addresses')
        .update({ is_default: true })
        .eq('id', nextDefault.id);
      if (defaultError) throw defaultError;
    }

    const { error: customerError } = await concreteDb
      .from('concrete_credit_customers')
      .update({ address: nextDefault.address })
      .eq('id', customerId);
    if (customerError) throw customerError;
  },

  async listCustomersByBranch(branchId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_customers')
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
    const { data, error } = await concreteDb
      .from('concrete_credit_customers')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,address.ilike.%${escaped}%`)
      .order('name');

    if (error) throw error;
    return (data ?? []) as CreditCustomer[];
  },

  async listCustomersByBranchPaged(branchId: string, page: number, pageSize: number, searchTerm = '', startsWith = '') {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 5;
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    let query = concreteDb
      .from('concrete_credit_customers')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId);

    const term = searchTerm.trim();
    if (term) {
      const escaped = term.replace(/[%_,]/g, '');
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,address.ilike.%${escaped}%`);
    }

    const initial = startsWith.trim();
    if (initial) {
      const escapedInitial = initial.replace(/[%_,]/g, '');
      query = query.ilike('name', `${escapedInitial}%`);
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
    const { data, error } = await concreteDb
      .from('concrete_credit_customers')
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
    if (input.address?.trim()) {
      await concreteDb.from('concrete_credit_customer_addresses').insert([{
        customer_id: data.id,
        address: input.address.trim(),
        label: 'Principal',
        is_default: true,
      }]);
    }
    return data as CreditCustomer;
  },

  async updateCustomer(id: string, updates: Partial<CreditCustomer>) {
    const { data, error } = await concreteDb
      .from('concrete_credit_customers')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    if (Object.prototype.hasOwnProperty.call(updates, 'address')) {
      const nextAddress = String(updates.address ?? '').trim();
      const { data: defaultAddress } = await concreteDb
        .from('concrete_credit_customer_addresses')
        .select('id')
        .eq('customer_id', id)
        .eq('is_default', true)
        .maybeSingle();

      if (nextAddress) {
        if (defaultAddress?.id) {
          await concreteDb
            .from('concrete_credit_customer_addresses')
            .update({ address: nextAddress, label: 'Principal' })
            .eq('id', defaultAddress.id);
        } else {
          await concreteDb.from('concrete_credit_customer_addresses').insert([{
            customer_id: id,
            address: nextAddress,
            label: 'Principal',
            is_default: true,
          }]);
        }
      } else if (defaultAddress?.id) {
        await concreteDb
          .from('concrete_credit_customer_addresses')
          .delete()
          .eq('id', defaultAddress.id);
      }
    }

    return data as CreditCustomer;
  },

  async listNotesByCustomer(customerId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('issue_date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listOpenNotesByCustomer(customerId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .select('*')
      .eq('customer_id', customerId)
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listOpenNotesByBranch(branchId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .select('*')
      .eq('branch_id', branchId)
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  async listPaymentsByNoteIds(noteIds: string[]) {
    if (noteIds.length === 0) return [] as CreditPayment[];

    const { data, error } = await concreteDb
      .from('concrete_credit_payments')
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
    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
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

    const { data, error } = await concreteDb
      .from('concrete_credit_payments')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditPayment;
  },

  async updatePayment(paymentId: string, updates: {
    paid_at?: string;
    amount?: number;
    method?: CreditPaymentMethod;
    reference?: string | null;
    notes?: string | null;
  }) {
    const payload = {
      ...(updates.paid_at ? { paid_at: updates.paid_at } : {}),
      ...(updates.amount !== undefined ? { amount: Number(updates.amount) } : {}),
      ...(updates.method ? { method: updates.method } : {}),
      ...(updates.reference !== undefined ? { reference: updates.reference ?? null } : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes ?? null } : {}),
    };

    const { data, error } = await concreteDb
      .from('concrete_credit_payments')
      .update(payload)
      .eq('id', paymentId)
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditPayment;
  },

  async deletePayment(paymentId: string) {
    const { error } = await concreteDb
      .from('concrete_credit_payments')
      .delete()
      .eq('id', paymentId);

    if (error) throw error;
  },

  async getNoteById(noteId: string) {
    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error) throw error;
    return data as CreditNote;
  },

  async deleteNote(noteId: string) {
    const { error: paymentsError } = await concreteDb
      .from('concrete_credit_payments')
      .delete()
      .eq('note_id', noteId);

    if (paymentsError) throw paymentsError;

    const { error } = await concreteDb
      .from('concrete_credit_notes')
      .delete()
      .eq('id', noteId);

    if (error) throw error;
  },

  async createCreditNote(input: {
    branch_id: string;
    customer_id: string;
    total: number;
    credit_days_applied: number;
    folio?: string | null;
    sale_reference?: string | null;
    issue_date?: string;
    due_date?: string;
    notes?: string | null;
    inventory_transaction_id?: string | null;
  }) {
    const issueDate = input.issue_date ? toDateOnly(input.issue_date) : toDateOnly(new Date());
    const creditDays = Math.max(1, Number(input.credit_days_applied || 0) || 1);
    const dueDate = input.due_date
      ? toDateOnly(input.due_date)
      : toDateOnly(new Date(new Date(`${issueDate}T00:00:00Z`).getTime() + creditDays * DAY_IN_MS));

    const creditDaysApplied = input.due_date ? diffDaysInclusive(issueDate, dueDate) : creditDays;
    const issueDateForFolio = new Date(`${issueDate}T00:00:00Z`);
    const folio = input.folio?.trim()
      || `CR-${input.branch_id}-${issueDateForFolio.getUTCFullYear()}${String(issueDateForFolio.getUTCMonth() + 1).padStart(2, '0')}${String(issueDateForFolio.getUTCDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const payload = {
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      folio,
      sale_reference: input.sale_reference?.trim() || null,
      issue_date: issueDate,
      credit_days_applied: creditDaysApplied,
      due_date: dueDate,
      total: Number(input.total),
      paid_amount: 0,
      balance: Number(input.total),
      notes: input.notes ?? null,
      inventory_transaction_id: input.inventory_transaction_id ?? null,
    };

    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditNote;
  },

  async updateCreditNote(noteId: string, updates: {
    folio?: string | null;
    sale_reference?: string | null;
    issue_date?: string;
    due_date?: string;
    total?: number;
    notes?: string | null;
  }) {
    const current = await creditService.getNoteById(noteId);
    const issueDate = toDateOnly(updates.issue_date ?? current.issue_date);
    const dueDate = toDateOnly(updates.due_date ?? current.due_date);
    const total = Number(updates.total ?? current.total);
    const paidAmount = Number(current.paid_amount ?? 0);

    if (total < paidAmount) {
      throw new Error('El total no puede ser menor al monto ya abonado.');
    }

    const payload = {
      folio: updates.folio?.trim() || current.folio,
      sale_reference: updates.sale_reference?.trim() || null,
      issue_date: issueDate,
      due_date: dueDate,
      credit_days_applied: diffDaysInclusive(issueDate, dueDate),
      total,
      balance: total - paidAmount,
      notes: updates.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await concreteDb
      .from('concrete_credit_notes')
      .update(payload)
      .eq('id', noteId)
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
