
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function diagnoseVisibility() {
    console.log("🕵️‍♂️ INICIANDO DIAGNÓSTICO DE VISIBILIDAD DE DATOS...");
    console.log("-----------------------------------------------------");

    // 1. Verificar Tanques y sus Sucursales
    console.log("📦 BUSCANDO TANQUES EN BASE DE DATOS...");
    const { data: tanks, error: tankError } = await supabase
        .from('diesel_tanks')
        .select('*');

    if (tankError) {
        console.error("❌ Error leyendo tanques:", tankError.message);
    } else {
        console.log(`✅ Se encontraron ${tanks.length} tanques en TOTAL.`);
        if (tanks.length === 0) {
            console.warn("⚠️  ALERTA: No hay ningún tanque creado. Si no hay tanques, no puedes ver nada en la pantalla.");
        } else {
            console.table(tanks.map(t => ({
                Nombre: t.name,
                ID_Sucursal: t.branch_id,
                Nivel_Actual: t.current_qty
            })));
        }
    }
    console.log("\n");

    // 2. Verificar Logs recientes
    console.log("📋 BUSCANDO ÚLTIMOS 10 MOVIMIENTOS (LOGS)...");
    const { data: logs, error: logError } = await supabase
        .from('diesel_logs')
        .select('*, diesel_tanks(name, branch_id)')
        .order('created_at', { ascending: false })
        .limit(10);

    if (logError) {
        console.error("❌ Error leyendo logs:", logError.message);
    } else {
        console.log(`✅ Se encontraron ${logs.length} logs recientes.`);
        if (logs.length > 0) {
            console.log("   Muestrario de logs y a qué sucursal pertenecen:");
            logs.forEach(l => {
                const tankName = l.diesel_tanks?.name || 'DESCONOCIDO';
                const branchId = l.diesel_tanks?.branch_id || 'SIN SUCURSAL';
                console.log(`   - [${l.type}] ${l.amount}L en Tanque "${tankName}" (Sucursal: ${branchId}) - Fecha: ${new Date(l.created_at).toLocaleString()}`);
            });
        } else {
            console.warn("⚠️  No hay logs registrados todavía.");
        }
    }
    console.log("\n");

    // 3. Verificar Vehículos
    console.log("🚛 BUSCANDO VEHÍCULOS...");
    const { data: vehicles } = await supabase.from('vehicles').select('*');
    if (vehicles && vehicles.length > 0) {
        console.log(`✅ ${vehicles.length} vehículos encontrados.`);
        console.table(vehicles.map(v => ({ Placa: v.plate, Descripcion: v.description, Sucursal: v.branch_id })));
    } else {
        console.warn("⚠️  No hay vehículos.");
    }

    console.log("-----------------------------------------------------");
    console.log("💡 CONCLUSIÓN PRELIMINAR:");
    if (tanks && tanks.length > 0) {
        const branches = [...new Set(tanks.map(t => t.branch_id))];
        console.log(`   Tus datos están distribuidos en las siguientes sucursales (IDs): ${branches.join(', ')}`);
        console.log("   👉 ASEGÚRATE DE QUE EN 'APP.TSX' O EN EL MENÚ SELECTOR ESTES ELIGIENDO UNA DE ESTAS.");
    }
}

diagnoseVisibility();
