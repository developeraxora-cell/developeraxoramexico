import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const supabaseAnonKey = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
    console.log('🌱 Iniciando carga de datos MAESTROS (Logística Estable)...');

    // 1. Vehículos Profesionales
    const vehicles = [
        { plate: 'KW-22-MX', description: 'Kenworth T680 - Unidad #22', active: true },
        { plate: 'FL-05-TX', description: 'Freightliner Cascadia - Unidad #05', active: true },
        { plate: 'IZ-10-PZ', description: 'Isuzu Forward 800 - Unidad #10', active: true },
        { plate: 'VL-15-RH', description: 'Volvo VNL - Unidad #15', active: true }
    ];

    console.log('🚚 Cargando flota...');
    for (const v of vehicles) {
        const { data, error } = await supabase
            .from('vehicles')
            .upsert(v, { onConflict: 'plate' })
            .select();

        if (error) console.error(`❌ Error con vehículo ${v.plate}:`, error.message);
        else console.log(`✅ Unidad estable: ${data[0].description}`);
    }

    // 2. Operadores Certificados
    const drivers = [
        { name: 'Juan Alberto Pérez', license: 'FED-12345678', active: true },
        { name: 'Carlos Mario Rodríguez', license: 'ST-98765432', active: true },
        { name: 'Roberto J. Gómez', license: 'OP-45678901', active: true },
        { name: 'Miguel Ángel Torres', license: 'TX-55443322', active: true }
    ];

    console.log('\n👷 Cargando operadores...');
    for (const d of drivers) {
        const { data, error } = await supabase
            .from('drivers')
            .upsert(d, { onConflict: 'license' })
            .select();

        if (error) console.error(`❌ Error con operador ${d.name}:`, error.message);
        else console.log(`✅ Operador activo: ${data[0].name}`);
    }

    // 3. Verificación de Tanques (Asegurar que existan)
    console.log('\n⛽ Verificando tanques...');
    const { data: tanks, error: tankError } = await supabase
        .from('diesel_tanks')
        .select('*');

    if (tankError) {
        console.error('❌ Error:', tankError.message);
    } else if (tanks.length === 0) {
        console.log('⚠️ Creando Tanque Principal...');
        const { error: createError } = await supabase
            .from('diesel_tanks')
            .insert([
                { name: 'Tanque Matriz 01', current_qty: 3500, max_capacity: 5000, branch_id: 'default-branch' },
                { name: 'Reserva Emergencia', current_qty: 1200, max_capacity: 2500, branch_id: 'default-branch' }
            ]);
        if (createError) console.error('❌ Error creando tanques:', createError.message);
        else console.log('✅ Tanques principales creados.');
    } else {
        console.log(`✅ ${tanks.length} tanques operativos detectados.`);
    }

    console.log('\n✨ Base de datos de logística optimizada y estable.');
}

seed();
