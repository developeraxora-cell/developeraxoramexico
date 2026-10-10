const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const filename = 'components/Vinos/VinosPOSScreen.tsx';
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'filteredProducts') {
    callback = node.initializer.arguments[0].getText(source);
  }
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(callback, 'Debe existir el filtro del catalogo del POS');
const code = ts.transpileModule(`const filter = ${callback};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const filter = vm.compileFunction(`${code}\nreturn filter();`, ['products', 'search']);
const products = Array.from({ length: 30 }, (_, i) => ({
  id: i, name: `Producto ${i}`, sku: `SKU-${i}`, barcode: String(7500000000000 + i),
}));

test('La vista inicial muestra solo los primeros doce en el orden original', () => {
  assert.deepEqual(filter(products, ''), products.slice(0, 12));
  assert.deepEqual(filter(products, '   '), products.slice(0, 12));
  assert.equal(filter(products.slice(0, 4), '').length, 4);
  assert.equal(filter([], '').length, 0);
});

test('Uno o dos caracteres mantienen los doce primeros', () => {
  assert.deepEqual(filter(products, 'p'), products.slice(0, 12));
  assert.deepEqual(filter(products, 'pr'), products.slice(0, 12));
  assert.deepEqual(filter(products, '  pr  '), products.slice(0, 12));
});

test('Tres caracteres buscan en todo el catalogo, no solo en los doce iniciales', () => {
  assert.equal(filter(products, 'pro').length, 30);
  assert.deepEqual(filter(products, ' PRODUCTO 25 '), [products[25]]);
  assert.deepEqual(filter(products, 'sku-29'), [products[29]]);
  assert.equal(filter(products, 'inexistente').length, 0);
});

test('Un codigo de barras completo tiene prioridad incluso si es corto', () => {
  assert.deepEqual(filter(products, products[24].barcode), [products[24]]);
  const shortBarcode = { id: 40, name: 'Otro', sku: 'X', barcode: '42' };
  assert.deepEqual(filter([...products, shortBarcode], '42'), [shortBarcode]);
});

test('Vaciar el buscador vuelve a la vista inicial sin modificar el catalogo', () => {
  const original = products.slice();
  filter(products, 'producto 28');
  assert.deepEqual(filter(products, ''), products.slice(0, 12));
  assert.deepEqual(products, original);
});
