import { supabaseVinos as supabase } from '../vinosClient';

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
  async saveCapture(inventoryId: string, items: Array<{
    product_id: string; system_qty: number; physical_qty: number;
    observation: string | null; counted_by: string;
  }>, deleteItemIds: string[]) {
    for (const item of items) {
      if (![item.system_qty, item.physical_qty].every((qty) => Number.isFinite(qty) && qty >= 0
        && qty < 1e12 && Math.abs(qty * 1000 - Math.round(qty * 1000)) < 0.0001)) {
        throw new Error('Las cantidades deben ser positivas o cero, con hasta tres decimales.');
      }
      if (item.system_qty !== item.physical_qty && !item.observation?.trim()) {
        throw new Error('Las diferencias requieren una observacion.');
      }
    }
    const { error } = await supabase.rpc('save_vinos_physical_inventory_capture', {
      p_inventory_id: inventoryId, p_items: items, p_delete_item_ids: deleteItemIds,
    });
    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
  },
  async listInventories(branchId: string) {
    const { data, error } = await supabase
      .from('vinos_physical_inventories')
      .select('*')
      .eq('branch_id', branchId)
      .eq('business_unit', 'vinos')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
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
      business_unit: 'vinos',
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date || null,
      status: input.is_active ? 'ACTIVE' : 'INACTIVE',
      is_active: input.is_active,
      created_by: input.created_by ?? null,
    };

    const { data, error } = await supabase
      .from('vinos_physical_inventories')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
    return data as PhysicalInventory;
  },

  async updateInventoryStatus(inventoryId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('vinos_physical_inventories')
      .update({
        is_active: isActive,
        status: isActive ? 'ACTIVE' : 'INACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryId)
      .select('*')
      .single();

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
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
      .from('vinos_physical_inventories')
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

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
    return data as PhysicalInventory;
  },

  async deleteInventory(inventoryId: string) {
    const { error } = await supabase
      .from('vinos_physical_inventories')
      .delete()
      .eq('id', inventoryId);

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
  },

  async listItems(inventoryId: string) {
    const { data, error } = await supabase
      .from('vinos_physical_inventory_items')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('counted_at', { ascending: false });

    if (error) throw new Error(error.code === '23505' ? 'Ya existe un inventario activo para esta sucursal.' : error.message);
    return (data ?? []) as PhysicalInventoryItem[];
  },

};
