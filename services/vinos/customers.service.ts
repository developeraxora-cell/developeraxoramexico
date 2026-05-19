import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export type LoyaltyLevel = 'BRONCE' | 'PLATA' | 'ORO' | 'BLACK';
export type CustomerStatus = 'ACTIVO' | 'DORMIDO' | 'EN_RIESGO' | 'PERDIDO';
export type CustomerType = 'vino' | 'whisky' | 'cerveza_artesanal' | 'tequila' | 'premium' | 'fiesta_eventos';

export interface CustomerDocument {
  id: string;
  customer_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_kb: number | null;
  description: string | null;
  cloudinary_public_id: string | null;
  cloudinary_resource_type: string | null;
  uploaded_at: string;
}

export interface VinosCustomer {
  id: string;
  branch_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  gender: 'M' | 'F' | 'OTRO' | null;
  customer_types: CustomerType[];
  tags: string[];
  status: CustomerStatus;
  taste_profile: Record<string, unknown>;
  preferred_payment_method: string | null;
  notes: string | null;
  credit_limit: number;
  wallet_enabled: boolean;
  wallet_balance: number;
  avg_ticket: number;
  avg_days_between_purchases: number;
  last_purchase_date: string | null;
  total_purchase_count: number;
  total_spent: number;
  ltv: number;
  loyalty_level: LoyaltyLevel;
  loyalty_points: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateCustomerInput = Pick<VinosCustomer, 'branch_id' | 'name'> & {
  customer_types?: CustomerType[];
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  notes?: string | null;
  credit_limit?: number;
  wallet_enabled?: boolean;
  wallet_balance?: number;
};

export type UpdateCustomerInput = Partial<Omit<VinosCustomer, 'id' | 'created_at' | 'updated_at'>>;

export interface NewDocumentInput {
  file_name: string;
  file_url: string;
  description?: string;
  file_type?: string;
  file_size_kb?: number;
  cloudinary_public_id?: string;
  cloudinary_resource_type?: string;
}

export const vinosCustomersService = {
  async getBranchId(branchCode: string): Promise<number | null> {
    if (!isVinosConfigured) return null;
    const { data, error } = await supabaseVinos
      .from('branches')
      .select('id')
      .eq('code', branchCode)
      .single();
    if (error || !data) return null;
    return data.id as number;
  },

  async getAll(branchId?: number): Promise<VinosCustomer[]> {
    if (!isVinosConfigured) return [];
    let query = supabaseVinos
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as VinosCustomer[];
  },

  async create(input: CreateCustomerInput): Promise<VinosCustomer> {
    if (!isVinosConfigured) throw new Error('Vinos DB not configured');
    const { data, error } = await supabaseVinos
      .from('customers')
      .insert(input)
      .select()
      .single();
    if (error) throw error;

    // Si tiene saldo inicial > 0, registrar movimiento APERTURA
    const initialWallet = Number(input.wallet_balance ?? 0);
    if (input.wallet_enabled && initialWallet > 0) {
      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: data.id,
        amount: initialWallet,
        type: 'APERTURA',
        notes: 'Apertura de saldo al crear cliente',
      });
    }

    return data as VinosCustomer;
  },

  async update(id: string, input: UpdateCustomerInput): Promise<VinosCustomer> {
    if (!isVinosConfigured) throw new Error('Vinos DB not configured');
    const { data, error } = await supabaseVinos
      .from('customers')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as VinosCustomer;
  },

  async deactivate(id: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('Vinos DB not configured');
    const { error } = await supabaseVinos
      .from('customers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async listDocuments(customerId: string): Promise<CustomerDocument[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('customer_documents')
      .select('*')
      .eq('customer_id', customerId)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CustomerDocument[];
  },

  async addDocuments(customerId: string, docs: NewDocumentInput[]): Promise<void> {
    if (!isVinosConfigured) throw new Error('Vinos DB not configured');
    if (docs.length === 0) return;
    const rows = docs.map(d => ({
      customer_id: customerId,
      file_name: d.file_name,
      file_url: d.file_url,
      description: d.description ?? null,
      file_type: d.file_type ?? null,
      file_size_kb: d.file_size_kb ?? null,
      cloudinary_public_id: d.cloudinary_public_id ?? null,
      cloudinary_resource_type: d.cloudinary_resource_type ?? null,
    }));
    const { error } = await supabaseVinos.from('customer_documents').insert(rows);
    if (error) throw error;
  },

  async deleteDocument(docId: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('Vinos DB not configured');
    const { error } = await supabaseVinos.from('customer_documents').delete().eq('id', docId);
    if (error) throw error;
  },
};
