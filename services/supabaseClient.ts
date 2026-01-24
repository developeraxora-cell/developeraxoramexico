// Servicio de Supabase para GRUPO LOPAR
// Cliente configurado para conectar con la base de datos

import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Validar que las variables estén configuradas
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Variables de Supabase no configuradas en .env.local');
    console.error('Por favor configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
}

// Crear cliente de Supabase
const fallbackUrl = 'http://localhost:54321';
const fallbackKey = 'public-anon-key';
export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : fallbackUrl,
    isSupabaseConfigured ? supabaseAnonKey : fallbackKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
    }
);

// ============================================================================
// TIPOS DE DATOS
// ============================================================================

export interface DieselTankDB {
    id: string;
    branch_id: string;
    name: string;
    current_qty: number;
    max_capacity: number;
    created_at: string;
    updated_at: string;
}

export interface VehicleDB {
    id: string;
    plate: string;
    description: string;
    active: boolean;
    branch_id?: string;
    created_at: string;
    updated_at: string;
}

export interface DriverDB {
    id: string;
    name: string;
    license: string;
    active: boolean;
    branch_id?: string;
    created_at: string;
    updated_at: string;
}

export interface DieselLogDB {
    id: string;
    type: 'CARGA' | 'RECEPCION';
    tank_id: string;
    amount: number;
    vehicle_id?: string;
    driver_id?: string;
    odometer_reading?: number;
    supplier?: string;
    invoice_number?: string;
    cost_per_liter?: number;
    total_cost?: number;
    notes?: string;
    user_id: string;
    created_at: string;
    status?: string;
    observacion?: string;
}

export interface ProductDB {
    id: string;
    name: string;
    sku?: string;
    base_unit_id: string;
    price_per_base_unit: number;
}

export interface ProductStockDB {
    product_id: string;
    branch_id: string;
    qty: number;
}

export interface CustomerDB {
    id: string;
    name: string;
    credit_limit: number;
    current_debt: number;
}

export interface SaleDB {
    id: string;
    customer_id?: string;
    total: number;
    payment_method: string;
    branch_id: string;
    user_id: string;
    date: string;
}

export interface ConcreteOrderDB {
    id: string;
    customer_id: string;
    formula_id: string;
    qty_m3: number;
    branch_id: string;
    scheduled_date: string;
    status: string;
    mixer_id?: string;
    total_amount?: number;
}

export interface BranchDB {
    id: number;
    code: string;
    name: string;
    address: string;
    is_active: boolean;
    created_at: string;
}

// ============================================================================
// FUNCIONES DE SUCURSALES
// ============================================================================

export const branchesService = {
    async getAll() {
        const { data, error } = await supabase
            .from('branches')
            .select('id, code, name, address, is_active, created_at')
            .order('id');

        if (error) throw error;
        return data as BranchDB[];
    },
    async create(branch: { code: string; name: string; address: string; is_active?: boolean }) {
        const payload = {
            code: branch.code,
            name: branch.name,
            address: branch.address,
            is_active: branch.is_active ?? true
        };
        const { data, error } = await supabase
            .from('branches')
            .insert([payload])
            .select('id, code, name, address, is_active, created_at')
            .single();

        if (error) throw error;
        return data as BranchDB;
    },
    async updateById(id: number, updates: { code?: string; name?: string; address?: string; is_active?: boolean }) {
        console.log(id, updates);
        const { data, error } = await supabase
            .from('branches')
            .update(updates)
            .eq('id', id)
            .select('id, code, name, address, is_active, created_at')
            .single();

        if (error) throw error;
        return data as BranchDB;
    },
    async updateByCode(code: string, updates: { code?: string; name?: string; address?: string; is_active?: boolean }) {
        const { data, error } = await supabase
            .from('branches')
            .update(updates)
            .eq('code', code)
            .select('id, code, name, address, is_active, created_at')
            .single();

        if (error) throw error;
        return data as BranchDB;
    },
    async deleteById(id: number) {
        const { error } = await supabase
            .from('branches')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },
    async deleteByCode(code: string) {
        const { error } = await supabase
            .from('branches')
            .delete()
            .eq('code', code);

        if (error) throw error;
    }
};

