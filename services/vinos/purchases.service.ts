import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  product_uom_id: string | null;
  qty: number;
  factor_used: number;
  qty_base: number;
  cost_per_unit: number;
  subtotal: number;
  product?: { id: string; sku: string; name: string } | null;
  uom?: { id: string; name: string; symbol: string | null } | null;
}

export interface PurchaseRow {
  id: string;
  branch_id: number;
  supplier_id: string | null;
  reference: string | null;
  purchase_date: string;
  total: number;
  notes: string | null;
  is_credit: boolean;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  delete_note: string | null;
  supplier?: { id: string; name: string } | null;
  items?: Array<{ id: string; product?: { id: string; name: string } | null }>;
}

export interface PurchaseWithItems extends PurchaseRow {
  items: PurchaseItem[];
}

export interface CartItem {
  product_id: string;
  product_uom_id: string;
  factor_to_base: number;
  qty: number;
  cost_per_unit: number;
  // descriptive
  product_name?: string;
  product_sku?: string;
  uom_name?: string;
}

export interface CreatePurchaseInput {
  branch_id: number;
  supplier_id?: string | null;
  reference?: string | null;
  purchase_date?: string | null;
  notes?: string | null;
  is_credit?: boolean;
  created_by: string;
  items: CartItem[];
}

export interface UpdatePurchaseMetadataInput {
  supplier_id?: string | null;
  reference?: string | null;
  purchase_date: string;
  notes?: string | null;
  is_credit: boolean;
}

export const vinosPurchasesService = {

  async list(branchId?: number, opts?: { search?: string; from?: string; to?: string; supplierId?: string }): Promise<PurchaseRow[]> {
    if (!isVinosConfigured) return [];
    let query = supabaseVinos
      .from('purchases')
      .select('*, supplier:suppliers(id,name), items:purchase_items(id, product:products(id,name))')
      .is('deleted_at', null)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (branchId) query = query.eq('branch_id', branchId);
    if (opts?.from) query = query.gte('purchase_date', opts.from);
    if (opts?.to) query = query.lte('purchase_date', opts.to);
    if (opts?.supplierId) query = query.eq('supplier_id', opts.supplierId);
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as PurchaseRow[];
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      rows = rows.filter(r =>
        (r.reference ?? '').toLowerCase().includes(q) ||
        (r.supplier?.name ?? '').toLowerCase().includes(q) ||
        (r.items ?? []).some(item => (item.product?.name ?? '').toLowerCase().includes(q)) ||
        String(r.total).includes(q)
      );
    }
    return rows;
  },

  async getDetail(id: string): Promise<PurchaseWithItems | null> {
    if (!isVinosConfigured) return null;
    const { data, error } = await supabaseVinos
      .from('purchases')
      .select('*, supplier:suppliers(id,name), items:purchase_items(*, product:products(id,sku,name), uom:product_uoms(id, uom:uoms(id,name,symbol)))')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) return null;
    // flatten uom join
    interface PurchaseItemRaw extends Omit<PurchaseItem, 'uom'> {
      uom?: { id: string; uom?: { id: string; name: string; symbol: string | null } | null } | null;
    }
    const items = (data.items as PurchaseItemRaw[] ?? []).map(it => ({
      ...it,
      uom: it.uom?.uom ?? null,
    })) as PurchaseItem[];
    return { ...data, items } as PurchaseWithItems;
  },

  async create(input: CreatePurchaseInput): Promise<string> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    if (input.items.length === 0) throw new Error('Agrega al menos un producto.');

    const total = input.items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.cost_per_unit)), 0);

    const { data: purchase, error: pErr } = await supabaseVinos
      .from('purchases')
      .insert({
        branch_id: input.branch_id,
        supplier_id: input.supplier_id ?? null,
        reference: input.reference ?? null,
        purchase_date: input.purchase_date ?? new Date().toISOString().slice(0, 10),
        total,
        notes: input.notes ?? null,
        is_credit: input.is_credit ?? false,
        created_by: input.created_by,
      })
      .select('id')
      .single();
    if (pErr) throw pErr;

    const itemsPayload = input.items.map(it => {
      const qtyBase = Number(it.qty) * Number(it.factor_to_base || 1);
      const subtotal = Number(it.qty) * Number(it.cost_per_unit);
      return {
        purchase_id: purchase.id,
        product_id: it.product_id,
        product_uom_id: it.product_uom_id || null,
        qty: it.qty,
        factor_used: it.factor_to_base || 1,
        qty_base: qtyBase,
        cost_per_unit: it.cost_per_unit,
        subtotal,
      };
    });

    const { error: iErr } = await supabaseVinos
      .from('purchase_items')
      .insert(itemsPayload);
    if (iErr) throw iErr;

    return purchase.id as string;
  },

  async softDelete(id: string, deleteNote: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { error } = await supabaseVinos
      .from('purchases')
      .update({ deleted_at: new Date().toISOString(), delete_note: deleteNote })
      .eq('id', id);
    if (error) throw error;
  },

  async updateMetadata(id: string, input: UpdatePurchaseMetadataInput): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { error } = await supabaseVinos
      .from('purchases')
      .update({
        supplier_id: input.supplier_id ?? null,
        reference: input.reference?.trim() || null,
        purchase_date: input.purchase_date,
        notes: input.notes?.trim() || null,
        is_credit: input.is_credit,
      })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw error;
  },
};
