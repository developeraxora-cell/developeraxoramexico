import { supabaseVinos } from '../vinosClient';
import { auditService } from '../audit/audit.service';

export interface ConsumptionItem {
  id: string; product_id: string; product_uom_id: string;
  product_name: string; qty_out: number; qty_returned: number;
  unit_price: number;
}
export interface Consumption {
  id: string; folio: number; branch_id: number; customer_id: string;
  customer_name: string; due_date: string; created_at: string;
  settled_at: string | null; status: 'OPEN' | 'SETTLED' | 'CANCELLED';
  price_type: string; payment_method: string | null; sale_id: string | null;
  total: number; items: ConsumptionItem[]; cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string | null;
}
export interface ConsumptionCredit {
  credit_limit: number; debt: number; available: number;
  overdue: boolean; unknown_due_dates: boolean; credit_days: number | null;
  overdue_consumption: boolean;
}
export const mexicoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const consumptionState = (row: Consumption, today = mexicoToday()) => row.status === 'SETTLED'
  ? 'Liquidado' : row.status === 'CANCELLED' ? 'Cancelado' : row.due_date < today ? 'Vencido' : row.due_date === today ? 'Vence hoy' : 'En consumo';
export const consumptionFolio = (n: number) => `CON-${String(n).padStart(5, '0')}`;

export const consumptionService = {
  async list(branchId: number): Promise<Consumption[]> {
    const rows: Consumption[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabaseVinos.from('vinos_consumptions')
        .select('*, items:vinos_consumption_items(*)').eq('branch_id', branchId)
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 199);
      if (error) throw new Error(error.message);
      rows.push(...data as Consumption[]);
      if (data.length < 200) return rows;
    }
  },
  async credit(customerId: string): Promise<ConsumptionCredit> {
    const { data, error } = await supabaseVinos.rpc('vinos_consumption_credit', { p_customer_id: customerId });
    if (error) throw new Error(error.message);
    return data;
  },
  async outstanding(branchId: number): Promise<Record<string, number>> {
    const { data, error } = await supabaseVinos.rpc('vinos_consumption_outstanding', { p_branch_id: branchId });
    if (error) throw new Error(error.message);
    return Object.fromEntries((data ?? []).map((r: { product_id: string; qty: number }) => [r.product_id, Number(r.qty)]));
  },
  async create(input: { id: string; branch_id: number; customer_id: string; due_date: string; actor_id: string; price_type: string;
    items: Array<{ product_id: string; qty: number; unit_price: number }> }): Promise<string> {
    const { data, error } = await supabaseVinos.rpc('create_vinos_consumption', { p_input: input });
    if (error) throw new Error(error.message);
    return data;
  },
  async settle(id: string, actorId: string, payment: string, returned: Array<{ id: string; qty: number }>): Promise<string | null> {
    const { data, error } = await supabaseVinos.rpc('settle_vinos_consumption', {
      p_id: id, p_actor_id: actorId, p_payment: payment, p_returns: returned,
    });
    if (error) throw new Error(error.message);
    return data;
  },
  async cancel(input: { consumption: Consumption; actorId: string; actorName: string; branchCode: string; branchName: string; reason: string }): Promise<void> {
    const reason = input.reason.trim();
    if (!reason) throw new Error('La observación es obligatoria.');
    const row = input.consumption;
    try {
      const recorded = await auditService.writeRequired({
        branch_id: String(row.branch_id), branch_name: input.branchName,
        user_id: input.actorId, user_name: input.actorName,
        action_type: 'ELIMINAR', module: 'vinos', entity_type: 'inventario', entity_id: row.id,
        description: `Eliminación de salida a consumo ${consumptionFolio(row.folio)} (${row.customer_name})`,
        justification: reason,
        previous_data: { id: row.id, folio: consumptionFolio(row.folio), customer_name: row.customer_name, status: row.status },
        new_data: { deletion_stage: 'AUTHORIZED', observation: reason },
      });
      if (!recorded) throw new Error('La API no confirmó el registro.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo registrar la observación.';
      throw new Error(`El consumo no fue eliminado. ${detail}`);
    }
    const { error } = await supabaseVinos.rpc('cancel_vinos_consumption', {
      p_id: row.id, p_actor_id: input.actorId, p_reason: reason,
    });
    if (error) throw new Error(`La observación quedó en Auditoría, pero el consumo no se eliminó: ${error.message}`);
  },
};
