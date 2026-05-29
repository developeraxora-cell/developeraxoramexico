import { supabase } from '../supabaseClient';

export interface ProductionItemInput {
  product_id: number | string;
  product_name: string;
  qty: number;       // ENTRADA del anillo = pareas * peso
  pareas: number;
  peso: number;
}

export interface ProcessProductionInput {
  branch_id: number | string;
  business_unit?: string;
  date: string;                       // YYYY-MM-DD
  responsible: string | null;
  producer: string | null;
  observation: string | null;
  alambon_product_id: number | string | null;
  alambon_name: string | null;
  alambon_used: number;               // SALIDA = suma peso ajustado
  items: ProductionItemInput[];
  created_by: string | null;
}

export interface ProductionOrderRow {
  id: number;
  branch_id: number;
  production_date: string;
  responsible: string | null;
  producer: string | null;
  observation: string | null;
  alambon_used: number;
  created_by: string | null;
  created_at: string;
}

export interface ProductionItemRow {
  id: number;
  production_id: number;
  product_id: number;
  product_name: string | null;
  movement: 'ENTRADA' | 'SALIDA';
  qty: number;
  pareas: number | null;
  peso: number | null;
}

const missingSchemaError = (error: { code?: string; message?: string }) => {
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  if (code === '42883' || message.includes('process_production')) {
    return new Error('Falta la función process_production en la base de datos. Ejecute crear_tablas_produccion.sql.');
  }
  if (code === '42P01' || message.includes('production_orders')) {
    return new Error('Faltan las tablas de producción. Ejecute crear_tablas_produccion.sql.');
  }
  return null;
};

export const productionsService = {
  async process(input: ProcessProductionInput) {
    const { data, error } = await supabase.rpc('process_production', {
      p_branch_id: Number(input.branch_id),
      p_business_unit: input.business_unit ?? 'materiales',
      p_date: input.date,
      p_responsible: input.responsible,
      p_producer: input.producer,
      p_observation: input.observation,
      p_alambon_product_id: input.alambon_product_id !== null ? Number(input.alambon_product_id) : null,
      p_alambon_name: input.alambon_name,
      p_alambon_used: Number(input.alambon_used ?? 0),
      p_items: input.items.map((it) => ({
        product_id: Number(it.product_id),
        product_name: it.product_name,
        qty: Number(it.qty),
        pareas: Number(it.pareas),
        peso: Number(it.peso),
      })),
      p_created_by: input.created_by,
    });

    if (error) {
      const mapped = missingSchemaError(error);
      throw mapped ?? new Error(error.message || 'No se pudo procesar la producción.');
    }
    return Number(Array.isArray(data) ? data[0] : data);
  },

  async listByBranch(branchId: number | string, limit = 100) {
    const { data, error } = await supabase
      .from('production_orders')
      .select('id, branch_id, production_date, responsible, producer, observation, alambon_used, created_by, created_at')
      .eq('branch_id', Number(branchId))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      const mapped = missingSchemaError(error);
      if (mapped) throw mapped;
      throw error;
    }
    return (data ?? []) as ProductionOrderRow[];
  },

  async listMovementsByBranch(branchId: number | string, limit = 1000) {
    const { data, error } = await supabase
      .from('production_items')
      .select('id, production_id, product_id, product_name, movement, qty, pareas, peso, production_orders!inner(branch_id)')
      .eq('production_orders.branch_id', Number(branchId))
      .order('production_id', { ascending: false })
      .order('movement', { ascending: false })
      .limit(limit);

    if (error) {
      const mapped = missingSchemaError(error);
      if (mapped) throw mapped;
      throw error;
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      production_id: r.production_id,
      product_id: r.product_id,
      product_name: r.product_name,
      movement: r.movement,
      qty: Number(r.qty),
      pareas: r.pareas,
      peso: r.peso,
    })) as ProductionItemRow[];
  },

  async listItems(productionId: number) {
    const { data, error } = await supabase
      .from('production_items')
      .select('id, production_id, product_id, product_name, movement, qty, pareas, peso')
      .eq('production_id', productionId)
      .order('movement', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ProductionItemRow[];
  },

  async delete(productionId: number) {
    const { error } = await supabase.from('production_orders').delete().eq('id', productionId);
    if (error) throw error;
  },

  async updateOrder(productionId: number, patch: { production_date?: string; responsible?: string | null; producer?: string | null; observation?: string | null }) {
    const { error } = await supabase.from('production_orders').update(patch).eq('id', productionId);
    if (error) throw error;
  },

  // Actualiza el peso unitario (kg) de un producto (anillo)
  async updatePeso(productId: number | string, peso: number) {
    const { error } = await supabase
      .from('products')
      .update({ peso_unitario: Number(peso) })
      .eq('id', Number(productId));
    if (error) throw error;
  },
};
