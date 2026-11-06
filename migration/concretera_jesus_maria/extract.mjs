#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Lee el formato de phpMyAdmin sin cortar una sentencia por ';' dentro de texto.
const source = resolve(process.argv[2] ?? 'concre45_crm.sql');
const out = resolve(process.argv[3] ?? 'migration/concretera_jesus_maria/out');
const wanted = ['clientes', 'medidas', 'productos', 'presentaciones', 'ventas', 'listaventas', 'abonos'];
const tables = Object.fromEntries(wanted.map(name => [name, { columns: [], rows: [] }]));
let current = null;

for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  const header = line.match(/^INSERT INTO `([^`]+)` \((.+)\) VALUES$/);
  if (header) {
    current = tables[header[1]] ? header[1] : null;
    if (current) {
      const columns = [...header[2].matchAll(/`([^`]+)`/g)].map(match => match[1]);
      const table = tables[current];
      if (table.columns.length && table.columns.join() !== columns.join()) throw new Error(`Columnas variables: ${current}`);
      table.columns = columns;
    }
    continue;
  }
  if (!current || !line.startsWith('(')) continue;
  const fields = parseTuple(line);
  const table = tables[current];
  if (fields.length !== table.columns.length) throw new Error(`Columnas incompletas en ${current}: ${line.slice(0, 80)}`);
  table.rows.push(Object.fromEntries(table.columns.map((column, index) => [column, fields[index]])));
  if (line.trimEnd().endsWith(');')) current = null;
}

function parseTuple(line) {
  const result = [];
  let token = '', quoted = false, escaped = false, wasQuoted = false;
  for (let i = 1; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (escaped) { token += ({ n: '\n', r: '\r', t: '\t', 0: '\0' }[ch] ?? ch); escaped = false; }
      else if (ch === '\\') escaped = true;
      else if (ch === "'" && line[i + 1] === "'") { token += "'"; i++; }
      else if (ch === "'") quoted = false;
      else token += ch;
    } else if (ch === "'") { quoted = true; wasQuoted = true; }
    else if (ch === ',' || ch === ')') {
      const value = token.trim();
      result.push(!wasQuoted && value.toUpperCase() === 'NULL' ? null : wasQuoted ? token : value);
      token = ''; wasQuoted = false;
      if (ch === ')') return result;
    } else token += ch;
  }
  throw new Error(`Fila SQL sin cierre: ${line.slice(0, 80)}`);
}

