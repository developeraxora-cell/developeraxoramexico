import { supabaseVinos, isVinosConfigured } from '../vinosClient';

export type PriceTier = 'MENUDEO' | 'MEDIO_MAYOREO' | 'MAYOREO';
export type PaymentMethod = 'EFECTIVO' | 'CREDITO' | 'CORTESIA';

export interface SaleCartItem {
  product_id: string;
  product_uom_id: string;
  factor_to_base: number;
  qty: number;
  price_type: PriceTier;
  unit_price: number;
  product_name?: string;
  product_sku?: string;
  uom_name?: string;
}

export interface CreateSaleInput {
  branch_id: number;
  customer_id?: string | null;
  payment_method: PaymentMethod;
  subtotal: number;
  discount_amount: number;
  total: number;
  coupon_code?: string | null;
  promotion_id?: string | null;
  promotion_code?: string | null;
  wallet_used?: number;
  credit_used?: number;
  cash_received?: number;
  notes?: string | null;
  delivery_address?: string | null;
  created_by: string;
  items: SaleCartItem[];
}

export interface Promotion {
  id: string;
  code: string;
  customer_id: string | null;
  discount_percent: number;
  valid_from: string;
  valid_to: string;
  status: 'ACTIVA' | 'USADA' | 'VENCIDA' | 'CANCELADA';
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_purchase: number;
  max_uses: number | null;
  uses: number;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
}

export interface SaleRow {
  id: string;
  branch_id: number;
  customer_id: string | null;
  payment_method: PaymentMethod;
  price_type: PriceTier;
  subtotal: number;
  discount_amount: number;
  total: number;
  coupon_code: string | null;
  wallet_used: number;
  credit_used: number;
  cash_received: number;
  notes: string | null;
  delivery_address: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  delete_note: string | null;
  customer?: { id: string; name: string } | null;
}

