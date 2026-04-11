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

export interface Supplier {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  branch_id: string;
  sku: string | null;
  barcode: string;
  name: string;
  precio?: number | null;
  purchase_price?: number | null;
  wholesale_price?: number | null;
  retail_price?: number | null;
  min_stock?: number | null;
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
  wholesale_price?: number | null;
  retail_price?: number | null;
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

export interface StockAdjustmentInput {
  branch_id: string;
  product_id: string;
  new_qty_base: number;
  reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export interface StockAdjustmentResult {
  previous_qty_base: number;
  new_qty_base: number;
  delta_qty_base: number;
}

export interface ProductMovementRow {
  id: string;
  movement_type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
  created_at: string;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  qty_base: number;
  unit_price: number | null;
  total_amount: number;
  stock_before: number | null;
  stock_after: number | null;
}

export interface ProductMovementSummary {
  purchased_qty_base: number;
  sold_qty_base: number;
  purchased_total: number;
  sold_total: number;
  manual_delta_qty_base: number;
}

export interface ProductMovementHistory {
  summary: ProductMovementSummary;
  rows: ProductMovementRow[];
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

  async createUom(input: { code: string; name: string }) {
    const { data, error } = await supabase
      .from('uoms')
      .insert([
        {
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
        },
      ])
      .select('id, code, name')
      .single();

    if (error) throw error;
    return data as Uom;
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
      .select('id, branch_id, sku, barcode, name, precio, purchase_price, wholesale_price, retail_price, min_stock, description, category_id, brand_id, base_uom_id, is_divisible, attrs, is_active, created_at, updated_at')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data ?? []) as Product[];
  },

  async updateProductPrice(productId: string, retail_price: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ retail_price, precio: retail_price })
      .eq('id', productId)
      .select('*')
      .single();