// ============================================================================
// FUNCIONES DE TANQUES
// ============================================================================

export const dieselTanksService = {
    // Obtener todos los tanques
    async getAll() {
        const { data, error } = await supabase
            .from('diesel_tanks')
            .select('*')
            .order('name');

        if (error) throw error;
        return data as DieselTankDB[];
    },

    // Obtener tanques por sucursal
    async getByBranch(branchId: string) {
        const { data, error } = await supabase
            .from('diesel_tanks')
            .select('*')
            .eq('branch_id', branchId)
            .order('name');

        if (error) throw error;
        return data as DieselTankDB[];
    },

    // Crear tanque
    async create(tank: Omit<DieselTankDB, 'id' | 'created_at' | 'updated_at'>) {
        const { data, error } = await supabase
            .from('diesel_tanks')
            .insert([tank])
            .select()
            .single();

        if (error) throw error;
        return data as DieselTankDB;
    },

    // Actualizar tanque
    async update(id: string, updates: Partial<DieselTankDB>) {
        const { data, error } = await supabase
            .from('diesel_tanks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as DieselTankDB;
    },
};

// ============================================================================
// FUNCIONES DE VEHÍCULOS
// ============================================================================

export const vehiclesService = {
    // Obtener todos los vehículos de una sucursal
    async getAll(branchId?: string | string[]) {
        let query = supabase.from('vehicles').select('*');
        if (Array.isArray(branchId)) {
            if (branchId.length > 0) query = query.in('branch_id', branchId);
        } else if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query.order('description');
        if (error) throw error;
        return data as VehicleDB[];
    },

    // Obtener vehículos activos
    async getActive() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('active', true)
            .order('description');

        if (error) throw error;
        return data as VehicleDB[];
    },

    // Crear vehículo
    async create(vehicle: Omit<VehicleDB, 'id' | 'created_at' | 'updated_at'>) {
        const { data, error } = await supabase
            .from('vehicles')
            .insert([vehicle])
            .select()
            .single();

        if (error) throw error;
        return data as VehicleDB;
    },

    // Actualizar vehículo
    async update(id: string, updates: Partial<VehicleDB>) {
        const { data, error } = await supabase
            .from('vehicles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as VehicleDB;
    },

    // Activar/Desactivar vehículo
    async toggleActive(id: string) {
        const { data: vehicle } = await supabase
            .from('vehicles')
            .select('active')
            .eq('id', id)
            .single();

        return this.update(id, { active: !vehicle?.active });
    },
};

// ============================================================================
// FUNCIONES DE CONDUCTORES
// ============================================================================

export const driversService = {
    // Obtener todos los conductores de una sucursal
    async getAll(branchId?: string | string[]) {
        let query = supabase.from('drivers').select('*');
        if (Array.isArray(branchId)) {
            if (branchId.length > 0) query = query.in('branch_id', branchId);
        } else if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query.order('name');
        if (error) throw error;
        return data as DriverDB[];
    },

    // Obtener conductores activos
    async getActive() {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('active', true)
            .order('name');

        if (error) throw error;
        return data as DriverDB[];
    },

    // Crear conductor
    async create(driver: Omit<DriverDB, 'id' | 'created_at' | 'updated_at'>) {
        const { data, error } = await supabase
            .from('drivers')
            .insert([driver])
            .select()
            .single();

        if (error) throw error;
        return data as DriverDB;
    },

    // Actualizar conductor
    async update(id: string, updates: Partial<DriverDB>) {
        const { data, error } = await supabase
            .from('drivers')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as DriverDB;
    },

    // Activar/Desactivar conductor
    async toggleActive(id: string) {
        const { data: driver } = await supabase
            .from('drivers')
            .select('active')
            .eq('id', id)
            .single();

        return this.update(id, { active: !driver?.active });
    },
};

// ============================================================================
// FUNCIONES DE REGISTROS DE DIESEL
// ============================================================================

export const dieselLogsService = {
    // Obtener todos los registros
    async getAll(limit = 100) {
        const { data, error } = await supabase
            .from('diesel_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as DieselLogDB[];
    },

    // Obtener registros por tanque
    async getByTank(tankId: string, limit = 50) {
        const { data, error } = await supabase
            .from('diesel_logs')
            .select('*')
            .eq('tank_id', tankId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as DieselLogDB[];
    },

    // Procesar despacho de diesel (usando función SQL)
    async processDispatch(params: {
        tankId: string;
        vehicleId: string;
        driverId: string;
        amount: number;
        odometer: number;
        userId: string;
        notes?: string;
    }) {
        const { data, error } = await supabase.rpc('process_diesel_dispatch', {
            p_tank_id: params.tankId,
            p_vehicle_id: params.vehicleId,
            p_driver_id: params.driverId,
            p_amount: params.amount,
            p_odometer: params.odometer,
            p_user_id: params.userId,
            p_notes: params.notes || null,
        });

        if (error) throw error;
        return data;
    },

    // Procesar recepción de diesel (usando función SQL)
    async processReception(params: {
        tankId: string;
        amount: number;
        supplier: string;
        costPerLiter: number;
        invoiceNumber: string;
        userId: string;
        notes?: string;
    }) {
        const { data, error } = await supabase.rpc('process_diesel_reception', {
            p_tank_id: params.tankId,
            p_amount: params.amount,
            p_supplier: params.supplier,
            p_cost_per_liter: params.costPerLiter,
            p_invoice_number: params.invoiceNumber,
            p_user_id: params.userId,
            p_notes: params.notes || null,
        });

        if (error) throw error;
        return data;
    },

    // Archivar y eliminar un registro (mantiene historial)
    async archiveLog(params: { logId: string; deletedBy: string }) {
        const { data, error } = await supabase.rpc('archive_diesel_log', {
            p_log_id: params.logId,
        });

        if (error) throw error;
        return data;
    },

    // Marcar registro como eliminado y guardar observacion
    async markDeleted(params: {
        type: string;
        logId: string;
        observation: string;
        userId: string;
        monto: number;
        tankId: string;
    }) {
        // 1) Marcar log como eliminado (ideal: solo si estaba activo)
        const { data: logUpdated, error: logErr } = await supabase
            .from("diesel_logs")
            .update({
                status: false,
                observacion: params.observation?.trim() || null,
            })
            .eq("id", params.logId)
            .eq("status", true) // evita doble descuento si ya estaba en false
            .select("id,status")
            .maybeSingle();

        if (logErr) throw logErr;
        if (!logUpdated) throw new Error("El log no existe o ya estaba eliminado.");

        // 2) Leer qty actual
        const { data: tank, error: readErr } = await supabase
            .from("diesel_tanks")
            .select("current_qty")
            .eq("id", params.tankId)
            .single();

        if (readErr) throw readErr;
        let newQty
        if (params.type === "RECEPCION") {
            newQty = (tank?.current_qty ?? 0) - params.monto;
        } else {
            newQty = (tank?.current_qty ?? 0) + params.monto;
        }
        // opcional: evitar negativos
        if (newQty < 0) throw new Error("No se puede dejar el tanque en negativo.");

        // 3) Actualizar tanque
        const { data: tankUpdated, error: tankErr } = await supabase
            .from("diesel_tanks")
            .update({ current_qty: newQty })
            .eq("id", params.tankId)
            .select()
            .single();

        if (tankErr) throw tankErr;

        return tankUpdated;
    }

};

// ============================================================================
// FUNCIONES DE ANALYTICS
// ============================================================================

export const analyticsService = {
    // Obtener consumo por vehículo
    async getVehicleConsumption() {
        const { data, error } = await supabase
            .from('vehicle_consumption')
            .select('*')
            .limit(10);

        if (error) throw error;
        return data;
    },

    // Obtener resumen de tanques por sucursal
    async getTankSummaryByBranch() {
        const { data, error } = await supabase
            .from('tank_summary_by_branch')
            .select('*');

        if (error) throw error;
        return data;
    },

    // Obtener historial de movimientos
    async getMovementHistory(limit = 50) {
        const { data, error } = await supabase
            .from('diesel_movement_history')
            .select('*')
            .limit(limit);

        if (error) throw error;
        return data;
    },
};

// ============================================================================
// FUNCIONES DE PRODUCTOS Y STOCK
// ============================================================================

export const productsService = {
    async getAll() {
        const { data, error } = await supabase.from('products').select('*, product_stocks(*)');
        if (error) throw error;
        return data;
    },
    async updateStock(productId: string, branchId: string, newQty: number) {
        const { error } = await supabase
            .from('product_stocks')
            .upsert({ product_id: productId, branch_id: branchId, qty: newQty }, { onConflict: 'product_id,branch_id' });
        if (error) throw error;
    }
};

// ============================================================================
// FUNCIONES DE CLIENTES
// ============================================================================

export const customersService = {
    async getAll() {
        const { data, error } = await supabase.from('customers').select('*').order('name');
        if (error) throw error;
        return data as CustomerDB[];
    },
    async updateDebt(id: string, newDebt: number) {
        const { error } = await supabase.from('customers').update({ current_debt: newDebt }).eq('id', id);
        if (error) throw error;
    }
};

// ============================================================================
// FUNCIONES DE POS (VENTAS)
// ============================================================================

export const salesService = {
    async getAll(branchId?: string) {
        let query = supabase.from('sales').select('*, sale_items(*)').order('date', { ascending: false });
        if (branchId) query = query.eq('branch_id', branchId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },
    async create(sale: Omit<SaleDB, 'date'>, items: any[]) {
        const { data, error: saleError } = await supabase.from('sales').insert([sale]).select().single();
        if (saleError) throw saleError;

        const saleItems = items.map(item => ({
            sale_id: data.id,
            product_id: item.productId,
            qty: item.qty,
            unit_id: item.unitId,
            unit_price: item.unitPrice,
            subtotal: item.subtotal
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
        if (itemsError) throw itemsError;
        return data;
    }
};

// ============================================================================
// FUNCIONES DE CONCRETERA
// ============================================================================

export const concreteService = {
    async getOrders(branchId?: string) {
        let query = supabase.from('concrete_orders').select('*').order('scheduled_date', { ascending: false });
        if (branchId) query = query.eq('branch_id', branchId);
        const { data, error } = await query;
        if (error) throw error;
        return data as ConcreteOrderDB[];
    },
    async upsertOrder(order: ConcreteOrderDB) {
        const { data, error } = await supabase.from('concrete_orders').upsert([order]).select().single();
        if (error) throw error;
        return data;
    }
};

// ============================================================================
// SUSCRIPCIONES EN TIEMPO REAL
// ============================================================================

export const subscriptions = {
    // Suscribirse a cambios en tanques
    subscribeTanks(callback: (payload: any) => void) {
        return supabase
            .channel('diesel_tanks_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'diesel_tanks' },
                callback
            )
            .subscribe();
    },

    // Suscribirse a nuevos registros de diesel
    subscribeLogs(callback: (payload: any) => void) {
        return supabase
            .channel('diesel_logs_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'diesel_logs' },
                callback
            )
            .subscribe();
    },

    // Suscripción universal para sincronización
    subscribeAll(table: string, callback: (payload: any) => void) {
        return supabase
            .channel(`${table}_changes`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
            .subscribe();
    }
};

export default supabase;
