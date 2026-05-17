import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  rfc: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Uom {
  id: string;
  name: string;
  symbol: string | null;
  sort_order: number;
}

export const vinosCatalogService = {

  // ── Categorías ─────────────────────────────────────────────
  async listCategories(): Promise<Category[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Category[];
  },

  async createCategory(input: { name: string; sort_order?: number }): Promise<Category> {
    const { data, error } = await supabaseVinos
      .from('categories')
      .insert({ name: input.name.trim(), sort_order: input.sort_order ?? 0 })
      .select()
      .single();
    if (error) throw error;
    return data as Category;
  },

  async updateCategory(id: string, input: Partial<Category>): Promise<Category> {
    const { data, error } = await supabaseVinos
      .from('categories')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Category;
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabaseVinos.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Marcas ─────────────────────────────────────────────────
  async listBrands(): Promise<Brand[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('brands')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Brand[];
  },

  async createBrand(name: string): Promise<Brand> {
    const { data, error } = await supabaseVinos
      .from('brands')
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as Brand;
  },

  async deleteBrand(id: string): Promise<void> {
    const { error } = await supabaseVinos.from('brands').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Proveedores ────────────────────────────────────────────
  async listSuppliers(): Promise<Supplier[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Supplier[];
  },

  async createSupplier(input: Omit<Supplier, 'id' | 'created_at' | 'is_active'> & { is_active?: boolean }): Promise<Supplier> {
    const { data, error } = await supabaseVinos
      .from('suppliers')
      .insert({ ...input, is_active: input.is_active ?? true })
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  },

  async updateSupplier(id: string, input: Partial<Supplier>): Promise<Supplier> {
    const { data, error } = await supabaseVinos
      .from('suppliers')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  },

  async deactivateSupplier(id: string): Promise<void> {
    const { error } = await supabaseVinos
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Unidades de medida ─────────────────────────────────────
  async listUoms(): Promise<Uom[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('uoms')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Uom[];
  },

  async createUom(input: { name: string; symbol?: string | null; sort_order?: number }): Promise<Uom> {
    const { data, error } = await supabaseVinos
      .from('uoms')
      .insert({
        name: input.name.trim(),
        symbol: input.symbol?.trim() || null,
        sort_order: input.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Uom;
  },

  async updateUom(id: string, input: { name?: string; symbol?: string | null }): Promise<Uom> {
    const payload: Record<string, unknown> = {};
    if (typeof input.name === 'string') payload.name = input.name.trim();
    if ('symbol' in input) payload.symbol = input.symbol?.trim() || null;
    const { data, error } = await supabaseVinos
      .from('uoms')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Uom;
  },

  async deleteUom(id: string): Promise<void> {
    const { error } = await supabaseVinos.from('uoms').delete().eq('id', id);
    if (error) throw error;
  },
};
