import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const supabaseAnonKey = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function validate() {
    console.log('🔍 Validando lógica de despacho...');

    try {
        // 1. Obtener datos necesarios
        const { data: tanks } = await supabase.from('diesel_tanks').select('*').limit(1);
        const { data: vehicles } = await supabase.from('vehicles').select('*').limit(1);
        const { data: drivers } = await supabase.from('drivers').select('*').limit(1);

        if (!tanks?.length || !vehicles?.length || !drivers?.length) {
            console.error('❌ Error: Faltan datos para la prueba.');
            return;
        }

        const tank = tanks[0];
        const vehicle = vehicles[0];
        const driver = drivers[0];

        console.log(`📡 Probando despacho de 5L desde ${tank.name} para ${vehicle.plate}...`);
        console.log(`📉 Cantidad actual: ${tank.current_qty} L`);

        // 2. Ejecutar RPC
        const { data: result, error } = await supabase.rpc('process_diesel_dispatch', {
            p_tank_id: tank.id,
            p_vehicle_id: vehicle.id,
            p_driver_id: driver.id,
            p_amount: 5,
            p_odometer: 1000,
            p_user_id: 'test-validator',
            p_notes: 'Validación automática'
        });

        if (error) {
            console.error('❌ Error en RPC:', error.message);
            if (error.details) console.error('Detalles:', error.details);
        } else {
            console.log(`✅ Despacho exitoso.`);
            console.log(`📈 Nueva cantidad: ${result.new_qty} L`);

            if (result.new_qty === tank.current_qty - 5) {
                console.log('✨ Verificación de inventario: CORRECTA');
            } else {
                console.warn('⚠️ Advertencia: El inventario no coincide con el cálculo esperado.');
            }
        }

    } catch (err) {
        console.error('❌ Error fatal:', err);
    }
}

validate();
