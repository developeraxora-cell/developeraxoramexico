import { supabase } from '../supabaseClient';
import type { ProductUom } from './catalog.service';

export interface PurchaseCartItemInput {
  product_id: string;
  product_uom_id: string;
  qty: number;
  unit_price: number;
  barcode_scanned: string;
}

export interface CreatePurchaseInput {
  branch_id: string;
  reference?: string | null;
  notes?: string | null;
  created_by: string;
  cartItems: PurchaseCartItemInput[];
}

export interface SaleCartItemInput {
  product_id: string;
  product_uom_id: string;
  qty: number;
  factor_used: number;
  qty_base: number;
  unit_price: number;
  barcode_scanned?: string | null;
}

export interface CreateSaleInput {
  branch_id: string;
  reference?: string | null;
  notes?: string | null;
  created_by: string;
  nombre_cliente?: string | null;
  cartItems: SaleCartItemInput[];
}

export interface CreateProductInput {
  branch_id: string;
  sku: string;
  barcode: string;
  name: string;
  precio: number;
  description?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  base_uom_id: string;
  is_divisible: boolean;
  attrs?: Record<string, unknown> | null;
}

export interface CreateProductUomInput {
  uom_id: string;
  purpose: 'PURCHASE' | 'SALE' | 'BOTH';
  factor_to_base: number;
  is_default_purchase?: boolean;
  is_default_sale?: boolean;
}

const buildUomsPayload = (
  productId: string,
  purchaseUom: CreateProductUomInput,
  saleUoms: CreateProductUomInput[]
) => {
  if (!purchaseUom || !purchaseUom.uom_id) {
    throw new Error('Unidad de compra inválida.');
  }

  const saleByUom = new Map<string, CreateProductUomInput>();
  saleUoms.forEach((uom) => {
    if (!uom.uom_id) return;
    if (!saleByUom.has(uom.uom_id)) {
      saleByUom.set(uom.uom_id, uom);
    }
  });

  const purchaseSaleMatch = saleByUom.get(purchaseUom.uom_id);
  if (purchaseSaleMatch) {
    saleByUom.delete(purchaseUom.uom_id);
  }

  const payload: Omit<ProductUom, 'id' | 'uom'>[] = [
    {
      product_id: productId,
      uom_id: purchaseUom.uom_id,
      purpose: purchaseSaleMatch ? 'BOTH' : 'PURCHASE',
      factor_to_base: purchaseUom.factor_to_base,
      is_default_purchase: true,
      is_default_sale: purchaseSaleMatch?.is_default_sale ?? false,
    },
    ...Array.from(saleByUom.values()).map((uom) => ({
      product_id: productId,
      uom_id: uom.uom_id,
      purpose: uom.purpose,
      factor_to_base: uom.factor_to_base,
      is_default_purchase: false,
      is_default_sale: uom.is_default_sale ?? false,
    })),
  ];

  return payload;
};

