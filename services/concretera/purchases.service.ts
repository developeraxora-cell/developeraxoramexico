import { supabase } from '../supabaseClient';
import type { ProductUom } from './catalog.service';
import { resolveFactorToBase } from '../uomEquivalence';
const concreteDb = supabase;

export interface PurchaseCartItemInput {
  product_id: string;
  product_uom_id: string;
  qty: number;
  unit_price: number;
  barcode_scanned: string;
  factor_to_base?: number;
}

export interface CreatePurchaseInput {
  branch_id: string;
  reference?: string | null;
  notes?: string | null;
  supplier_id?: string | null;
  purchase_date?: string | null;
  is_credit?: boolean;
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
  edad?: string | null;
  rev?: string | null;
  descarga?: string | null;
  created_by: string;
  nombre_cliente?: string | null;
  direccion_cliente?: string | null;
  cartItems: SaleCartItemInput[];
}

export interface DeleteSaleInput {
  sale_id: string;
  deleted_by: string;
  delete_note: string;
}

export interface DeletePurchaseInput {
  purchase_id: string;
  deleted_by: string;
  delete_note: string;
}

export interface CreateProductInput {
  branch_id: string;
  sku: string;
  barcode: string;
  name: string;
  purchase_price: number;
  wholesale_price: number;
  retail_price: number;
  min_stock: number;
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
  wholesale_price?: number;
  retail_price?: number;
  is_default_purchase?: boolean;
  is_default_sale?: boolean;
}

const buildTotalsByProduct = (
  itemsPayload: Array<{
    product_id: string;
    qty_base: number;
  }>
) =>
  itemsPayload.reduce<Record<string, number>>((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] ?? 0) + Number(item.qty_base);
    return acc;
  }, {});

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
    const key = String(uom.uom_id);
    if (!saleByUom.has(key)) {
      saleByUom.set(key, uom);
    }
  });

  const purchaseSaleMatch = saleByUom.get(String(purchaseUom.uom_id));
  if (purchaseSaleMatch) {
    saleByUom.delete(String(purchaseUom.uom_id));
  }

  const payload: Omit<ProductUom, 'id' | 'uom'>[] = [
    {
      product_id: productId,
      uom_id: purchaseUom.uom_id,
      purpose: purchaseSaleMatch ? 'BOTH' : 'PURCHASE',
      factor_to_base: purchaseUom.factor_to_base,
      wholesale_price: purchaseSaleMatch?.wholesale_price ?? purchaseUom.wholesale_price ?? 0,
      retail_price: purchaseSaleMatch?.retail_price ?? purchaseUom.retail_price ?? 0,
      is_default_purchase: true,
      is_default_sale: purchaseSaleMatch?.is_default_sale ?? false,
    },
    ...Array.from(saleByUom.values()).map((uom) => ({
      product_id: productId,
      uom_id: uom.uom_id,
      purpose: uom.purpose,
      factor_to_base: uom.factor_to_base,
      wholesale_price: uom.wholesale_price ?? 0,
      retail_price: uom.retail_price ?? 0,
      is_default_purchase: false,
      is_default_sale: uom.is_default_sale ?? false,
    })),
  ];

  const uniquePayload = payload.filter(
    (item, index, arr) =>
      arr.findIndex((row) => String(row.uom_id) === String(item.uom_id)) === index
  );

  return uniquePayload;
};

const isRlsErrorForTable = (error: unknown, tableName: string) => {
  const payload = error as { code?: string; message?: string };
  const message = String(payload?.message ?? '').toLowerCase();
  return payload?.code === '42501' && message.includes('row-level security policy') && message.includes(tableName.toLowerCase());
};

const cleanupUnusedConcreteProductUoms = async (productId: string, nextUomIds: string[]) => {
  const nextIdsSet = new Set(nextUomIds.map((id) => String(id)));

  const { data: existingRows, error: existingError } = await concreteDb
    .from('concrete_product_uoms')
    .select('id, uom_id')
    .eq('product_id', productId);

  if (existingError) throw existingError;

  const removableUomRowIds = (existingRows ?? [])
    .filter((row) => !nextIdsSet.has(String(row.uom_id)))
    .map((row) => String(row.id));

  if (removableUomRowIds.length === 0) return;

  const { data: referencedRows, error: referenceError } = await concreteDb
    .from('concrete_inventory_transaction_items')
    .select('product_uom_id')
    .in('product_uom_id', removableUomRowIds);

  if (referenceError) throw referenceError;

  const referencedSet = new Set((referencedRows ?? []).map((row) => String(row.product_uom_id)));
  const deletableIds = removableUomRowIds.filter((id) => !referencedSet.has(id));

  if (deletableIds.length === 0) return;

  const { error: deleteError } = await concreteDb
    .from('concrete_product_uoms')
    .delete()
    .in('id', deletableIds);

  if (deleteError) throw deleteError;
};

