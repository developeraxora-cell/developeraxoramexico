const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadService(file, client) {
  const filename = path.resolve(file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(filename);
  module.require = (name) => {
    assert.equal(name, '../vinosClient', 'Solo puede depender del cliente VINOS');
    return { supabaseVinos: client };
  };
  module._compile(compiled, filename);
  return module.exports;
}

function mockClient(result = { data: [], error: null }) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      const query = {};
      for (const name of ['select', 'eq', 'is', 'ilike', 'order', 'limit', 'single', 'insert', 'update', 'delete']) {
        query[name] = (...args) => { calls.push([name, ...args]); return query; };
      }
      query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return query;
    },
    async rpc(...args) { calls.push(['rpc', ...args]); return result; },
  };
  return { client, calls };
}

test('Historial separado de Materiales y con ambito Casa Tahona', async () => {
  const { client, calls } = mockClient();
  const { physicalInventoryService: service } = loadService('services/vinos/physicalInventory.service.ts', client);
  await service.listInventories('casa-tahona');
  assert.deepEqual(calls.slice(0, 4), [
    ['from', 'vinos_physical_inventories'], ['select', '*'], ['eq', 'branch_id', 'casa-tahona'], ['eq', 'business_unit', 'vinos'],
  ]);
  await service.listItems('inventory');
  assert.ok(calls.some((row) => row[1] === 'vinos_physical_inventory_items'));
});

test('Guarda conteos y bajas en una sola RPC, sin escribir el stock', async () => {
  const { client, calls } = mockClient();
  const { physicalInventoryService: service } = loadService('services/vinos/physicalInventory.service.ts', client);
  const items = [{ product_id: 'p1', system_qty: 10, physical_qty: 8.125, observation: 'Faltante', counted_by: 'Operador' }];
  await service.saveCapture('inventory', items, ['item1']);
  assert.deepEqual(calls, [['rpc', 'save_vinos_physical_inventory_capture', {
    p_inventory_id: 'inventory', p_items: items, p_delete_item_ids: ['item1'],
  }]]);
});

test('Rechaza cantidades invalidas y diferencias sin observacion antes de guardar', async () => {
  const { client, calls } = mockClient();
  const { physicalInventoryService: service } = loadService('services/vinos/physicalInventory.service.ts', client);
  const item = { product_id: 'p1', system_qty: 10, physical_qty: 10, observation: null, counted_by: 'Operador' };
  for (const qty of [-1, NaN, Infinity, 0.0001, 1e12]) {
    await assert.rejects(service.saveCapture('inventory', [{ ...item, physical_qty: qty }], []));
  }
  await assert.rejects(service.saveCapture('inventory', [{ ...item, physical_qty: 9 }], []));
  assert.equal(calls.length, 0);
  await service.saveCapture('inventory', [{ ...item, system_qty: 0, physical_qty: 0 }], []);
});

test('Propaga fallos del backend sin guardar por otra via', async () => {
  const error = { message: 'Inventario cerrado' };
  const { client, calls } = mockClient({ error });
  const { physicalInventoryService: service } = loadService('services/vinos/physicalInventory.service.ts', client);
  await assert.rejects(service.saveCapture('inventory', [], ['item']), /Inventario cerrado/);
  assert.equal(calls.length, 1);
});

test('Suma stock local sin consultar branches ni filtrar IDs externos', async () => {
  const { client, calls } = mockClient({ data: [
    { product_id: 'p1', qty: 3 }, { product_id: 'p1', qty: 7 }, { product_id: 'p2', qty: null },
  ], error: null });
  const { catalogService } = loadService('services/vinos/physicalInventoryCatalog.service.ts', client);
  assert.deepEqual(await catalogService.listStock(), [{ product_id: 'p1', qty_base: 10 }, { product_id: 'p2', qty_base: 0 }]);
  assert.deepEqual(calls, [['from', 'product_stocks'], ['select', 'product_id,qty']]);
  const missing = loadService('services/vinos/physicalInventoryCatalog.service.ts', null);
  await assert.rejects(missing.catalogService.listStock(), /Configura la conexion/);
});

test('Busqueda aislada, filtros seguros y productos deduplicados', async () => {
  const { client, calls } = mockClient({ data: [{ id: 'p1', name: 'Vino', sku: 'sku', barcode: '123', uom_id: 'u1' }], error: null });
  const { catalogService } = loadService('services/vinos/physicalInventoryCatalog.service.ts', client);
  const products = await catalogService.searchProducts('vin%,_');
  assert.equal(products.length, 1);
  assert.equal(products[0].base_uom_id, 'u1');
  assert.equal(calls.filter((row) => row[0] === 'eq' && row[1].includes('branch')).length, 0);
  assert.ok(calls.filter((row) => row[0] === 'from').every((row) => row[1] === 'products'));
  assert.equal(calls.filter((row) => row[0] === 'ilike' && row[2] === '%vin\\%,\\_%').length, 3);
});
