const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function setup({ auditOk = true, auditError = null, deleteFails = false } = {}) {
  const calls = [];
  const items = [{ product_id: 'p1', physical_qty: 8, difference_qty: -2 }];
  const filename = path.resolve('services/vinos/physicalInventoryDeletion.service.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(filename);
  module.require = (name) => {
    if (name === '../audit/audit.service') return { auditService: {
      async writeRequired(document) { calls.push(['audit', document]); if (auditError) throw auditError; return auditOk; },
    } };
    assert.equal(name, './physicalInventory.service');
    return { physicalInventoryService: {
      async listItems(id) { calls.push(['items', id]); return items; },
      async deleteInventory(id) { calls.push(['delete', id]); if (deleteFails) throw Error('Borrado fallido'); },
    } };
  };
  module._compile(compiled, filename);
  return { service: module.exports.physicalInventoryDeletionService, calls, items };
}

const input = {
  inventory: { id: 'inventory', name: 'Conteo de prueba', start_date: '2026-10-07', branch_id: 'casa-tahona' },
  reason: '  Inventario duplicado  ', userId: 'operator1', userName: 'Operador', branchId: 'TAHONA', branchName: 'Casa Tahona',
};

test('No elimina ni registra eventos sin motivo', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.remove({ ...input, reason: '   ' }), /observacion es obligatoria/);
  assert.equal(calls.length, 0);
});

test('Fallo de auditoria conserva el inventario', async () => {
  const { service, calls } = setup({ auditOk: false });
  await assert.rejects(service.remove(input), /inventario no fue eliminado/);
  assert.deepEqual(calls.map((c) => c[0]), ['items', 'audit']);
});

test('Guarda motivo, operador y snapshot antes de eliminar', async () => {
  const { service, calls, items } = setup();
  await service.remove(input);
  assert.deepEqual(calls.map((c) => c[0]), ['items', 'audit', 'delete']);
  const document = calls[1][1];
  assert.equal(document.justification, 'Inventario duplicado');
  assert.equal(document.action_type, 'ELIMINAR');
  assert.equal(document.entity_type, 'inventario');
  assert.equal(document.module, 'vinos');
  assert.equal(document.entity_id, 'inventory');
  assert.equal(document.user_id, 'operator1');
  assert.equal(document.user_name, 'Operador');
  assert.deepEqual(document.previous_data.items, items);
  assert.equal(document.previous_data.name, 'Conteo de prueba');
  assert.equal(document.new_data.deletion_stage, 'AUTHORIZED');
});

test('Fallo del borrado se propaga y el evento no afirma que se elimino', async () => {
  const { service, calls } = setup({ deleteFails: true });
  await assert.rejects(service.remove(input), /Borrado fallido/);
  assert.match(calls[1][1].description, /Eliminacion autorizada/);
});

test('Muestra la causa del backend y conserva el inventario', async () => {
  const { service, calls } = setup({ auditError: new Error('Actualiza audit-log en el proyecto de auditoria') });
  await assert.rejects(service.remove(input), /El inventario no fue eliminado.*Actualiza audit-log/);
  assert.deepEqual(calls.map((c) => c[0]), ['items', 'audit']);
});
