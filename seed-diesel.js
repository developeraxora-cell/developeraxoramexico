import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const supabaseAnonKey = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
    console.log('🌱 Iniciando restauración de datos de simulación...');

    // 1. Restaurar Vehículos
    const vehicles = [
        { plate: 'KW-22-MX', description: 'Camión Kenworth #22', active: true },
        { plate: 'FL-05-TX', description: 'Torton Freightliner #05', active: true },
        { plate: 'IZ-10-PZ', description: 'Camioneta Isuzu #10', active: true }
    ];

    console.log('🚚 Restaurando vehículos...');
    for (const v of vehicles) {
        const { data, error } = await supabase
            .from('vehicles')
            .upsert(v, { onConflict: 'plate' })
            .select();

        if (error) console.error(`❌ Error con vehículo ${v.plate}:`, error.message);
        else console.log(`✅ Vehículo listo: ${data[0].description}`);
    }

    // 2. Restaurar Operadores
    const drivers = [
        { name: 'Juan Pérez', license: 'FED-12345', active: true },
        { name: 'Carlos Rodríguez', license: 'ST-98765', active: true },
        { name: 'Roberto Gómez', license: 'OP-45678', active: true }
    ];

    console.log('\n👷 Restaurando operadores...');
    for (const d of drivers) {
        const { data, error } = await supabase
            .from('drivers')
            .upsert(d, { onConflict: 'license' })
            .select();

        if (error) console.error(`❌ Error con operador ${d.name}:`, error.message);
        else console.log(`✅ Operador listo: ${data[0].name}`);
    }

    // 3. Verificar Tanque
    console.log('\n⛽ Verificando tanques...');
    const { data: tanks, error: tankError } = await supabase
        .from('diesel_tanks')
        .select('*');

    if (tankError) {
        console.error('❌ Error cargando tanques:', tankError.message);
    } else if (tanks.length === 0) {
        console.log('⚠️ No hay tanques. Creando Tanque Degollado...');
        const { error: createError } = await supabase
            .from('diesel_tanks')
            .insert({
                name: 'TANQUE DEGOLLADO',
                current_qty: 1500,
                max_capacity: 5000,
                branch_id: 'default-branch' // O el ID real si se conoce
            });
        if (createError) console.error('❌ Error creando tanque:', createError.message);
        else console.log('✅ Tanque Degollado creado.');
    } else {
        console.log(`✅ ${tanks.length} tanques detectados.`);
    }

    console.log('\n✨ Restauración completada exitosamente.');
}

seed();
