import { supabaseVinos, isVinosConfigured } from '../vinosClient';
import { fetchAuditLogs } from '../audit/audit.service';
import type { PriceTier } from './sales.service';

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
  single_price_mode: boolean;
  purchase_cost: number | null;
  price_mid_wholesale_min_qty: number | null;
  price_wholesale_min_qty: number | null;
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

type ProductUomEquivalenceInput = Omit<ProductUomEquivalence, 'product_id' | 'uom'>;

export interface ProductWithStock extends VinosProduct {
  total_stock: number;
  last_purchase_cost: number | null;
}

export type ProductHistoryStatus = 'INGRESO' | 'SALIDA' | 'ACTUALIZACION';

export interface ProductHistoryRow {
  id: string;
  status: ProductHistoryStatus;
  created_at: string;
  qty: number | null;
  unit_price: number | null;
  subtotal: number | null;
  price_type: PriceTier | null;
  profit: number | null;
  source: string;
  detail: string | null;
  stock_before: number | null;
  stock_after: number | null;
}

export interface ProductInsights {
  last_purchase_cost: number | null;
  last_purchase_date: string | null;
  purchased_qty: number;
  purchased_total: number;
  sold_qty: number;
  sold_total: number;
  net_qty: number;
  estimated_profit: number;
  current_stock: number;
  history: ProductHistoryRow[];
}

const asOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

type ProductPurchaseSummaryRow = {
  id: string;
  purchase_date: string;
  created_at: string;
  branch_id: number;
  items: Array<{
    product_id: string;
    cost_per_unit: number;
  }> | null;
};

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
  single_price_mode?: boolean;
  purchase_cost?: number | null;
  price_mid_wholesale_min_qty?: number | null;
  price_wholesale_min_qty?: number | null;
  min_stock?: number;
  image_url?: string | null;
  notes?: string | null;
};

export type UpdateProductInput = Partial<CreateProductInput> & { is_active?: boolean };

