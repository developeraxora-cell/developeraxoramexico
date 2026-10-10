const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const columns = 'id,product_id,uom_id,factor_to_base,price_retail,price_mid_wholesale,price_wholesale,uom:uoms(id,name,symbol)';
const productId = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function loadService(client) {
  const filename = path.resolve('services/vinos/productUoms.service.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(filename);
  module.require = (name) => {
    assert.equal(name, '../vinosClient');
    return { supabaseVinos: client };
  };
  module._compile(compiled, filename);
  return module.exports.fetchProductUoms;
}

function setup(respond) {
  const requests = [];
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const ids = url.searchParams.get('product_id').slice(4, -1).split(',');
        const request = {
          url, ids,
          offset: Number(url.searchParams.get('offset') ?? 0),
          limit: Number(url.searchParams.get('limit')),
        };
        requests.push(request);
        const result = respond(request, requests.length);
        return new Response(JSON.stringify(result.data ?? result.error), {
          status: result.error ? 400 : 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  return { fetchUoms: loadService(client), requests };
}

test('940 productos se consultan en URLs cortas sin perder unidades, precios ni factores', async () => {
  const ids = Array.from({ length: 940 }, (_, i) => productId(i));
  const row = (id) => ({
    id: `unit-${id}`, product_id: id, uom_id: 'uom-box', factor_to_base: 12,
    price_retail: 150, price_mid_wholesale: 140, price_wholesale: 130,
    uom: { id: 'uom-box', name: 'Caja', symbol: 'CJ' },
  });
  const { fetchUoms, requests } = setup(({ ids }) => ({ data: ids.map(row) }));
  const result = await fetchUoms([...ids, ids[0]], columns);
  assert.deepEqual(result, ids.map(row));
  assert.equal(requests.length, 19);
  assert.deepEqual(requests.flatMap((r) => r.ids), ids);
  for (const { url, ids, limit } of requests) {
    assert.ok(ids.length <= 50);
    assert.ok(url.href.length < 3000);
    assert.equal(url.searchParams.get('select'), columns);
    assert.equal(url.searchParams.get('order'), 'id.asc');
    assert.equal(limit, 200);
  }
});

test('Pagina todas las unidades cuando un lote supera una pagina', async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ id: `unit-${i}`, product_id: productId(1) }));
  const { fetchUoms, requests } = setup(({ offset, limit }) => ({ data: rows.slice(offset, offset + limit) }));
  assert.deepEqual(await fetchUoms([productId(1)], columns), rows);
  assert.deepEqual(requests.map((r) => r.offset), [0, 200, 400, 600, 800, 1000, 1200]);
});

test('Una pagina completa consulta la siguiente aunque este vacia', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i }));
  const { fetchUoms, requests } = setup(({ offset, limit }) => ({ data: rows.slice(offset, offset + limit) }));
  assert.deepEqual(await fetchUoms([productId(1)], columns), rows);
  assert.equal(requests.length, 2);
});

test('Sin productos no se realiza ninguna peticion', async () => {
  const { fetchUoms, requests } = setup(() => { throw new Error('No debe consultar'); });
  assert.deepEqual(await fetchUoms([], columns), []);
  assert.equal(requests.length, 0);
});

test('Un fallo de API rechaza toda la carga, no devuelve unidades vacias ni resultados parciales', async () => {
  const { fetchUoms, requests } = setup(({ ids }, n) => n === 2
    ? { error: { code: 'TEST400', message: 'Bad Request' } }
    : { data: ids.map((id) => ({ id, product_id: id })) });
  await assert.rejects(fetchUoms(Array.from({ length: 101 }, (_, i) => productId(i)), columns), {
    code: 'TEST400', message: 'Bad Request',
  });
  assert.equal(requests.length, 2);
});

test('Una respuesta valida sin unidades sigue siendo un resultado vacio real', async () => {
  const { fetchUoms } = setup(() => ({ data: [] }));
  assert.deepEqual(await fetchUoms([productId(1)], columns), []);
});

test('Una respuesta sin datos no se interpreta como falta de configuracion', async () => {
  const query = {};
  for (const key of ['select', 'in', 'order', 'range']) query[key] = () => query;
  query.then = (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
  await assert.rejects(loadService({ from: () => query })([productId(1)], columns), /no devolvio datos/);
});

function loadPosCatalog(fetchUnits) {
  const filename = 'components/Vinos/VinosPOSScreen.tsx';
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'load') {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, 'Debe existir el callback de carga del POS');
  const state = { products: [{ id: 'previous-product' }], customers: [], error: null, loading: false };
  const context = {
    branchDbId: 1,
    catalogLoadRef: { current: 0 },
    setCatalogError: (value) => { state.error = value; },
    setProducts: (value) => { state.products = value; },
    setCustomers: (value) => { state.customers = value; },
    setCustomerId: () => {},
    setLoading: (value) => { state.loading = value; },
    vinosProductsService: { listWithStock: async () => [{ id: productId(1), price_retail: 30 }] },
    vinosCustomersService: { getAll: async () => [] },
    fetchProductUoms: (...args) => fetchUnits(...args),
    isPublicGeneralCustomer: () => false,
    console: { error: () => {} },
  };
  const code = ts.transpileModule(`const load = ${callback};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const load = require('node:vm').compileFunction(`${code}\nreturn load;`, Object.keys(context))(...Object.values(context));
  return { load, state, context };
}

test('El POS distingue el fallo de unidades y permite cargar correctamente al reintentar', async () => {
  let failing = true;
  const { load, state } = loadPosCatalog(async () => {
    if (failing) throw new Error('HTTP 400');
    return [{ id: 'unit-1', product_id: productId(1), uom_id: 'piece', factor_to_base: '1',
      price_retail: '30', price_mid_wholesale: '28', price_wholesale: '25',
      uom: [{ id: 'piece', name: 'Pieza', symbol: 'PZ' }] }];
  });
  await load();
  assert.equal(state.products.length, 0);
  assert.match(state.error, /No se pudo cargar/);
  assert.equal(state.loading, false);
  failing = false;
  await load();
  assert.equal(state.error, null);
  assert.equal(state.products.length, 1);
  const unit = state.products[0].product_uoms[0];
  assert.equal(unit.id, 'unit-1');
  assert.equal(unit.factor_to_base, 1);
  assert.equal(unit.price_retail, 30);
  assert.equal(unit.price_mid_wholesale, 28);
  assert.equal(unit.price_wholesale, 25);
  assert.equal(unit.uom.name, 'Pieza');
});

test('El POS no inventa unidades cuando la consulta fue exitosa y realmente no existen', async () => {
  const { load, state } = loadPosCatalog(async () => []);
  await load();
  assert.equal(state.error, null);
  assert.equal(state.products[0].product_uoms.length, 0);
});

test('Una carga antigua no reemplaza la sucursal actual', async () => {
  let finish;
  const { load, state, context } = loadPosCatalog(() => new Promise((resolve) => { finish = resolve; }));
  const pending = load();
  await new Promise((resolve) => setImmediate(resolve));
  context.catalogLoadRef.current += 1;
  finish([]);
  await pending;
  assert.equal(state.products[0].id, 'previous-product');
});