export const vinosSalesService = {

  async list(branchId?: number, opts?: { search?: string; from?: string; to?: string; customerId?: string }): Promise<SaleRow[]> {
    if (!isVinosConfigured) return [];
    let query = supabaseVinos
      .from('sales')
      .select('*, customer:customers(id,name), items:sale_items(id)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (branchId) query = query.eq('branch_id', branchId);
    if (opts?.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts?.from) query = query.gte('created_at', `${opts.from}T00:00:00`);
    if (opts?.to) query = query.lte('created_at', `${opts.to}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as SaleRow[];
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      rows = rows.filter(r =>
        (r.customer?.name ?? '').toLowerCase().includes(q) ||
        String(r.total).includes(q) ||
        (r.coupon_code ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return rows;
  },

  async customerCreditBalance(customerId: string): Promise<{ debt: number }> {
    if (!isVinosConfigured) return { debt: 0 };
    const { data, error } = await supabaseVinos
      .from('sales')
      .select('credit_used')
      .eq('customer_id', customerId)
      .eq('payment_method', 'CREDITO')
      .is('deleted_at', null);
    if (error) return { debt: 0 };
    const debt = (data ?? []).reduce((s: number, r: { credit_used: number }) => s + Number(r.credit_used ?? 0), 0);
    return { debt };
  },

  async softDelete(saleId: string, deleteNote: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { error } = await supabaseVinos
      .from('sales')
      .update({ deleted_at: new Date().toISOString(), delete_note: deleteNote })
      .eq('id', saleId);
    if (error) throw error;
  },

  async updatePaymentType(input: {
    saleId: string;
    newType: 'EFECTIVO' | 'CREDITO';
    useWallet: boolean;
    walletAmount: number;
    observation: string;
    actorId?: string;
  }): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');

    // 1. Load sale
    const { data: sale, error: loadErr } = await supabaseVinos
      .from('sales')
      .select('id, customer_id, payment_method, total, credit_used, wallet_used, payment_type_audit')
      .eq('id', input.saleId)
      .single();
    if (loadErr || !sale) throw new Error('Venta no encontrada.');

    const total = Number(sale.total);
    const oldType = sale.payment_method as 'EFECTIVO' | 'CREDITO' | 'CORTESIA';
    const oldCreditUsed = Number(sale.credit_used ?? 0);
    const oldWalletUsed = Number(sale.wallet_used ?? 0);

    // 2. ROLLBACK: solo wallet (credit_limit es fijo; la deuda se recalcula por credit_used)
    if (sale.customer_id && oldWalletUsed > 0) {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance')
        .eq('id', sale.customer_id)
        .single();
      const restoredWallet = Number(cust?.wallet_balance ?? 0) + oldWalletUsed;
      await supabaseVinos
        .from('customers')
        .update({ wallet_balance: restoredWallet, updated_at: new Date().toISOString() })
        .eq('id', sale.customer_id);
      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: sale.customer_id,
        amount: oldWalletUsed,
        type: 'AJUSTE',
        related_sale_id: sale.id,
        notes: `Reverso por edición de tipo de venta`,
        created_by: input.actorId ?? null,
      });
    }

    // 3. Validate new state
    if (input.useWallet && !sale.customer_id) {
      throw new Error('Para usar saldo se requiere cliente vinculado.');
    }
    if (input.newType === 'CREDITO' && !sale.customer_id) {
      throw new Error('Para crédito se requiere cliente vinculado.');
    }

    // Determine wallet amount (clamp)
    let newWalletUsed = 0;
    if (input.useWallet && sale.customer_id) {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance, wallet_enabled')
        .eq('id', sale.customer_id)
        .single();
      if (!cust?.wallet_enabled) throw new Error('Cliente no tiene saldo a favor activo.');
      const available = Number(cust.wallet_balance ?? 0);
      newWalletUsed = Math.min(Math.max(0, Number(input.walletAmount) || 0), available, total);
    }

    const remaining = Math.max(0, total - newWalletUsed);
    let newCreditUsed = 0;

    if (input.newType === 'CREDITO' && sale.customer_id && remaining > 0) {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('credit_limit')
        .eq('id', sale.customer_id)
        .single();
      // Disponible = línea - deuda actual (excluyendo el crédito de esta misma venta)
      const { debt } = await this.customerCreditBalance(sale.customer_id);
      const available = Math.max(0, Number(cust?.credit_limit ?? 0) - (debt - oldCreditUsed));
      if (available < remaining) throw new Error(`Crédito insuficiente. Disponible: $${available.toFixed(2)}`);
      newCreditUsed = remaining;
    }

    // 4. Apply new state — solo wallet (credit_limit es fijo)
    if (sale.customer_id && newWalletUsed > 0) {
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance')
        .eq('id', sale.customer_id)
        .single();
      const newWalletBalance = Math.max(0, Number(cust?.wallet_balance ?? 0) - newWalletUsed);
      await supabaseVinos
        .from('customers')
        .update({ wallet_balance: newWalletBalance, updated_at: new Date().toISOString() })
        .eq('id', sale.customer_id);
      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: sale.customer_id,
        amount: -newWalletUsed,
        type: 'USO',
        related_sale_id: sale.id,
        notes: `Edición de tipo de venta`,
        created_by: input.actorId ?? null,
      });
    }

    // 5. Update sale row — guardar audit en columna separada, NO tocar notes
    const auditEntry = {
      at: new Date().toISOString(),
      from: oldType,
      to: input.newType,
      observation: input.observation.trim(),
      actor: input.actorId ?? null,
      old_wallet_used: oldWalletUsed,
      old_credit_used: oldCreditUsed,
      new_wallet_used: newWalletUsed,
      new_credit_used: newCreditUsed,
    };
    const prevAudit = Array.isArray(sale.payment_type_audit) ? sale.payment_type_audit : [];
    const nextAudit = [...prevAudit, auditEntry];

    const { error: updErr } = await supabaseVinos
      .from('sales')
      .update({
        payment_method: input.newType,
        credit_used: newCreditUsed,
        wallet_used: newWalletUsed,
        payment_type_audit: nextAudit,
      })
      .eq('id', input.saleId);
    if (updErr) throw updErr;
  },

  async create(input: CreateSaleInput): Promise<string> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    if (input.items.length === 0) throw new Error('Agrega al menos un producto.');

    // Determine ticket-level price_type (most frequent in items)
    const tierCount: Record<PriceTier, number> = { MENUDEO: 0, MEDIO_MAYOREO: 0, MAYOREO: 0 };
    input.items.forEach(it => { tierCount[it.price_type] = (tierCount[it.price_type] || 0) + 1; });
    const dominantTier = (Object.keys(tierCount) as PriceTier[]).reduce((a, b) => tierCount[a] >= tierCount[b] ? a : b);

    const { data: sale, error: sErr } = await supabaseVinos
      .from('sales')
      .insert({
        branch_id: input.branch_id,
        customer_id: input.customer_id ?? null,
        payment_method: input.payment_method,
        price_type: dominantTier,
        subtotal: input.subtotal,
        discount_amount: input.discount_amount,
        total: input.total,
        coupon_code: input.coupon_code ?? null,
        promotion_id: input.promotion_id ?? null,
        promotion_code: input.promotion_code ?? null,
        wallet_used: input.wallet_used ?? 0,
        credit_used: input.credit_used ?? 0,
        cash_received: input.cash_received ?? 0,
        notes: input.notes ?? null,
        delivery_address: input.delivery_address ?? null,
        created_by: input.created_by,
      })
      .select('id')
      .single();
    if (sErr) throw sErr;

    const itemsPayload = input.items.map(it => ({
      sale_id: sale.id,
      product_id: it.product_id,
      product_uom_id: it.product_uom_id || null,
      qty: it.qty,
      factor_used: it.factor_to_base || 1,
      qty_base: Number(it.qty) * Number(it.factor_to_base || 1),
      price_type: it.price_type,
      unit_price: it.unit_price,
      line_total: Number(it.qty) * Number(it.unit_price),
    }));

    const { error: iErr } = await supabaseVinos.from('sale_items').insert(itemsPayload);
    if (iErr) throw iErr;

    // Wallet usage
    if (input.wallet_used && input.wallet_used > 0 && input.customer_id) {
      await supabaseVinos.from('customer_wallet_movements').insert({
        customer_id: input.customer_id,
        amount: -Number(input.wallet_used),
        type: 'USO',
        related_sale_id: sale.id,
        notes: `Uso en venta ${sale.id}`,
        created_by: input.created_by,
      });
      // Decrement balance
      const { data: cust } = await supabaseVinos
        .from('customers')
        .select('wallet_balance')
        .eq('id', input.customer_id)
        .single();
      const newBalance = Math.max(0, Number(cust?.wallet_balance ?? 0) - Number(input.wallet_used));
      await supabaseVinos
        .from('customers')
        .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', input.customer_id);
    }

    // El crédito usado se registra en sales.credit_used; la deuda = Σ credit_used - Σ pagos.
    // credit_limit es la línea fija registrada al cliente, no se decrementa.

    // Promotion redemption → marcar USADA
    if (input.promotion_id) {
      await supabaseVinos
        .from('promotions')
        .update({
          status: 'USADA',
          used_at: new Date().toISOString(),
          sale_id: sale.id,
          redeemed_by: input.customer_id ?? null,
        })
        .eq('id', input.promotion_id)
        .eq('status', 'ACTIVA');
    }

    // Coupon usage counter
    if (input.coupon_code) {
      const { data: c } = await supabaseVinos
        .from('coupons')
        .select('id, uses')
        .eq('code', input.coupon_code)
        .single();
      if (c?.id) {
        await supabaseVinos
          .from('coupons')
          .update({ uses: Number(c.uses ?? 0) + 1 })
          .eq('id', c.id);
      }
    }

    return sale.id as string;
  },

  async validateCoupon(code: string, subtotal: number): Promise<{ valid: true; coupon: Coupon; discount: number } | { valid: false; error: string }> {
    if (!isVinosConfigured) return { valid: false, error: 'DB no configurada.' };
    const { data, error } = await supabaseVinos
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return { valid: false, error: 'Cupón no encontrado.' };

    const c = data as Coupon;
    const today = new Date().toISOString().slice(0, 10);
    if (c.valid_from && today < c.valid_from) return { valid: false, error: 'Cupón aún no es válido.' };
    if (c.valid_to && today > c.valid_to) return { valid: false, error: 'Cupón expirado.' };
    if (c.max_uses !== null && c.uses >= c.max_uses) return { valid: false, error: 'Cupón alcanzó usos máximos.' };
    if (subtotal < Number(c.min_purchase ?? 0)) return { valid: false, error: `Mínimo de compra: $${c.min_purchase}` };

    const discount = c.discount_type === 'PERCENT'
      ? (subtotal * Number(c.discount_value)) / 100
      : Number(c.discount_value);

    return { valid: true, coupon: c, discount: Math.min(discount, subtotal) };
  },

  async validatePromotion(code: string, subtotal: number, customerId?: string | null): Promise<{ valid: true; promotion: Promotion; discount: number } | { valid: false; error: string }> {
    if (!isVinosConfigured) return { valid: false, error: 'DB no configurada.' };
    const { data, error } = await supabaseVinos
      .from('promotions')
      .select('id, code, customer_id, discount_percent, valid_from, valid_to, status')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error || !data) return { valid: false, error: 'Promoción no encontrada.' };

    const p = data as Promotion;
    // La promoción solo la puede usar el cliente al que se le otorgó
    if (p.customer_id) {
      if (!customerId) return { valid: false, error: 'Esta promoción pertenece a un cliente. Selecciónalo para usarla.' };
      if (customerId !== p.customer_id) return { valid: false, error: 'Esta promoción pertenece a otro cliente.' };
    }
    if (p.status === 'USADA') return { valid: false, error: 'Esta promoción ya fue utilizada.' };
    if (p.status === 'CANCELADA') return { valid: false, error: 'Promoción cancelada.' };
    if (p.status === 'VENCIDA') return { valid: false, error: 'Promoción vencida.' };

    const today = new Date().toISOString().slice(0, 10);
    if (today < p.valid_from) return { valid: false, error: 'La promoción aún no es válida.' };
    if (today > p.valid_to) return { valid: false, error: 'Promoción vencida.' };

    const discount = (subtotal * Number(p.discount_percent)) / 100;
    return { valid: true, promotion: p, discount: Math.min(discount, subtotal) };
  },

  async listCoupons(): Promise<Coupon[]> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Coupon[];
  },
};
