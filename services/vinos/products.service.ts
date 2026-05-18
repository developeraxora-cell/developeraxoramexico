import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface VinosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  uom_id: string | null;
  is_divisible: boolean;
  price_retail: number;
  price_mid_wholesale: number;
  price_wholesale: number;
  min_stock: number;
  image_url: string | null;
  notes: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;

  // joined
  category?: { id: string; name: string } | null;
  uom?: { id: string; name: string; symbol: string | null } | null;
}

export interface ProductUomEquivalence {
  id?: string;
  product_id?: string;
  uom_id: string;
  factor_to_base: number;
  price_retail: number;
  price_mid_wholesale: number;
  price_wholesale: number;
  uom?: { id: string; name: string; symbol: string | null } | null;
}

export interface ProductWithStock extends VinosProduct {
  total_stock: number;
}

export type CreateProductInput = {
  sku?: string;
  name: string;
  category_id?: string | null;
  uom_id?: string | null;
  is_divisible?: boolean;
  barcode?: string | null;
  price_retail: number;
  price_mid_wholesale: number;
  price_wholesale: number;
  min_stock?: number;
  image_url?: string | null;
  notes?: string | null;
};

export type UpdateProductInput = Partial<CreateProductInput> & { is_active?: boolean };

export const vinosProductsService = {

  async listWithStock(branchId?: number): Promise<ProductWithStock[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('products')
      .select('*, category:categories(id,name), uom:uoms(id,name,symbol), product_stocks(qty, branch_id)')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((p: Record<string, unknown>) => {
      const stocks = (p.product_stocks as Array<{ qty: number; branch_id: number }>) ?? [];
      const total = branchId
        ? stocks.filter(s => s.branch_id === branchId).reduce((sum, s) => sum + Number(s.qty || 0), 0)
        : stocks.reduce((sum, s) => sum + Number(s.qty || 0), 0);
      return {
        ...p,
        total_stock: total,
      } as ProductWithStock;
    });
  },

  async create(input: CreateProductInput, branchId: number): Promise<VinosProduct> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');

    const sku = input.sku?.trim().toUpperCase() || await this.generateSku();

    const { data: created, error } = await supabaseVinos
      .from('products')
      .insert({
        sku,
        name: input.name.trim(),
        category_id: input.category_id ?? null,
        uom_id: input.uom_id ?? null,
        is_divisible: input.is_divisible ?? false,
        barcode: input.barcode ?? null,
        price_retail: input.price_retail,
        price_mid_wholesale: input.price_mid_wholesale,
        price_wholesale: input.price_wholesale,
        min_stock: input.min_stock ?? 0,
        image_url: input.image_url ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Stock inicial siempre en 0 (se llena vía compras)
    await supabaseVinos
      .from('product_stocks')
      .insert({ product_id: created.id, branch_id: branchId, qty: 0 });

    return created as VinosProduct;
  },

  async listAllProductUoms(productIds: string[]): Promise<Array<{ id: string; product_id: string; uom_id: string; factor_to_base: number; uom: { id: string; name: string; symbol: string | null } }>> {
    if (!isVinosConfigured || productIds.length === 0) return [];
    const { data, error } = await supabaseVinos
      .from('product_uoms')
      .select('id, product_id, uom_id, factor_to_base, uom:uoms(id,name,symbol)')
      .in('product_id', productIds);
    if (error) throw error;
    interface Row { id: string; product_id: string; uom_id: string; factor_to_base: number; uom: { id: string; name: string; symbol: string | null } | { id: string; name: string; symbol: string | null }[] }
    return (data ?? []).map((r: Row) => ({
      id: r.id,
      product_id: r.product_id,
      uom_id: r.uom_id,
      factor_to_base: Number(r.factor_to_base),
      uom: Array.isArray(r.uom) ? r.uom[0] : r.uom,
    }));
  },

  // ── Equivalencias por unidad de medida ───────────────────
  async listEquivalences(productId: string): Promise<ProductUomEquivalence[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('product_uoms')
      .select('*, uom:uoms(id,name,symbol)')
      .eq('product_id', productId)
      .order('factor_to_base', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProductUomEquivalence[];
  },

  async setEquivalences(productId: string, rows: Omit<ProductUomEquivalence, 'id' | 'product_id' | 'uom'>[]): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    // Borrar todas las existentes
    await supabaseVinos.from('product_uoms').delete().eq('product_id', productId);
    if (rows.length === 0) return;
    const payload = rows.map(r => ({
      product_id: productId,
      uom_id: r.uom_id,
      factor_to_base: r.factor_to_base,
      price_retail: r.price_retail,
      price_mid_wholesale: r.price_mid_wholesale,
      price_wholesale: r.price_wholesale,
    }));
    const { error } = await supabaseVinos.from('product_uoms').insert(payload);
    if (error) throw error;
  },

  async update(id: string, input: UpdateProductInput): Promise<VinosProduct> {
    const payload: Record<string, unknown> = { ...input };
    if (typeof input.sku === 'string') payload.sku = input.sku.trim().toUpperCase();
    if (typeof input.name === 'string') payload.name = input.name.trim();

    const { data, error } = await supabaseVinos
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as VinosProduct;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabaseVinos
      .from('products')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async getStock(productId: string, branchId: number): Promise<number> {
    const { data, error } = await supabaseVinos
      .from('product_stocks')
      .select('qty')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();
    if (error) throw error;
    return Number(data?.qty ?? 0);
  },

  async adjustStock(productId: string, branchId: number, newQty: number, reason: string): Promise<void> {
    const { error } = await supabaseVinos.rpc('adjust_product_stock', {
      p_product_id: productId,
      p_branch_id: branchId,
      p_new_qty: newQty,
      p_reason: reason,
    });
    if (error) {
      // Si la RPC no existe aún, hacer UPSERT directo como fallback
      const { error: upsertErr } = await supabaseVinos
        .from('product_stocks')
        .upsert({ product_id: productId, branch_id: branchId, qty: newQty });
      if (upsertErr) throw upsertErr;
    }
  },

  async generateSku(category?: string): Promise<string> {
    const prefix = (category ?? 'PROD').slice(0, 3).toUpperCase();
    const ts = Date.now().toString().slice(-6);
    return `${prefix}-${ts}`;
  },
};