const ids = (name, column) => new Set(tables[name].rows.map(row => row[column]));
const sales = ids('ventas', 'idventa');
const customers = ids('clientes', 'idcliente');
const products = ids('productos', 'idproducto');
const presentations = new Map(tables.presentaciones.rows.map(row => [row.idpresentacion, row]));
const paymentsBySale = new Map();
for (const row of tables.abonos.rows) paymentsBySale.set(row.idventa, (paymentsBySale.get(row.idventa) ?? 0) + Number(row.monto));
const activeCreditSales = tables.ventas.rows.filter(row => row.status === '1' && row.credito === '1');
const issues = {
  salesWithoutCustomer: tables.ventas.rows.filter(row => !customers.has(row.cliente)).length,
  itemsWithoutSale: tables.listaventas.rows.filter(row => !sales.has(row.idventa)).length,
  itemsWithoutPresentation: tables.listaventas.rows.filter(row => !presentations.has(row.presentacion)).length,
  presentationsWithoutProduct: tables.presentaciones.rows.filter(row => !products.has(row.idproducto)).length,
  paymentsWithoutSale: tables.abonos.rows.filter(row => !sales.has(row.idventa)).length,
  nonCreditSalesWithPayments: tables.ventas.rows.filter(row => row.credito !== '1' && paymentsBySale.has(row.idventa)).length,
  creditSalesPaidMismatch: tables.ventas.rows.filter(row => row.credito === '1' && Math.abs(Number(row.creditoabonado) - (paymentsBySale.get(row.idventa) ?? 0)) > 0.01).length,
    activeCreditOverpaid: activeCreditSales.filter(row => (paymentsBySale.get(row.idventa) ?? 0) - Number(row.total) > 0.01).length,
    canceledCreditWithPayments: tables.ventas.rows.filter(row => row.status !== '1' && row.credito === '1' && paymentsBySale.has(row.idventa)).length,
    nonpositiveItemQty: tables.listaventas.rows.filter(row => Number(row.cantidad) <= 0).length,
    negativeStockProducts: tables.productos.rows.filter(row => Number(row.stock) < 0).length,
};
if (Object.values(issues).slice(0, 5).some(Boolean)) throw new Error(`Referencias rotas: ${JSON.stringify(issues)}`);
mkdirSync(out, { recursive: true });
for (const [name, table] of Object.entries(tables)) {
  if (!table.columns.length) throw new Error(`Sin filas o columnas: ${name}`);
  const csv = [table.columns, ...table.rows.map(row => table.columns.map(column => row[column]))]
    .map(cells => cells.map(value => value === null ? '' : `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
  writeFileSync(join(out, `${name}.csv`), csv);
}
const quoteIdent = value => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = value => `'${value.replaceAll("'", "''")}'`;
const staging = [
  'create schema if not exists migration_concretera_jm;',
  ...Object.entries(tables).map(([name, table]) =>
    `create table if not exists migration_concretera_jm.${quoteIdent(name)} (${table.columns.map(column => `${quoteIdent(column)} text`).join(', ')});`
  ),
].join('\n') + '\n';
writeFileSync(join(out, '01_staging.sql'), staging);
const loader = [
  '\\set ON_ERROR_STOP on',
  'begin;',
  ...Object.keys(tables).map(name => `truncate migration_concretera_jm.${quoteIdent(name)};`),
  ...Object.entries(tables).map(([name, table]) =>
    `\\copy migration_concretera_jm.${quoteIdent(name)} (${table.columns.map(quoteIdent).join(', ')}) from ${quoteLiteral(join(out, `${name}.csv`))} with (format csv, header true, null '')`
  ),
  'commit;',
].join('\n') + '\n';
writeFileSync(join(out, 'load_staging.psql'), loader);
// Alternativa para el SQL Editor de Supabase: un archivo SQL autocontenido,
// sin \copy ni acceso local del servidor a los CSV.
const sqlLiteral = value => value === null ? 'NULL' : quoteLiteral(String(value));
const sqlEditorStatements = [
  '-- Datos sensibles de Concretera Jesús María. No publicar este archivo.',
  '-- Ejecutar completo en el SQL Editor de la misma base donde se hará la migración.',
  'begin;',
  "set local standard_conforming_strings = on;",
  staging,
  ...Object.keys(tables).map(name => `truncate migration_concretera_jm.${quoteIdent(name)};`),
];
for (const [name, table] of Object.entries(tables)) {
  const columns = table.columns.map(quoteIdent).join(', ');
  for (let index = 0; index < table.rows.length; index += 100) {
    const batch = table.rows.slice(index, index + 100);
    const tuples = batch.map(row => `(${table.columns.map(column => sqlLiteral(row[column])).join(', ')})`);
    sqlEditorStatements.push(`insert into migration_concretera_jm.${quoteIdent(name)} (${columns}) values\n${tuples.join(',\n')};`);
  }
}
sqlEditorStatements.push('commit;');
writeFileSync(join(out, '01_staging_and_data.sql'), sqlEditorStatements.join('\n\n') + '\n');
const completeSql = [
  '-- MIGRACION COMPLETA CONCRETERA JESUS MARIA (sin limpieza).',
  '-- Ejecutar este archivo completo en el SQL Editor de la base principal.',
  '-- Contiene datos sensibles; no publicarlo ni agregarlo a Git.',
  sqlEditorStatements.join('\n\n'),
  readFileSync(new URL('./01_branch_sale_folios.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('./02_load.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('./03_verify.sql', import.meta.url), 'utf8'),
].join('\n\n');
writeFileSync(join(out, 'MIGRACION_COMPLETA_SQL_EDITOR.sql'), completeSql + '\n');
const summary = {
  source, counts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length])), issues,
  sales: {
    active: tables.ventas.rows.filter(row => row.status === '1').length,
    canceled: tables.ventas.rows.filter(row => row.status !== '1').length,
    credit: tables.ventas.rows.filter(row => row.credito === '1').length,
    cash: tables.ventas.rows.filter(row => row.credito !== '1').length,
    total: Math.round(tables.ventas.rows.reduce((sum, row) => sum + Number(row.total), 0) * 100) / 100,
    activeCreditTotal: Math.round(activeCreditSales.reduce((sum, row) => sum + Number(row.total), 0) * 100) / 100,
    activeCreditPaid: Math.round(activeCreditSales.reduce((sum, row) => sum + (paymentsBySale.get(row.idventa) ?? 0), 0) * 100) / 100,
  },
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
