// Servicio de Supabase para FerrePOS
// Cliente configurado para conectar con la base de datos

import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validar que las variables estén configuradas
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Variables de Supabase no configuradas en .env.local');
    console.error('Por favor configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
}

// Crear cliente de Supabase
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});

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
    created_at: string;
    updated_at: string;
}

export interface DriverDB {
    id: string;
    name: string;
    license: string;
    active: boolean;
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
}

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
    // Obtener todos los vehículos
    async getAll() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .order('description');

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
    // Obtener todos los conductores
    async getAll() {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .order('name');

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
};

export default supabase;