export const purchasesService = {
  async clearPurchaseHistory(branchId: string) {
    const { data: transactions, error: txError } = await supabase
      .from('inventory_transactions')
      .select('id')
      .eq('branch_id', branchId)
      .eq('type', 'PURCHASE');

    if (txError) throw txError;

    const ids = (transactions ?? []).map((tx) => tx.id);
    if (ids.length === 0) return { deleted: 0 };

    const { error: itemsError } = await supabase
      .from('inventory_transaction_items')
      .delete()
      .in('transaction_id', ids);

    if (itemsError) throw itemsError;

    const { error: txDeleteError } = await supabase
      .from('inventory_transactions')
      .delete()
      .in('id', ids);

    if (txDeleteError) throw txDeleteError;

    return { deleted: ids.length };
  },
  async createPurchase(input: CreatePurchaseInput) {
    const { branch_id, reference, notes, created_by, cartItems } = input;

    const { data: transaction, error: txError } = await supabase
      .from('inventory_transactions')
      .insert([
        {
          type: 'PURCHASE',
          branch_id,
          reference: reference || null,
          notes: notes || null,
          created_by,
        },
      ])
      .select('id, created_at')
      .single();

    if (txError) throw txError;

    const uomIds = [...new Set(cartItems.map((item) => item.product_uom_id))];
    const { data: uoms, error: uomError } = await supabase
      .from('product_uoms')
      .select('id, factor_to_base')
      .in('id', uomIds);

    if (uomError) throw uomError;

    const factorMap = new Map<string, number>();
    (uoms ?? []).forEach((row) => factorMap.set(row.id, Number(row.factor_to_base)));

    const itemsPayload = cartItems.map((item) => {
      const factor_used = factorMap.get(item.product_uom_id) ?? 1;
      const qty_base = Number(item.qty) * Number(factor_used);

      return {
        transaction_id: transaction.id,
        product_id: item.product_id,
        product_uom_id: item.product_uom_id,
        qty: item.qty,
        factor_used,
        qty_base,
        unit_price: item.unit_price,
        barcode_scanned: item.barcode_scanned,
      };
    });

    const { error: itemsError } = await supabase
      .from('inventory_transaction_items')
      .insert(itemsPayload);

    if (itemsError) throw itemsError;

    const totalsByProduct = itemsPayload.reduce<Record<string, number>>((acc, item) => {
      acc[item.product_id] = (acc[item.product_id] ?? 0) + Number(item.qty_base);
      return acc;
    }, {});

    const nowIso = new Date().toISOString();

    for (const [product_id, qty_base] of Object.entries(totalsByProduct)) {
      const { data: existing, error: stockError } = await supabase
        .from('inventory_stock')
        .select('qty_base')
        .eq('branch_id', branch_id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (stockError) throw stockError;

      const nextQty = (existing?.qty_base ?? 0) + qty_base;

      const { error: upsertError } = await supabase
        .from('inventory_stock')
        .upsert([
          {
            branch_id,
            product_id,
            qty_base: nextQty,
            updated_at: nowIso,
          },
        ], {
          onConflict: 'branch_id,product_id',
        });

      if (upsertError) throw upsertError;
    }

    return transaction;
  },

  async createSale(input: CreateSaleInput) {
    const { branch_id, reference, notes, created_by, cartItems, nombre_cliente } = input;

    const { data: transaction, error: txError } = await supabase
      .from('inventory_transactions')
      .insert([
        {
          type: 'SALE',
          branch_id,
          reference: reference || null,
          notes: notes || null,
          created_by,
          nombre_cliente: nombre_cliente || null,
        },
      ])
      .select('id, created_at')
      .single();

    if (txError) throw txError;

    const itemsPayload = cartItems.map((item) => ({
      transaction_id: transaction.id,
      product_id: item.product_id,
      product_uom_id: item.product_uom_id,
      qty: item.qty,
      factor_used: item.factor_used,
      qty_base: item.qty_base,
      unit_price: item.unit_price,
      barcode_scanned: item.barcode_scanned ?? null,
    }));

    const { error: itemsError } = await supabase
      .from('inventory_transaction_items')
      .insert(itemsPayload);

    if (itemsError) throw itemsError;

    const totalsByProduct = itemsPayload.reduce<Record<string, number>>((acc, item) => {
      acc[item.product_id] = (acc[item.product_id] ?? 0) + Number(item.qty_base);
      return acc;
    }, {});

    const nowIso = new Date().toISOString();

    for (const [product_id, qty_base] of Object.entries(totalsByProduct)) {
      const { data: existing, error: stockError } = await supabase
        .from('inventory_stock')
        .select('qty_base')
        .eq('branch_id', branch_id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (stockError) throw stockError;

      const currentQty = Number(existing?.qty_base ?? 0);
      if (currentQty < qty_base) {
        throw new Error('Stock insuficiente para completar la venta.');
      }

      const nextQty = currentQty - qty_base;

      const { error: upsertError } = await supabase
        .from('inventory_stock')
        .upsert([
          {
            branch_id,
            product_id,
            qty_base: nextQty,
            updated_at: nowIso,
          },
        ], {
          onConflict: 'branch_id,product_id',
        });

      if (upsertError) throw upsertError;
    }

    return transaction;
  },

  async createProductWithUoms(input: {
    product: CreateProductInput;
    purchaseUom: CreateProductUomInput;
    saleUoms: CreateProductUomInput[];
  }) {
    const { product, purchaseUom, saleUoms } = input;

    const { data: createdProduct, error: productError } = await supabase
      .from('products')
      .insert([
        {
          ...product,
          is_active: true,
        },
      ])
      .select('*')
      .single();

    if (productError) throw productError;

    const uomsPayload = buildUomsPayload(createdProduct.id, purchaseUom, saleUoms);

    const { data: createdUoms, error: uomError } = await supabase
      .from('product_uoms')
      .insert(uomsPayload)
      .select('*');

    if (uomError) throw uomError;

    const { error: stockError } = await supabase
      .from('inventory_stock')
      .upsert([
        {
          branch_id: product.branch_id,
          product_id: createdProduct.id,
          qty_base: 0,
          updated_at: new Date().toISOString(),
        },
      ], {
        onConflict: 'branch_id,product_id',
      });

    if (stockError) throw stockError;

    const purchase = (createdUoms ?? []).find(
      (uom) => uom.purpose === 'PURCHASE' || uom.purpose === 'BOTH' || uom.is_default_purchase
    );

    return {
      product: createdProduct,
      purchaseUom: purchase as ProductUom,
    };
  },

  async updateProductWithUoms(input: {
    productId: string;
    product: CreateProductInput;
    purchaseUom: CreateProductUomInput;
    saleUoms: CreateProductUomInput[];
  }) {
    const { productId, product, purchaseUom, saleUoms } = input;

    const { data: updatedProduct, error: productError } = await supabase
      .from('products')
      .update({
        ...product,
        is_active: true,
      })
      .eq('id', productId)
      .select('*')
      .single();

    if (productError) throw productError;

    const { error: deleteError } = await supabase
      .from('product_uoms')
      .delete()
      .eq('product_id', productId);

    if (deleteError) throw deleteError;

    const uomsPayload = buildUomsPayload(productId, purchaseUom, saleUoms);

    const { data: createdUoms, error: uomError } = await supabase
      .from('product_uoms')
      .insert(uomsPayload)
      .select('*');

    if (uomError) throw uomError;

    const purchase = (createdUoms ?? []).find(
      (uom) => uom.purpose === 'PURCHASE' || uom.purpose === 'BOTH' || uom.is_default_purchase
    );

    return {
      product: updatedProduct,
      purchaseUom: purchase as ProductUom,
    };
  },
};
