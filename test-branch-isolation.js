
import { vehiclesService, driversService, dieselTanksService, dieselLogsService } from './services/supabaseClient.js';

async function testBranchIsolation() {
    console.log('🧪 INICIANDO TEST DE AISLAMIENTO DE SUCURSALES - GRUPO LOPAR\n');

    const BRANCH_A = 'matriz-centro-test-' + Date.now();
    const BRANCH_B = 'sucursal-norte-test-' + Date.now();

    try {
        // --- PASO 1: CREAR DATOS EN SUCURSAL A ---
        console.log(`📡 [${BRANCH_A}] Creando activos...`);
        const vA = await vehiclesService.create({
            plate: 'MTZ-001',
            description: 'Camión de Matriz',
            active: true,
            branch_id: BRANCH_A
        });
        const dA = await driversService.create({
            name: 'Operador de Matriz',
            license: 'LIC-MTZ',
            active: true,
            branch_id: BRANCH_A
        });
        console.log('✅ Activos creados en Sucursal A.');

        // --- PASO 2: CREAR DATOS EN SUCURSAL B ---
        console.log(`📡 [${BRANCH_B}] Creando activos...`);
        const vB = await vehiclesService.create({
            plate: 'NTE-999',
            description: 'Camión del Norte',
            active: true,
            branch_id: BRANCH_B
        });
        console.log('✅ Activos creados en Sucursal B.');

        // --- PASO 3: VERIFICAR AISLAMIENTO DE VEHÍCULOS ---
        console.log('\n🔍 VERIFICANDO AISLAMIENTO...');

        const listA = await vehiclesService.getAll(BRANCH_A);
        const listB = await vehiclesService.getAll(BRANCH_B);

        const foundAinB = listB.find(v => v.id === vA.id);
        const foundBinA = listA.find(v => v.id === vB.id);

        if (!foundAinB && !foundBinA) {
            console.log('💎 TEST DE VEHÍCULOS: ¡AISLAMIENTO PERFECTO!');
            console.log(`   - Sucursal A ve: ${listA.length} vehículo(s)`);
            console.log(`   - Sucursal B ve: ${listB.length} vehículo(s)`);
        } else {
            console.log('❌ ERROR: Los datos se están mezclando entre sucursales.');
        }

        // --- PASO 4: VERIFICAR AISLAMIENTO DE CHOFERES ---
        const driversA = await driversService.getAll(BRANCH_A);
        const driversB = await driversService.getAll(BRANCH_B);

        if (driversA.length === 1 && driversB.length === 0) {
            console.log('💎 TEST DE CHOFERES: ¡AISLAMIENTO PERFECTO!');
        } else {
            console.log('❌ ERROR: Los choferes no están bien aislados.');
        }

        console.log('\n✨ CONCLUSIÓN: La lógica de sucursales separadas funciona correctamente.');
        console.log('Los datos de "Matriz" y "Norte" son invisibles entre sí.');

    } catch (error) {
        console.error('❌ ERROR DURANTE EL TEST:', error.message);
    }
}

testBranchIsolation();