export const vinosProductsService = {

  async listWithStock(branchId?: number): Promise<ProductWithStock[]> {
    if (!isVinosConfigured) return [];
    const [productsRes, purchasesRes] = await Promise.all([
      supabaseVinos
        .from('products')
        .select('*, category:categories(id,name), uom:uoms(id,name,symbol), product_stocks(qty, branch_id)')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      supabaseVinos
        .from('purchases')
        .select('id,purchase_date,created_at,branch_id,items:purchase_items(product_id,cost_per_unit)')
        .is('deleted_at', null)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (purchasesRes.error) throw purchasesRes.error;

    const lastPurchaseCostByProduct = new Map<string, number>();
    const purchaseRows = (purchasesRes.data ?? []) as ProductPurchaseSummaryRow[];
    for (const purchase of purchaseRows) {
      if (branchId && purchase.branch_id !== branchId) continue;
      const items = Array.isArray(purchase.items) ? purchase.items : purchase.items ? [purchase.items] : [];
      for (const item of items) {
        if (!lastPurchaseCostByProduct.has(item.product_id)) {
          lastPurchaseCostByProduct.set(item.product_id, Number(item.cost_per_unit ?? 0));
        }
      }
    }

    return (productsRes.data ?? []).map((p: Record<string, unknown>) => {
      const stocks = (p.product_stocks as Array<{ qty: number; branch_id: number }>) ?? [];
      const total = branchId
        ? stocks.filter(s => s.branch_id === branchId).reduce((sum, s) => sum + Number(s.qty || 0), 0)
        : stocks.reduce((sum, s) => sum + Number(s.qty || 0), 0);
      return {
        ...p,
        total_stock: total,
        last_purchase_cost: lastPurchaseCostByProduct.get(String(p.id)) ?? (p.purchase_cost != null ? Number(p.purchase_cost) : null),
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
        single_price_mode: input.single_price_mode ?? false,
        purchase_cost: input.purchase_cost ?? null,
        price_mid_wholesale_min_qty: input.price_mid_wholesale_min_qty ?? null,
        price_wholesale_min_qty: input.price_wholesale_min_qty ?? null,
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

  async setEquivalences(productId: string, rows: ProductUomEquivalenceInput[]): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const normalizedRows = rows.map(r => ({
      id: r.id,
      uom_id: r.uom_id,
      factor_to_base: Number(r.factor_to_base) || 1,
      price_retail: Number(r.price_retail) || 0,
      price_mid_wholesale: Number(r.price_mid_wholesale) || 0,
      price_wholesale: Number(r.price_wholesale) || 0,
    }));

    const seenUoms = new Set<string>();
    for (const row of normalizedRows) {
      if (seenUoms.has(row.uom_id)) {
        throw new Error('No puedes registrar la misma unidad de medida dos veces en el producto.');
      }
      seenUoms.add(row.uom_id);
    }

    const { data: existingRows, error: existingError } = await supabaseVinos
      .from('product_uoms')
      .select('id,uom_id')
      .eq('product_id', productId);
    if (existingError) throw existingError;

    const existing = (existingRows ?? []) as Array<{ id: string; uom_id: string }>;
    const existingById = new Map(existing.map(row => [row.id, row]));
    const existingByUom = new Map(existing.map(row => [row.uom_id, row]));
    const keptIds = new Set<string>();

    for (const row of normalizedRows) {
      const matched = row.id ? existingById.get(row.id) : existingByUom.get(row.uom_id);
      const duplicateTarget = existingByUom.get(row.uom_id);
      if (matched && duplicateTarget && duplicateTarget.id !== matched.id) {
        throw new Error('Ya existe una equivalencia registrada con esa unidad de medida.');
      }

      const payload = {
        product_id: productId,
        uom_id: row.uom_id,
        factor_to_base: row.factor_to_base,
        price_retail: row.price_retail,
        price_mid_wholesale: row.price_mid_wholesale,
        price_wholesale: row.price_wholesale,
      };

      if (matched) {
        const { error } = await supabaseVinos
          .from('product_uoms')
          .update(payload)
          .eq('id', matched.id);
        if (error) throw error;
        keptIds.add(matched.id);
      } else {
        const { data: inserted, error } = await supabaseVinos
          .from('product_uoms')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (inserted?.id) keptIds.add(inserted.id);
      }
    }

    const rowsToDelete = existing.filter(row => !keptIds.has(row.id));
    for (const row of rowsToDelete) {
      const { error } = await supabaseVinos
        .from('product_uoms')
        .delete()
        .eq('id', row.id);
      if (error) {
        if (error.code === '23503') {
          throw new Error('No se puede eliminar una unidad de medida que ya tiene compras o ventas registradas.');
        }
        throw error;
      }
    }
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

  async updateLastPurchaseCost(productId: string, branchId: number, newCost: number): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    if (!Number.isFinite(newCost) || newCost < 0) throw new Error('Costo inválido.');

    const { data, error } = await supabaseVinos
      .from('purchases')
      .select('id,total,purchase_date,created_at,branch_id,items:purchase_items(id,product_id,qty,cost_per_unit,subtotal)')
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;

    type PurchaseCostRow = {
      id: string;
      total: number;
      items: Array<{ id: string; product_id: string; qty: number; cost_per_unit: number; subtotal: number }> | { id: string; product_id: string; qty: number; cost_per_unit: number; subtotal: number } | null;
    };

    let targetPurchase: PurchaseCostRow | null = null;
    let targetItem: { id: string; product_id: string; qty: number; cost_per_unit: number; subtotal: number } | null = null;

    for (const purchase of (data ?? []) as PurchaseCostRow[]) {
      const items = Array.isArray(purchase.items) ? purchase.items : purchase.items ? [purchase.items] : [];
      const item = items.find((row) => row.product_id === productId);
      if (item) {
        targetPurchase = purchase;
        targetItem = item;
        break;
      }
    }

    if (!targetPurchase || !targetItem) {
      const { error: productCostError } = await supabaseVinos
        .from('products')
        .update({ purchase_cost: newCost })
        .eq('id', productId);
      if (productCostError) throw productCostError;
      return;
    }

    const qty = Number(targetItem.qty ?? 0);
    const previousSubtotal = Number(targetItem.subtotal ?? qty * Number(targetItem.cost_per_unit ?? 0));
    const nextSubtotal = qty * newCost;
    const nextTotal = Math.max(0, Number(targetPurchase.total ?? 0) - previousSubtotal + nextSubtotal);

    const { error: itemError } = await supabaseVinos
      .from('purchase_items')
      .update({
        cost_per_unit: newCost,
        subtotal: nextSubtotal,
      })
      .eq('id', targetItem.id);
    if (itemError) throw itemError;

    const { error: purchaseError } = await supabaseVinos
      .from('purchases')
      .update({ total: nextTotal })
      .eq('id', targetPurchase.id);
    if (purchaseError) throw purchaseError;

    const { error: productCostError } = await supabaseVinos
      .from('products')
      .update({ purchase_cost: newCost })
      .eq('id', productId);
    if (productCostError) throw productCostError;
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

  async getProductInsights(productId: string, branchId?: number): Promise<ProductInsights> {
    if (!isVinosConfigured) {
      return {
        last_purchase_cost: null,
        last_purchase_date: null,
        purchased_qty: 0,
        purchased_total: 0,
        sold_qty: 0,
        sold_total: 0,
        net_qty: 0,
        estimated_profit: 0,
        current_stock: 0,
        history: [],
      };
    }

    type PurchaseItemRow = {
      id: string;
      product_id: string;
      qty: number;
      qty_base?: number | null;
      cost_per_unit: number;
      subtotal: number;
      product?: { name: string; sku: string } | { name: string; sku: string }[] | null;
      uom?: { uom?: { name: string; symbol: string | null } | { name: string; symbol: string | null }[] | null } | { uom?: { name: string; symbol: string | null } | { name: string; symbol: string | null }[] | null }[] | null;
    };

    type PurchaseQueryRow = {
      id: string;
      purchase_date: string;
      created_at?: string;
      reference: string | null;
      notes: string | null;
      supplier?: { name: string } | { name: string }[] | null;
      items: PurchaseItemRow[] | PurchaseItemRow | null;
    };

    type SaleItemRow = {
      id: string;
      product_id: string;
      qty: number;
      qty_base?: number | null;
      unit_price: number;
      line_total: number;
      price_type: PriceTier;
      product?: { name: string; sku: string } | { name: string; sku: string }[] | null;
      uom?: { uom?: { name: string; symbol: string | null } | { name: string; symbol: string | null }[] | null } | { uom?: { name: string; symbol: string | null } | { name: string; symbol: string | null }[] | null }[] | null;
    };

    type SaleQueryRow = {
      id: string;
      created_at: string;
      payment_method: string;
      customer?: { name: string } | { name: string }[] | null;
      items: SaleItemRow[] | SaleItemRow | null;
    };

    const purchaseSelect = `
      id,
      purchase_date,
      created_at,
      reference,
      notes,
      supplier:suppliers(name),
      items:purchase_items(
        id,
        product_id,
        qty,
        qty_base,
        cost_per_unit,
        subtotal,
        product:products(name,sku),
        uom:product_uoms(id, uom:uoms(name,symbol))
      )
    `;
    const saleSelect = `
      id,
      created_at,
      payment_method,
      customer:customers(name),
      items:sale_items(
        id,
        product_id,
        qty,
        qty_base,
        unit_price,
        line_total,
        price_type,
        product:products(name,sku),
        uom:product_uoms(id, uom:uoms(name,symbol))
      )
    `;

    let purchaseQuery = supabaseVinos
      .from('purchases')
      .select(purchaseSelect)
      .is('deleted_at', null)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    let saleQuery = supabaseVinos
      .from('sales')
      .select(saleSelect)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (branchId) {
      purchaseQuery = purchaseQuery.eq('branch_id', branchId);
      saleQuery = saleQuery.eq('branch_id', branchId);
    }

    const [purchaseRes, saleRes, auditRes] = await Promise.all([
      purchaseQuery,
      saleQuery,
      fetchAuditLogs({
        module: 'vinos',
        entity_type: 'producto',
        search: productId,
        page: 1,
        page_size: 50,
      }).catch(() => ({ rows: [], total: 0, page: 1, page_size: 0 })),
    ]);

    if (purchaseRes.error) throw purchaseRes.error;
    if (saleRes.error) throw saleRes.error;

    let currentStockQty = 0;
    let stockGapQty = 0;
    const stockQuery = supabaseVinos
      .from('product_stocks')
      .select('qty')
      .eq('product_id', productId);
    if (branchId) stockQuery.eq('branch_id', branchId);
    const { data: stockRows, error: stockError } = await stockQuery;
    if (stockError) throw stockError;
    currentStockQty = (stockRows ?? []).reduce((sum, row) => sum + Number((row as { qty?: number }).qty ?? 0), 0);

    const purchases = (purchaseRes.data ?? []) as PurchaseQueryRow[];
    const sales = (saleRes.data ?? []) as SaleQueryRow[];

    const purchaseRows = purchases.flatMap((purchase) => {
      const supplier = asOne(purchase.supplier);
      const items = (Array.isArray(purchase.items) ? purchase.items : purchase.items ? [purchase.items] : []) as PurchaseItemRow[];
      return items
        .filter((item) => item.product_id === productId)
        .map((item) => {
          const qty = Number(item.qty ?? 0);
          const qtyBase = Number(item.qty_base ?? qty);
          const unitPrice = Number(item.cost_per_unit ?? 0);
          const subtotal = Number(item.subtotal ?? qtyBase * unitPrice);
          const uomWrap = asOne(item.uom);
          const unitName = uomWrap?.uom ? asOne(uomWrap.uom) : null;
          return {
            id: `PUR-${item.id}`,
            status: 'INGRESO' as const,
            created_at: String(purchase.purchase_date ?? purchase.created_at ?? ''),
            qty: qtyBase,
            unit_price: unitPrice,
            subtotal,
            price_type: null,
            profit: null,
            source: `Compra${supplier?.name ? ` · ${supplier.name}` : ''}`,
            detail: [
              purchase.reference ? `Ref: ${purchase.reference}` : null,
              purchase.notes ? purchase.notes : null,
              unitName?.name ? `Unidad: ${unitName.name}` : null,
            ].filter(Boolean).join(' | ') || null,
            stock_before: null,
            stock_after: null,
          } satisfies ProductHistoryRow;
        });
    });

    const saleRows = sales.flatMap((sale) => {
      const customer = asOne(sale.customer);
      const items = (Array.isArray(sale.items) ? sale.items : sale.items ? [sale.items] : []) as SaleItemRow[];
      const saleCode = `V-${String(sale.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      return items
        .filter((item) => item.product_id === productId)
        .map((item) => {
          const qty = Number(item.qty ?? 0);
          const qtyBase = Number(item.qty_base ?? qty);
          const unitPrice = Number(item.unit_price ?? 0);
          const subtotal = Number(item.line_total ?? qtyBase * unitPrice);
          const uomWrap = asOne(item.uom);
          const unitName = uomWrap?.uom ? asOne(uomWrap.uom) : null;
          return {
            id: `SAL-${item.id}`,
            status: 'SALIDA' as const,
            created_at: String(sale.created_at ?? ''),
            qty: qtyBase,
            unit_price: unitPrice,
            subtotal,
            price_type: (item.price_type ?? null) as PriceTier | null,
            profit: null,
            source: `Venta ${saleCode} · ${sale.payment_method ?? ''}${customer?.name ? ` · ${customer.name}` : ''}`,
            detail: [
              `Nota de venta: ${saleCode}`,
              item.price_type ? `Tipo: ${item.price_type}` : null,
              unitName?.name ? `Unidad: ${unitName.name}` : null,
            ].filter(Boolean).join(' | ') || null,
            stock_before: null,
            stock_after: null,
          } satisfies ProductHistoryRow;
        });
    });

    const updateRows = (auditRes.rows ?? [])
      .filter((row) => row.action_type === 'CREAR' || row.action_type === 'ACTUALIZAR')
      .map((row) => {
        const observation = row.observation ?? row.justification ?? null;
        const description = row.description.replace(/\s\[[0-9a-f-]{36}\]/i, '');
        const stockMatch = description.match(/stock ajustado manualmente.*de\s+([\d.]+)\s+a\s+([\d.]+)/i);
        const prevStock = row.previous_data?.stock ?? (stockMatch ? Number(stockMatch[1]) : null);
        const nextStock = row.new_data?.stock ?? (stockMatch ? Number(stockMatch[2]) : null);
        return {
          id: `AUD-${row.log_id}`,
          status: 'ACTUALIZACION' as const,
          created_at: row.timestamp,
          qty: null,
          unit_price: null,
          subtotal: null,
          price_type: null,
          profit: null,
          source: row.action_type === 'CREAR'
            ? 'Alta de catálogo'
            : row.description.toLowerCase().includes('stock ajustado')
              ? 'Ajuste manual de stock'
              : 'Actualización de catálogo',
          detail: [description, observation ? `Obs: ${observation}` : null].filter(Boolean).join(' | ') || null,
          stock_before: typeof prevStock === 'number' ? prevStock : null,
          stock_after: typeof nextStock === 'number' ? nextStock : null,
        } satisfies ProductHistoryRow;
      });

    const sortedPurchaseRows = [...purchaseRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastPurchaseCost = sortedPurchaseRows[0]?.unit_price ?? null;
    const lastPurchaseDate = sortedPurchaseRows[0]?.created_at ?? null;

    const enrichedSaleRows = saleRows.map((row) => ({
      ...row,
      profit: lastPurchaseCost == null ? null : Number(row.qty ?? 0) * (Number(row.unit_price ?? 0) - Number(lastPurchaseCost)),
    }));

    const purchased_qty = purchaseRows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
    const purchased_total = purchaseRows.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
    const sold_qty = saleRows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
    const sold_total = saleRows.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
    const net_qty = purchased_qty - sold_qty;
    const estimated_profit = enrichedSaleRows.reduce((sum, row) => sum + Number(row.profit ?? 0), 0);
    const latestKnownCreatedAt = [...purchaseRows, ...enrichedSaleRows, ...updateRows].reduce((latest, row) => {
      const current = new Date(row.created_at).getTime();
      return Number.isFinite(current) && current > latest ? current : latest;
    }, 0);

    const chronologicalEvents = [...purchaseRows, ...saleRows, ...updateRows]
      .filter((row) => row.status !== 'ACTUALIZACION' || (row.stock_before != null && row.stock_after != null))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const expectedStockQty = chronologicalEvents.reduce((running, row) => {
      if (row.status === 'INGRESO') return running + Number(row.qty ?? 0);
      if (row.status === 'SALIDA') return running - Number(row.qty ?? 0);
      return Number(row.stock_after ?? running);
    }, 0);

    stockGapQty = currentStockQty - expectedStockQty;
    const reconciliationRows = stockGapQty === 0 ? [] : [{
      id: `STOCK-GAP-${productId}-${branchId ?? 'all'}`,
      status: 'ACTUALIZACION' as const,
      created_at: new Date((latestKnownCreatedAt > 0 ? latestKnownCreatedAt : Date.now()) + 1000).toISOString(),
      qty: stockGapQty,
      unit_price: null,
      subtotal: null,
      price_type: null,
      profit: null,
      source: 'Ajuste detectado de inventario',
      detail: `Stock guardado ${currentStockQty} vs movimientos visibles ${expectedStockQty}`,
      stock_before: expectedStockQty,
      stock_after: currentStockQty,
    } satisfies ProductHistoryRow];

    const history = [...purchaseRows, ...enrichedSaleRows, ...updateRows, ...reconciliationRows]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return {
      last_purchase_cost: lastPurchaseCost,
      last_purchase_date: lastPurchaseDate,
      purchased_qty,
      purchased_total,
      sold_qty,
      sold_total,
      net_qty,
      estimated_profit,
      current_stock: currentStockQty,
      history,
    };
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
        .upsert({ product_id: productId, branch_id: branchId, qty: newQty }, { onConflict: 'product_id,branch_id' });
      if (upsertErr) throw upsertErr;
    }
  },

  async generateSku(category?: string): Promise<string> {
    const prefix = (category ?? 'PROD').slice(0, 3).toUpperCase();
    const ts = Date.now().toString().slice(-6);
    return `${prefix}-${ts}`;
  },
};
