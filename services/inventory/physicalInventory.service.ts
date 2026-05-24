import { supabase } from '../supabaseClient';

export type PhysicalInventoryStatus = 'ACTIVE' | 'INACTIVE';

export interface PhysicalInventory {
  id: string;
  branch_id: string;
  business_unit: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: PhysicalInventoryStatus;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PhysicalInventoryItem {
  id: string;
  inventory_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_barcode: string | null;
  base_uom_id: string | null;
  base_uom_code: string | null;
  system_qty: number;
  physical_qty: number;
  difference_qty: number;
  observation: string | null;
  counted_by: string | null;
  counted_at: string;
  updated_at: string | null;
}

export const physicalInventoryService = {
  async listInventories(branchId: string) {
    const { data, error } = await supabase
      .from('material_physical_inventories')
      .select('*')
      .eq('branch_id', branchId)
      .eq('business_unit', 'materiales')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as PhysicalInventory[];
  },

  async createInventory(input: {
    branch_id: string;
    name: string;
    start_date: string;
    end_date?: string | null;
    is_active: boolean;
    created_by?: string | null;
  }) {
    const payload = {
      branch_id: input.branch_id,
      business_unit: 'materiales',
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date || null,
      status: input.is_active ? 'ACTIVE' : 'INACTIVE',
      is_active: input.is_active,
      created_by: input.created_by ?? null,
    };

    const { data, error } = await supabase
      .from('material_physical_inventories')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data as PhysicalInventory;
  },

  async updateInventoryStatus(inventoryId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('material_physical_inventories')
      .update({
        is_active: isActive,
        status: isActive ? 'ACTIVE' : 'INACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryId)
      .select('*')
      .single();

    if (error) throw error;
    return data as PhysicalInventory;
  },

  async updateInventory(input: {
    id: string;
    name: string;
    start_date: string;
    end_date?: string | null;
    is_active: boolean;
  }) {
    const { data, error } = await supabase
      .from('material_physical_inventories')
      .update({
        name: input.name.trim(),
        start_date: input.start_date,
        end_date: input.end_date || null,
        is_active: input.is_active,
        status: input.is_active ? 'ACTIVE' : 'INACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) throw error;
    return data as PhysicalInventory;
  },

  async deleteInventory(inventoryId: string) {
    const { error } = await supabase
      .from('material_physical_inventories')
      .delete()
      .eq('id', inventoryId);

    if (error) throw error;
  },

  async listItems(inventoryId: string) {
    const { data, error } = await supabase
      .from('material_physical_inventory_items')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('counted_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as PhysicalInventoryItem[];
  },

  async upsertItem(input: {
    inventory_id: string;
    product_id: string;
    product_name: string;
    product_sku?: string | null;
    product_barcode?: string | null;
    base_uom_id?: string | null;
    base_uom_code?: string | null;
    system_qty: number;
    physical_qty: number;
    observation?: string | null;
    counted_by?: string | null;
  }) {
    const systemQty = Number(input.system_qty || 0);
    const physicalQty = Number(input.physical_qty || 0);
    const payload = {
      inventory_id: input.inventory_id,
      product_id: input.product_id,
      product_name: input.product_name,
      product_sku: input.product_sku ?? null,
      product_barcode: input.product_barcode ?? null,
      base_uom_id: input.base_uom_id ?? null,
      base_uom_code: input.base_uom_code ?? null,
      system_qty: systemQty,
      physical_qty: physicalQty,
      difference_qty: physicalQty - systemQty,
      observation: input.observation?.trim() || null,
      counted_by: input.counted_by ?? null,
      counted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('material_physical_inventory_items')
      .upsert(payload, { onConflict: 'inventory_id,product_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data as PhysicalInventoryItem;
  },

  async deleteItem(itemId: string) {
    const { error } = await supabase
      .from('material_physical_inventory_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  },
};