    if (error) throw error;
    return data as Product;
  },

  async listSuppliersByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, branch_id, name, phone, email, address, is_active, created_at')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data ?? []) as Supplier[];
  },

  async createSupplier(input: {
    branch_id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }) {
    const { data, error } = await supabase
      .from('suppliers')
      .insert([
        {
          branch_id: input.branch_id,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
        },
      ])
      .select('id, branch_id, name, phone, email, address, is_active, created_at')
      .single();

    if (error) throw error;
    return data as Supplier;
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

  async activateProduct(productId: string) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: true })
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
      .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms (id, code, name)')
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
      .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms (id, code, name)')
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
      .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms (id, code, name)')
      .eq('product_id', productId);

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
      .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms (id, code, name)')
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
      .select('id, product_id, uom_id, purpose, factor_to_base, wholesale_price, retail_price, is_default_purchase, is_default_sale, uoms (id, code, name)')
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

  async adjustProductStock(input: StockAdjustmentInput) {
    if (!input.branch_id || !input.product_id) {
      throw new Error('Sucursal o producto inválido para ajuste de stock.');
    }
    if (!Number.isFinite(input.new_qty_base) || input.new_qty_base < 0) {
      throw new Error('El nuevo stock debe ser un número mayor o igual a 0.');
    }

    const { data, error } = await supabase.rpc('adjust_inventory_stock', {
      p_branch_id: Number(input.branch_id),
      p_product_id: Number(input.product_id),
      p_new_qty_base: Number(input.new_qty_base),
      p_reason: input.reason ?? null,
      p_notes: input.notes ?? null,
      p_created_by: input.created_by ?? null,
    });

    if (error) {
      const code = String(error.code ?? '');
      const message = String(error.message ?? '');
      if (code === '42883') {
        throw new Error('Falta la función de ajuste de stock en la base de datos. Ejecute el script SQL de migración.');
      }
      if (code === 'PGRST202' || code === 'PGRST204') {
        throw new Error('No se encontró el endpoint RPC de ajuste de stock. Verifique que la función exista en Supabase.');
      }
      if (message.toLowerCase().includes('adjust_inventory_stock')) {
        throw new Error('No se encontró la función adjust_inventory_stock en la base de datos.');
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      throw new Error('No se pudo confirmar el ajuste de stock.');
    }

    return {
      previous_qty_base: Number(row.previous_qty_base ?? 0),
      new_qty_base: Number(row.new_qty_base ?? 0),
      delta_qty_base: Number(row.delta_qty_base ?? 0),
    } as StockAdjustmentResult;
  },

  async getProductMovementHistory(branchId: string, productId: string, limit = 120) {
    if (!branchId || !productId) {
      return {
        summary: {
          purchased_qty_base: 0,
          sold_qty_base: 0,
          purchased_total: 0,
          sold_total: 0,
          manual_delta_qty_base: 0,
        },
        rows: [],
      } as ProductMovementHistory;
    }

    const safeLimit = Math.max(10, Math.min(limit, 400));

    const { data: txItems, error: txItemsError } = await supabase
      .from('inventory_transaction_items')
      .select(`
        id,
        qty,
        qty_base,
        unit_price,
        inventory_transactions!inner (
          id,
          type,
          is_deleted,
          branch_id,
          reference,
          notes,
          created_by,
          created_at
        )
      `)
      .eq('product_id', productId)
      .eq('inventory_transactions.branch_id', branchId)
      .eq('inventory_transactions.is_deleted', false)
      .in('inventory_transactions.type', ['PURCHASE', 'SALE'])
      .order('created_at', { ascending: false, foreignTable: 'inventory_transactions' })
      .limit(safeLimit);

    if (txItemsError) throw txItemsError;

    const { data: adjustmentsData, error: adjustmentsError } = await supabase
      .from('inventory_stock_adjustments')
      .select('id, previous_qty_base, new_qty_base, delta_qty_base, reason, notes, created_by, created_at')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (adjustmentsError) {
      const code = String(adjustmentsError.code ?? '');
      if (code === '42P01') {
        throw new Error('Falta la tabla inventory_stock_adjustments en la base de datos. Ejecute el script SQL de migración.');
      }
      throw adjustmentsError;
    }

    const summary: ProductMovementSummary = {
      purchased_qty_base: 0,
      sold_qty_base: 0,
      purchased_total: 0,
      sold_total: 0,
      manual_delta_qty_base: 0,
    };

    const transactionRows: ProductMovementRow[] = (txItems ?? []).map((row: any) => {
      const transaction = row.inventory_transactions;
      const txType = transaction?.type === 'SALE' ? 'SALE' : 'PURCHASE';
      const qtyBase = Number(row.qty_base ?? 0);
      const unitPrice = row.unit_price === null || row.unit_price === undefined
        ? null
        : Number(row.unit_price);
      const totalAmount = Number(row.qty ?? 0) * Number(row.unit_price ?? 0);

      if (txType === 'PURCHASE') {
        summary.purchased_qty_base += qtyBase;
        summary.purchased_total += totalAmount;
      } else {
        summary.sold_qty_base += qtyBase;
        summary.sold_total += totalAmount;
      }

      return {
        id: `TX-${row.id}`,
        movement_type: txType,
        created_at: String(transaction?.created_at ?? ''),
        reference: (transaction?.reference as string | null) ?? null,
        notes: (transaction?.notes as string | null) ?? null,
        created_by: (transaction?.created_by as string | null) ?? null,
        qty_base: txType === 'SALE' ? -qtyBase : qtyBase,
        unit_price: unitPrice,
        total_amount: totalAmount,
        stock_before: null,
        stock_after: null,
      };
    });

    const adjustmentRows: ProductMovementRow[] = (adjustmentsData ?? []).map((row: any) => {
      const delta = Number(row.delta_qty_base ?? 0);
      summary.manual_delta_qty_base += delta;

      const detailNotes = [
        row.reason ? `Motivo: ${row.reason}` : null,
        row.notes ? row.notes : null,
      ]
        .filter(Boolean)
        .join(' | ');

      return {
        id: `ADJ-${row.id}`,
        movement_type: 'ADJUSTMENT',
        created_at: String(row.created_at ?? ''),
        reference: 'Ajuste manual',
        notes: detailNotes || null,
        created_by: (row.created_by as string | null) ?? null,
        qty_base: delta,
        unit_price: null,
        total_amount: 0,
        stock_before: Number(row.previous_qty_base ?? 0),
        stock_after: Number(row.new_qty_base ?? 0),
      };
    });

    const rows = [...transactionRows, ...adjustmentRows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, safeLimit);

    return {
      summary,
      rows,
    } as ProductMovementHistory;
  },
};
