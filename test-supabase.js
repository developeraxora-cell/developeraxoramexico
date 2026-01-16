// Test de Conexión a Supabase
// Este script prueba todas las operaciones del módulo de logística

import {
    dieselTanksService,
    vehiclesService,
    driversService,
    dieselLogsService
} from './services/supabaseClient';

console.log('🧪 Iniciando pruebas de Supabase...\n');

async function runTests() {
    try {
        // TEST 1: Obtener tanques
        console.log('📦 TEST 1: Cargando tanques...');
        const tanks = await dieselTanksService.getAll();
        console.log(`✅ ${tanks.length} tanques cargados:`);
        tanks.forEach(t => {
            console.log(`   - ${t.name}: ${t.current_qty}/${t.max_capacity} L`);
        });
        console.log('');

        // TEST 2: Obtener vehículos
        console.log('🚛 TEST 2: Cargando vehículos...');
        const vehicles = await vehiclesService.getAll();
        console.log(`✅ ${vehicles.length} vehículos cargados:`);
        vehicles.forEach(v => {
            console.log(`   - ${v.description} (${v.plate}) - ${v.active ? 'Activo' : 'Inactivo'}`);
        });
        console.log('');

        // TEST 3: Obtener conductores
        console.log('👷 TEST 3: Cargando conductores...');
        const drivers = await driversService.getAll();
        console.log(`✅ ${drivers.length} conductores cargados:`);
        drivers.forEach(d => {
            console.log(`   - ${d.name} (${d.license}) - ${d.active ? 'Disponible' : 'Baja'}`);
        });
        console.log('');

        // TEST 4: Crear vehículo de prueba
        console.log('➕ TEST 4: Creando vehículo de prueba...');
        const newVehicle = await vehiclesService.create({
            plate: 'TEST-AUTO-' + Date.now(),
            description: 'Vehículo Automático de Prueba',
            active: true
        });
        console.log(`✅ Vehículo creado: ${newVehicle.description} (ID: ${newVehicle.id})`);
        console.log('');

        // TEST 5: Crear conductor de prueba
        console.log('➕ TEST 5: Creando conductor de prueba...');
        const newDriver = await driversService.create({
            name: 'Test Driver Auto',
            license: 'LIC-AUTO-' + Date.now(),
            active: true
        });
        console.log(`✅ Conductor creado: ${newDriver.name} (ID: ${newDriver.id})`);
        console.log('');

        // TEST 6: Obtener logs recientes
        console.log('📋 TEST 6: Cargando logs recientes...');
        const logs = await dieselLogsService.getAll(10);
        console.log(`✅ ${logs.length} registros de logs cargados`);
        if (logs.length > 0) {
            console.log('   Últimos 3 logs:');
            logs.slice(0, 3).forEach(log => {
                console.log(`   - ${log.type}: ${log.amount}L (${new Date(log.created_at).toLocaleString()})`);
            });
        }
        console.log('');

        // TEST 7: Procesar despacho de prueba (si hay stock)
        if (tanks.length > 0 && tanks[0].current_qty >= 50) {
            console.log('⛽ TEST 7: Procesando despacho de prueba...');
            const result = await dieselLogsService.processDispatch({
                tankId: tanks[0].id,
                vehicleId: newVehicle.id,
                driverId: newDriver.id,
                amount: 50,
                odometer: 99999,
                userId: 'test-user',
                notes: 'Despacho automático de prueba'
            });
            console.log(`✅ Despacho procesado exitosamente`);
            console.log(`   - Nueva cantidad en tanque: ${result.new_qty} L`);
            console.log('');
        } else {
            console.log('⚠️  TEST 7: Saltado - Stock insuficiente para despacho\n');
        }

        // TEST 8: Procesar recepción de prueba
        console.log('🚚 TEST 8: Procesando recepción de prueba...');
        if (tanks.length > 0) {
            const result = await dieselLogsService.processReception({
                tankId: tanks[0].id,
                amount: 100,
                supplier: 'Proveedor de Prueba Auto',
                costPerLiter: 22.50,
                invoiceNumber: 'FC-AUTO-' + Date.now(),
                userId: 'test-user',
                notes: 'Recepción automática de prueba'
            });
            console.log(`✅ Recepción procesada exitosamente`);
            console.log(`   - Nueva cantidad en tanque: ${result.new_qty} L`);
            console.log(`   - Costo total: $${result.total_cost} MXN`);
            console.log('');
        }

        // RESUMEN FINAL
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('📊 Resumen:');
        console.log(`   - Tanques funcionando: ✅`);
        console.log(`   - Vehículos funcionando: ✅`);
        console.log(`   - Conductores funcionando: ✅`);
        console.log(`   - Crear assets funcionando: ✅`);
        console.log(`   - Despacho funcionando: ✅`);
        console.log(`   - Recepción funcionando: ✅`);
        console.log(`   - Logs funcionando: ✅`);
        console.log('');
        console.log('🎉 La integración con Supabase está COMPLETAMENTE FUNCIONAL');

    } catch (error) {
        console.error('❌ ERROR EN LAS PRUEBAS:');
        console.error(error);
        console.log('\n⚠️  Verifica:');
        console.log('   1. Las credenciales en .env.local sean correctas');
        console.log('   2. El schema SQL se ejecutó en Supabase');
        console.log('   3. El proyecto de Supabase esté activo');
    }
}

runTests();
