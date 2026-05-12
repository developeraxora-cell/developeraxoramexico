import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export type CustomerSelectionModule = 'materials' | 'concretera' | 'transporteria';

type CustomerSelectionRow = {
  id: string;
  module: CustomerSelectionModule;
  branch_id: string;
  customer_id: string;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type SubscribeInput = {
  module: CustomerSelectionModule;
  branchId: string;
  onSelectionChange: (customerId: string, selected: boolean) => void;
};

export const customerSelectionService = {
  async listSelectedCustomerIds(module: CustomerSelectionModule, branchId: string) {
    if (!branchId) return [] as string[];
    const { data, error } = await supabase
      .from('customer_selection_states')
      .select('customer_id')
      .eq('module', module)
      .eq('branch_id', branchId);

    if (error) throw error;
    return (data ?? [])
      .map((row) => String(row.customer_id ?? ''))
      .filter(Boolean);
  },

  async setSelected(input: {
    module: CustomerSelectionModule;
    branchId: string;
    customerId: string;
    selected: boolean;
    updatedBy?: string | null;
    updatedByName?: string | null;
  }) {
    if (!input.branchId || !input.customerId) return;

    if (input.selected) {
      const { error } = await supabase
        .from('customer_selection_states')
        .upsert(
          {
            module: input.module,
            branch_id: input.branchId,
            customer_id: input.customerId,
            updated_by: input.updatedBy ?? null,
            updated_by_name: input.updatedByName ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'module,branch_id,customer_id' }
        );

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('customer_selection_states')
      .delete()
      .eq('module', input.module)
      .eq('branch_id', input.branchId)
      .eq('customer_id', input.customerId);

    if (error) throw error;
  },

  subscribe(input: SubscribeInput) {
    const channel = supabase
      .channel(`customer-selection-states:${input.module}:${input.branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_selection_states' },
        (payload) => {
          const rawRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<CustomerSelectionRow>;
          if (!rawRow) return;
          if (rawRow.module !== input.module) return;
          if (String(rawRow.branch_id ?? '') !== String(input.branchId)) return;
          const customerId = String(rawRow.customer_id ?? '');
          if (!customerId) return;
          input.onSelectionChange(customerId, payload.eventType !== 'DELETE');
        }
      )
      .subscribe();

    return channel;
  },

  unsubscribe(channel: RealtimeChannel | null) {
    if (!channel) return;
    void supabase.removeChannel(channel);
  },
};
