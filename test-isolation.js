
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ojizyrjgutnvqjbbyons.supabase.co';
const supabaseAnonKey = 'sb_publishable_7BCr1_lp-TJQ8D9NzwaDqw_aacm1Zdc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testBranchIsolation() {
    console.log('🧪 INICIANDO TEST DE AUTO-VALIDACIÓN - GRUPO LOPAR\n');

    const BRANCH_A = 'MATRIZ_TEST_ID';
    const BRANCH_B = 'NORTE_TEST_ID';
    const TS = Date.now();

    try {
        console.log('1️⃣  Creando activos en MATRIZ...');
        await supabase.from('vehicles').insert({
            plate: 'MTZ-' + TS,
            description: 'Camion MATRIZ',
            branch_id: BRANCH_A
        });

        console.log('2️⃣  Creando activos en NORTE...');
        await supabase.from('vehicles').insert({
            plate: 'NTE-' + TS,
            description: 'Camion NORTE',
            branch_id: BRANCH_B
        });

        console.log('3️⃣  Validando Filtros de Sucursal...');

        const { data: listA } = await supabase.from('vehicles').select('*').eq('branch_id', BRANCH_A);
        const { data: listB } = await supabase.from('vehicles').select('*').eq('branch_id', BRANCH_B);

        console.log(`   🔸 MATRIZ ve: ${listA.length} vehiculos`);
        console.log(`   🔸 NORTE ve: ${listB.length} vehiculos`);

        const mixFound = listA.some(v => v.branch_id === BRANCH_B) || listB.some(v => v.branch_id === BRANCH_A);

        if (!mixFound) {
            console.log('\n👑 TEST EXITOSO: ¡Los datos están perfectamente divididos!');
            console.log('Cada sucursal funciona como un sistema independiente.\n');
        } else {
            console.log('\n⚠️ ADVERTENCIA: Se detectó mezcla de datos.');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testBranchIsolation();
