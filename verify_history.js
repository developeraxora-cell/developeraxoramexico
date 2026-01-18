
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyHistory() {
    console.log("🔍 INICIANDO PRUEBA DE VERIFICACIÓN DE HISTORIAL (NUBE)...");

    // 1. Leer historial actual
    const { data: initialLogs, error: initError } = await supabase
        .from('diesel_logs')
        .select('*');

    if (initError) {
        console.error("❌ Error leyendo historial inicial:", initError.message);
        return;
    }
    console.log(`📊 Registros actuales en la base de datos: ${initialLogs.length}`);

    // 2. Insertar un log de prueba (Simulando una acción real)
    console.log("📝 Intentando escribir un registro de prueba en Supabase...");
    const testLog = {
        tank_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', // ID fake pero válido formato UUID si fuera necesario, pero mejor busco un tanque real
        amount: 123.45,
        type: 'CARGA', // O 'RECEPCION'
        user_id: 'TEST_USER_VERIFICATION',
        notes: 'PRUEBA DE VERIFICACION DE HISTORIAL - ' + new Date().toISOString()
    };

    // Primero necesito IDs reales para pasar las FK
    const { data: tanks } = await supabase.from('diesel_tanks').select('id').limit(1);
    const { data: vehicles } = await supabase.from('vehicles').select('id').limit(1);
    const { data: drivers } = await supabase.from('drivers').select('id').limit(1);

    if (!tanks?.length || !vehicles?.length || !drivers?.length) {
        console.error("❌ No hay datos suficientes (tanques/vehículos/choferes) para probar. Crea registros primero.");
        return;
    }

    testLog.tank_id = tanks[0].id;
    testLog.vehicle_id = vehicles[0].id;
    testLog.driver_id = drivers[0].id;
    testLog.odometer_reading = 10000;

    const { data: insertedLog, error: insertError } = await supabase
        .from('diesel_logs')
        .insert([testLog])
        .select()
        .single();

    if (insertError) {
        console.error("❌ Error escribiendo en la base de datos:", insertError.message);
        return;
    }
    console.log("✅ ¡Registro escrito exitosamente en la nube!");
    console.log(`   ID del Log: ${insertedLog.id}`);
    console.log(`   Nota: ${insertedLog.notes}`);

    // 3. Leer historial nuevamente para confirmar que aparece
    console.log("👀 Leyendo historial nuevamente desde la nube...");
    const { data: finalLogs } = await supabase
        .from('diesel_logs')
        .select('*');

    console.log(`📊 Registros encontrados ahora: ${finalLogs.length}`);

    const found = finalLogs.find(l => l.id === insertedLog.id);

    if (found) {
        console.log("🎉 ÉXITO: El registro de prueba FUE ENCONTRADO en la base de datos.");
        console.log("   Esto confirma que el historial se guarda y se lee de la nube.");
    } else {
        console.error("❌ FALLO: El registro fue escrito pero no se encontró al leer. Algo raro pasa.");
    }

    // 4. Limpieza
    console.log("🧹 Limpiando registro de prueba...");
    await supabase.from('diesel_logs').delete().eq('id', insertedLog.id);
    console.log("✅ Registro de prueba eliminado.");
}

verifyHistory();