export const purchasesService = {
  async clearPurchaseHistory(branchId: string) {
    const { data: transactions, error: txError } = await concreteDb
      .from('concrete_inventory_transactions')
      .select('id')
      .eq('branch_id', branchId)
      .eq('type', 'PURCHASE');

    if (txError) throw txError;

    const ids = (transactions ?? []).map((tx) => tx.id);
    if (ids.length === 0) return { deleted: 0 };

    const { error: itemsError } = await concreteDb
      .from('concrete_inventory_transaction_items')
      .delete()
      .in('transaction_id', ids);

    if (itemsError) throw itemsError;

    const { error: txDeleteError } = await concreteDb
      .from('concrete_inventory_transactions')
      .delete()
      .in('id', ids);

    if (txDeleteError) throw txDeleteError;

    return { deleted: ids.length };
  },
  async createPurchase(input: CreatePurchaseInput) {
    const { branch_id, reference, notes, created_by, cartItems, supplier_id, purchase_date, is_credit } = input;

    const { data: transaction, error: txError } = await concreteDb
      .from('concrete_inventory_transactions')
      .insert([
        {
          type: 'PURCHASE',
          branch_id,
          reference: reference || null,
          notes: notes || null,
          supplier_id: supplier_id || null,
          purchase_date: purchase_date || null,
          is_credit: is_credit ?? false,
          created_by,
        },
      ])
      .select('id, created_at')
      .single();

    if (txError) throw txError;

    const uomIds = [...new Set(cartItems.map((item) => item.product_uom_id))];
    const productIds = [...new Set(cartItems.map((item) => item.product_id))];
    const { data: uoms, error: uomError } = await concreteDb
      .from('concrete_product_uoms')
      .select('id, factor_to_base, uom_id, concrete_uoms (code, name)')
      .in('id', uomIds);

    if (uomError) throw uomError;

    const { data: products, error: productError } = await concreteDb
      .from('concrete_products')
      .select('id, base_uom_id')
      .in('id', productIds);

    if (productError) throw productError;

    const baseUomIds = [...new Set((products ?? []).map((row) => row.base_uom_id).filter(Boolean))];
    const { data: baseUoms, error: baseUomError } = await concreteDb
      .from('concrete_uoms')
      .select('id, code, name')
      .in('id', baseUomIds);

    if (baseUomError) throw baseUomError;

    const productMap = new Map<string, { base_uom_id: string | null }>();
    (products ?? []).forEach((row) => productMap.set(String(row.id), { base_uom_id: row.base_uom_id }));

    const baseUomMap = new Map<string, { code: string | null; name: string | null }>();
    (baseUoms ?? []).forEach((row) => {
      baseUomMap.set(String(row.id), { code: row.code ?? null, name: row.name ?? null });
    });

    const uomMap = new Map<
      string,
      {
        factor_to_base: number;
        uom_code: string | null;
        uom_name: string | null;
      }
    >();
    (uoms ?? []).forEach((row: any) => {
      uomMap.set(String(row.id), {
        factor_to_base: Number(row.factor_to_base ?? 1),
        uom_code: row.concrete_uoms?.code ?? null,
        uom_name: row.concrete_uoms?.name ?? null,
      });
    });

    const itemsPayload = cartItems.map((item) => {
      const productMeta = productMap.get(String(item.product_id));
      const baseMeta = productMeta?.base_uom_id ? baseUomMap.get(String(productMeta.base_uom_id)) : undefined;
      const uomMeta = uomMap.get(String(item.product_uom_id));
      const factor_used = Number(item.factor_to_base ?? 0) > 0
        ? Number(item.factor_to_base)
        : resolveFactorToBase({
            configuredFactor: uomMeta?.factor_to_base ?? 1,
            selectedUnitCode: uomMeta?.uom_code,
            selectedUnitName: uomMeta?.uom_name,
            baseUnitCode: baseMeta?.code,
            baseUnitName: baseMeta?.name,
          });
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

    const { error: itemsError } = await concreteDb
      .from('concrete_inventory_transaction_items')
      .insert(itemsPayload);

    if (itemsError) throw itemsError;

    const totalsByProduct = buildTotalsByProduct(itemsPayload);
    const totalsProductIds = Object.keys(totalsByProduct);

    const nowIso = new Date().toISOString();
    if (totalsProductIds.length > 0) {
      const { data: existingRows, error: stockError } = await concreteDb
        .from('concrete_inventory_stock')
        .select('product_id, qty_base')
        .eq('branch_id', branch_id)
        .in('product_id', totalsProductIds);

      if (stockError) throw stockError;

      const existingMap = new Map<string, number>();
      (existingRows ?? []).forEach((row) => {
        existingMap.set(String(row.product_id), Number(row.qty_base ?? 0));
      });

      const stockPayload = totalsProductIds.map((product_id) => ({
        branch_id,
        product_id,
        qty_base: (existingMap.get(product_id) ?? 0) + totalsByProduct[product_id],
        updated_at: nowIso,
      }));

      const { error: upsertError } = await concreteDb
        .from('concrete_inventory_stock')
        .upsert(stockPayload, {
          onConflict: 'branch_id,product_id',
        });

      if (upsertError) throw upsertError;
    }

    return transaction;
  },

  async createSale(input: CreateSaleInput) {
    const { branch_id, reference, notes, edad, rev, descarga, created_by, cartItems, nombre_cliente, direccion_cliente } = input;

    const { data: transaction, error: txError } = await concreteDb
      .from('concrete_inventory_transactions')
      .insert([
        {
          type: 'SALE',
          branch_id,
          reference: reference || null,
          notes: notes || null,
          edad: edad || null,
          rev: rev || null,
          descarga: descarga || null,
          created_by,
          nombre_cliente: nombre_cliente || null,
          direccion_cliente: direccion_cliente || null,
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

    const { error: itemsError } = await concreteDb
      .from('concrete_inventory_transaction_items')
      .insert(itemsPayload);

    if (itemsError) throw itemsError;

    const totalsByProduct = buildTotalsByProduct(itemsPayload);
    const productIds = Object.keys(totalsByProduct);

    const nowIso = new Date().toISOString();
    if (productIds.length > 0) {
      const { data: existingRows, error: stockError } = await concreteDb
        .from('concrete_inventory_stock')
        .select('product_id, qty_base')
        .eq('branch_id', branch_id)
        .in('product_id', productIds);

      if (stockError) throw stockError;

      const existingMap = new Map<string, number>();
      (existingRows ?? []).forEach((row) => {
        existingMap.set(String(row.product_id), Number(row.qty_base ?? 0));
      });

      const stockPayload = productIds.map((product_id) => {
        const currentQty = existingMap.get(product_id) ?? 0;
        const qtyBase = totalsByProduct[product_id];
        if (currentQty < qtyBase) {
          throw new Error('Stock insuficiente para completar la venta.');
        }
        return {
          branch_id,
          product_id,
          qty_base: currentQty - qtyBase,
          updated_at: nowIso,
        };
      });

      const { error: upsertError } = await concreteDb
        .from('concrete_inventory_stock')
        .upsert(stockPayload, {
          onConflict: 'branch_id,product_id',
        });

      if (upsertError) throw upsertError;
    }

    return transaction;
  },

  async deleteSale(input: DeleteSaleInput) {
    const { data, error } = await concreteDb.rpc('delete_concrete_sale', {
      p_sale_id: Number(input.sale_id),
      p_deleted_by: input.deleted_by,
      p_delete_note: input.delete_note,
    });

    if (error) throw error;
    return data;
  },

  async deletePurchase(input: DeletePurchaseInput) {
    const { data, error } = await concreteDb.rpc('delete_concrete_purchase', {
      p_purchase_id: Number(input.purchase_id),
      p_deleted_by: input.deleted_by,
      p_delete_note: input.delete_note,
    });

    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async createProductWithUoms(input: {
    product: CreateProductInput;
    purchaseUom: CreateProductUomInput;
    saleUoms: CreateProductUomInput[];
  }) {
    const { product, purchaseUom, saleUoms } = input;

    const { data: createdProduct, error: productError } = await concreteDb
      .from('concrete_products')
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

    const { data: createdUoms, error: uomError } = await concreteDb
      .from('concrete_product_uoms')
      .upsert(uomsPayload, { onConflict: 'product_id,uom_id' })
      .select('*');

    if (uomError) throw uomError;

    const { error: stockError } = await concreteDb
      .from('concrete_inventory_stock')
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

    const { data: updatedProduct, error: productError } = await concreteDb
      .from('concrete_products')
      .update({
        ...product,
        is_active: true,
      })
      .eq('id', productId)
      .select('*')
      .single();

    if (productError) throw productError;

    let createdUoms: ProductUom[] | null = null;
    try {
      const uomsPayload = buildUomsPayload(productId, purchaseUom, saleUoms);

      const { error: clearDefaultsError } = await concreteDb
        .from('concrete_product_uoms')
        .update({
          is_default_purchase: false,
          is_default_sale: false,
        })
        .eq('product_id', productId);

      if (clearDefaultsError) throw clearDefaultsError;

      const { data, error: uomError } = await concreteDb
        .from('concrete_product_uoms')
        .upsert(uomsPayload, { onConflict: 'product_id,uom_id' })
        .select('*');

      if (uomError) throw uomError;
      createdUoms = (data ?? []) as ProductUom[];

      // No eliminamos UOMs antiguas aqui para no romper FKs historicas
      // (concrete_inventory_transaction_items.product_uom_id).
    } catch (uomSyncError) {
      if (!isRlsErrorForTable(uomSyncError, 'concrete_product_uoms')) {
        throw uomSyncError;
      }
      // Permite guardar cambios del producto aunque RLS bloquee la sincronizacion de UOMs.
      console.warn('RLS bloquea sincronizacion en concrete_product_uoms; se guardaron solo datos del producto.', uomSyncError);
    }

    const purchase =
      (createdUoms ?? []).find((uom) => uom.purpose === 'PURCHASE' || uom.purpose === 'BOTH' || uom.is_default_purchase) ??
      ({
        id: '',
        product_id: productId,
        uom_id: purchaseUom.uom_id,
        purpose: purchaseUom.purpose,
        factor_to_base: purchaseUom.factor_to_base,
        is_default_purchase: true,
        is_default_sale: false,
      } as ProductUom);

    return {
      product: updatedProduct,
      purchaseUom: purchase,
    };
  },
};
