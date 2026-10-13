const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const target = '5285790a-0dff-4c16-a268-9a401ad03336';
const reconciledReturnTarget = '70fde86e-300d-4de6-8c11-4e02c7634641';
function setup({ auditAvailable = true, branch = 1 } = {}) {
  const calls = [];
  const purchase = (id, qty, date) => ({ id, qty, qty_base: qty, cost_per_unit: 10, subtotal: qty * 10,
    purchase: { id, branch_id: 1, purchase_date: date.slice(0, 10), created_at: date, deleted_at: null } });
  const sale = (id, qty, date, deleted = null) => ({ id, qty, qty_base: qty, unit_price: 20, line_total: qty * 20, price_type: 'MENUDEO',
    sale: { id, branch_id: deleted ? branch : 1, created_at: date, deleted_at: deleted, delete_note: 'Devolucion de mercancia', created_by: 'seller' } });
  const data = {
    purchase_items: [purchase('purchase-before', 204, '2026-07-24T10:00:00Z'), purchase('purchase-after', 12, '2026-10-05T10:00:00Z')],
    sale_items: [sale('active-before', 62, '2026-07-24T12:00:00Z'), sale('cancelled', 6, '2026-07-24T13:00:00Z', '2026-07-28T14:00:00Z'), sale('active-after', 122, '2026-08-01T10:00:00Z')],
    product_stocks: [{ qty: 39 }],
  };
  const client = { from(table) {
    const query = {};
    for (const method of ['select', 'eq', 'limit', 'in']) query[method] = () => query;
    query.then = (resolve, reject) => Promise.resolve({ data: data[table] ?? [], error: null }).then(resolve, reject);
    return query;
  } };
  const filename = path.resolve('services/vinos/products.service.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(filename);
  module.require = (name) => {
    if (name === '../vinosClient') return { supabaseVinos: client, isVinosConfigured: true };
    if (name === '../supabaseClient') return { supabase: client };
    if (name === './productUoms.service') return {};
    if (name === '../audit/audit.service') return { fetchAuditLogs: async (params) => {
      calls.push(params);
      if (params.entity_type === 'venta') {
        if (!auditAvailable) throw new Error('Audit unavailable');
        return { rows: [{ entity_id: 'cancelled', action_type: 'ELIMINAR', user_id: 'deleter', user_name: 'Persona que cancelo' }] };
      }
      return { rows: [{ log_id: 'adjustment', action_type: 'ACTUALIZAR', description: 'Stock ajustado manualmente', timestamp: '2026-07-24T18:00:00Z', previous_data: { stock: 142 }, new_data: { stock: 143 } }] };
    } };
    throw new Error(`Unexpected import: ${name}`);
  };
  module._compile(compiled, filename);
  return { service: module.exports.vinosProductsService, calls };
}
const balance = (history) => history.reduce((stock, row) => row.status === 'ACTUALIZACION'
  ? row.stock_after ?? stock
  : stock + (row.status === 'SALIDA' ? -row.qty : row.qty), 0);

test('Los productos reconciliados muestran salida cancelada y devolucion y concilian 39', async () => {
  const { service } = setup();
  const report = await service.getProductInsights(target, 1);
  assert.equal(balance(report.history), 39);
  assert.equal(report.current_stock, 39);
  assert.equal(report.sold_qty, 184);
  assert.equal(report.sold_total, 3680);
  assert.equal(report.estimated_profit, 1840);
  assert.equal(report.purchased_qty, 216);
  const returned = report.history.find(row => row.status === 'DEVOLUCION');
  assert.equal(returned.qty, 6);
  assert.equal(returned.created_at, '2026-07-28T14:00:00Z');
  assert.equal(returned.user_name, 'Persona que cancelo');
  assert.match(returned.detail, /Devolucion de mercancia/);
  assert.equal(returned.subtotal, null);
  assert.equal(returned.profit, null);
  const original = report.history.find(row => row.id === 'CANCELLED-SAL-cancelled');
  assert.equal(original.created_at, '2026-07-24T13:00:00Z');
  assert.equal(original.user_id, 'seller');
  assert.equal(original.qty, 6);
});

test('Los productos agregados a la conciliacion tambien consultan y muestran devoluciones', async () => {
  const { service, calls } = setup();
  const report = await service.getProductInsights(reconciledReturnTarget, 1);
  assert.equal(report.history.some(row => row.status === 'DEVOLUCION'), true);
  assert.equal(calls.some(call => call.entity_type === 'venta'), true);
});

test('Otros productos conservan el reporte anterior y no consultan auditoria de cancelaciones', async () => {
  const { service, calls } = setup();
  const report = await service.getProductInsights('other-product', 1);
  assert.equal(balance(report.history), 33);
  assert.equal(report.history.some(row => row.status === 'DEVOLUCION'), false);
  assert.equal(calls.some(call => call.entity_type === 'venta'), false);
});

test('No incluye cancelaciones de otra sucursal', async () => {
  const { service } = setup({ branch: 2 });
  const report = await service.getProductInsights(target, 1);
  assert.equal(report.history.some(row => row.status === 'DEVOLUCION'), false);
});

test('Sin auditoria conserva fecha y motivo de la venta y no atribuye la cancelacion al vendedor', async () => {
  const { service } = setup({ auditAvailable: false });
  const report = await service.getProductInsights(target, 1);
  const returned = report.history.find(row => row.status === 'DEVOLUCION');
  assert.equal(balance(report.history), 39);
  assert.equal(returned.user_id, null);
  assert.equal(returned.user_name, 'No registrado');
  assert.match(returned.detail, /Devolucion de mercancia/);
});
