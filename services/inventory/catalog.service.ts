import { supabase } from '../supabaseClient';

export interface Uom {
  id: string;
  code: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  branch_id: string;
  sku: string | null;
  barcode: string;
  name: string;
  precio?: number | null;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  base_uom_id: string;
  is_divisible: boolean;
  attrs: Record<string, unknown> | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
}

export interface ProductUom {
  id: string;
  product_id: string;
  uom_id: string;
  purpose: 'PURCHASE' | 'SALE' | 'BOTH';
  factor_to_base: number;
  is_default_purchase: boolean | null;
  is_default_sale: boolean | null;
  uom?: Uom;
}

export interface BranchProductPrice {
  id: string;
  branch_id: string;
  product_id: string;
  product_uom_id: string;
  price: number;
  currency: string | null;
}

export const catalogService = {
  async listUoms() {
    const { data, error } = await supabase
      .from('uoms')
      .select('id, code, name')
      .order('name');

    if (error) throw error;
    return (data ?? []) as Uom[];
  },

  async listCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');

    if (error) throw error;
    return (data ?? []) as Category[];
  },

  async createCategory(name: string) {
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name }])
      .select('id, name')
      .single();

    if (error) throw error;
    return data as Category;
  },

  async listBrands() {
    const { data, error } = await supabase
      .from('brands')
      .select('id, name')
      .order('name');

    if (error) throw error;
    return (data ?? []) as Brand[];
  },

  async findProductByBarcode(branchId: string, barcode: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('branch_id', branchId)
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as Product | null;
  },

  async listProductsByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('id, branch_id, sku, barcode, name, precio, description, category_id, brand_id, base_uom_id, is_divisible, attrs, is_active, created_at, updated_at')
      .eq('branch_id', branchId)
      .order('name');

    if (error) throw error;
    return (data ?? []) as Product[];
  },

  async updateProductPrice(productId: string, precio: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ precio })
      .eq('id', productId)
      .select('*')
      .single();

    if (error) throw error;
    return data as Product;
  },

  async listStockByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('inventory_stock')
      .select('product_id, qty_base')
      .eq('branch_id', branchId);

    if (error) throw error;
    return (data ?? []) as { product_id: string; qty_base: number }[];
  },

  async deactivateProduct(productId: string) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', productId);

    if (error) throw error;
    return true;
  },

  async deleteProduct(productId: string) {
    const { count, error: countError } = await supabase
      .from('inventory_transaction_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);

    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error('No se puede eliminar: el producto tiene transacciones registradas.');
    }

    const { error: stockError } = await supabase
      .from('inventory_stock')
      .delete()
      .eq('product_id', productId);

    if (stockError) throw stockError;

    const { data: remainingStock, error: remainingError } = await supabase
      .from('inventory_stock')
      .select('branch_id', { count: 'exact' })
      .eq('product_id', productId);

    if (remainingError) throw remainingError;
    if ((remainingStock ?? []).length > 0) {
      throw new Error('No se puede eliminar: aún existe stock en otra sucursal o faltan permisos.');
    }

    const { error: uomError } = await supabase
      .from('product_uoms')
      .delete()
      .eq('product_id', productId);

    if (uomError) throw uomError;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
    return true;
  },

  async getPurchaseUoms(productId: string) {
    const { data, error } = await supabase
      .from('product_uoms')
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .eq('product_id', productId)
      .in('purpose', ['PURCHASE', 'BOTH']);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...row,
      uom: row.uoms as Uom,
    })) as ProductUom[];
  },

  async getDefaultPurchaseUom(productId: string) {
    const { data, error } = await supabase
      .from('product_uoms')
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .eq('product_id', productId)
      .eq('is_default_purchase', true)
      .maybeSingle();

    if (error) throw error;

    if (!data) return null;

    return {
      ...data,
      uom: data.uoms as Uom,
    } as ProductUom;
  },

  async listProductUoms(productId: string) {
    const { data, error } = await supabase
      .from('product_uoms')
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .eq('product_id', productId);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...row,
      uom: row.uoms as Uom,
    })) as ProductUom[];
  },

  async listDefaultSaleUoms(productIds: string[]) {
    if (productIds.length === 0) return [] as ProductUom[];
    const { data, error } = await supabase
      .from('product_uoms')
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .in('product_id', productIds)
      .eq('is_default_sale', true);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...row,
      uom: row.uoms as Uom,
    })) as ProductUom[];
  },

  async setDefaultSaleUom(productId: string, productUomId: string) {
    const { error: clearError } = await supabase
      .from('product_uoms')
      .update({ is_default_sale: false })
      .eq('product_id', productId);

    if (clearError) throw clearError;

    const { data, error } = await supabase
      .from('product_uoms')
      .update({ is_default_sale: true })
      .eq('id', productUomId)
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .single();

    if (error) throw error;

    return {
      ...data,
      uom: data.uoms as Uom,
    } as ProductUom;
  },

  async listDefaultSaleUoms(productIds: string[]) {
    if (productIds.length === 0) return [] as ProductUom[];
    const { data, error } = await supabase
      .from('product_uoms')
      .select('id, product_id, uom_id, purpose, factor_to_base, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .in('product_id', productIds)
      .eq('is_default_sale', true);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...row,
      uom: row.uoms as Uom,
    })) as ProductUom[];
  },

  async listBranchPrices(branchId: string, productUomIds: string[]) {
    if (!branchId || productUomIds.length === 0) return [] as BranchProductPrice[];
    const { data, error } = await supabase
      .from('branch_product_prices')
      .select('id, branch_id, product_id, product_uom_id, price, currency')
      .eq('branch_id', branchId)
      .in('product_uom_id', productUomIds);

    if (error) throw error;
    return (data ?? []) as BranchProductPrice[];
  },
};
