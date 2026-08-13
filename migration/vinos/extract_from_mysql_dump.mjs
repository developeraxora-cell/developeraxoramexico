#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_DUMP = 'concre45_crm2.sql';
const DEFAULT_OUT_DIR = 'migration/vinos/out';
const DEFAULT_BRANCH_CODE = 'JM';
const DEFAULT_BRANCH_NAME = 'Jesus Maria';
const DEFAULT_BRANCH_ADDRESS = 'Jesus Maria, Jalisco';
const DEFAULT_CATEGORY_ID = 'category:materiales';
const DEFAULT_CATEGORY_NAME = 'Materiales';
const DEFAULT_CREATED_BY = null;

const argv = parseArgs(process.argv.slice(2));
const dumpPath = argv._[0] ?? DEFAULT_DUMP;
const outDir = argv.out ?? DEFAULT_OUT_DIR;
const branchCode = argv['branch-code'] ?? DEFAULT_BRANCH_CODE;
const branchName = argv['branch-name'] ?? DEFAULT_BRANCH_NAME;
const branchAddress = argv['branch-address'] ?? DEFAULT_BRANCH_ADDRESS;
const branchPhone = argv['branch-phone'] ?? '';

if (String(branchCode).trim().toUpperCase() === 'CODIGO_REAL') {
  throw new Error('Reemplaza --branch-code CODIGO_REAL por el codigo real de la sucursal. Para Materiales Jesus Maria usa B2.');
}

const sql = readFileSync(dumpPath, 'utf8');

const source = {
  abonos: tableRows('abonos'),
  abonosentradas: tableRows('abonosentradas'),
  clientes: tableRows('clientes'),
  entradas: tableRows('entradas'),
  listaentradas: tableRows('listaentradas'),
  listaventas: tableRows('listaventas'),
  medidas: tableRows('medidas'),
  presentaciones: tableRows('presentaciones'),
  productos: tableRows('productos'),
  producto_imagenes: tableRows('producto_imagenes'),
  proveedores: tableRows('proveedores'),
  ventas: tableRows('ventas'),
};

const warnings = {
  saleItemsSkippedMissingSale: 0,
  saleItemsSkippedMissingPresentation: 0,
  saleItemsSkippedMissingProduct: 0,
  saleItemsSkippedInvalidQty: 0,
  purchaseItemsSkippedMissingPurchase: 0,
  purchaseItemsSkippedMissingPresentation: 0,
  purchaseItemsSkippedMissingProduct: 0,
  purchaseItemsSkippedInvalidQty: 0,
  creditPaymentsSkippedNonCreditSale: 0,
  creditPaymentsSkippedMissingSale: 0,
  creditPaymentsSkippedInvalidAmount: 0,
};

const byProductId = indexBy(source.productos, 'idproducto');
const byPresentationId = indexBy(source.presentaciones, 'idpresentacion');
const bySaleId = indexBy(source.ventas, 'idventa');
const byPurchaseId = indexBy(source.entradas, 'identrada');
const byMeasureId = indexBy(source.medidas, 'idmedida');

const firstImageByProduct = new Map();
for (const image of source.producto_imagenes) {
  const productId = legacyId(image.producto_id);
  const imagePath = nullableText(image.imagen);
  if (productId && imagePath && !firstImageByProduct.has(productId)) {
    firstImageByProduct.set(productId, imagePath);
  }
}

const saleItemsBySaleId = groupBy(source.listaventas, 'idventa');
const purchasePaymentsByPurchaseId = groupBy(source.abonosentradas, 'identrada');
const presentationsByProductId = groupBy(source.presentaciones, 'idproducto');

const uomsByName = new Map();
const uomLegacyIdByMeasureId = new Map();
const uomLegacyIdByPresentationName = new Map();

for (const measure of source.medidas) {
  const name = normalizeUomName(measure.medida);
  const legacy = `medida:${legacyId(measure.idmedida)}`;
  const ensured = ensureUom(legacy, name, guessSymbol(name), num(measure.idmedida));
  if (ensured) uomLegacyIdByMeasureId.set(legacyId(measure.idmedida), ensured);
}

for (const presentation of source.presentaciones) {
  const name = normalizeUomName(presentation.presentacion) || `PRESENTACION ${legacyId(presentation.idpresentacion)}`;
  const legacy = `presentacion_uom:${slug(name)}`;
  const ensured = ensureUom(legacy, name, guessSymbol(name), 100 + uomsByName.size);
  if (ensured) uomLegacyIdByPresentationName.set(name, ensured);
}

const latestCostByProduct = buildLatestCostByProduct();
const productRows = buildProducts();
const productLegacyIds = new Set(productRows.map((row) => row.legacy_id));

const tables = {
  legacy_branches: {
    columns: ['legacy_id', 'code', 'name', 'address', 'phone', 'is_active'],
    rows: [{
      legacy_id: 'branch:default',
      code: branchCode,
      name: branchName,
      address: nullableText(branchAddress),
      phone: nullableText(branchPhone),
      is_active: true,
    }],
  },
  legacy_categories: {
    columns: ['legacy_id', 'name', 'sort_order'],
    rows: [{
      legacy_id: DEFAULT_CATEGORY_ID,
      name: DEFAULT_CATEGORY_NAME,
      sort_order: 0,
    }],
  },
  legacy_brands: {
    columns: ['legacy_id', 'name'],
    rows: [],
  },
  legacy_uoms: {
    columns: ['legacy_id', 'name', 'symbol', 'sort_order'],
    rows: Array.from(uomsByName.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  },
  legacy_suppliers: {
    columns: ['legacy_id', 'name', 'phone', 'email', 'address', 'rfc', 'notes', 'is_active'],
    rows: buildSuppliers(),
  },
  legacy_products: {
    columns: [
      'legacy_id',
      'sku',
      'barcode',
      'name',
      'brand_legacy_id',
      'brand_name',
      'category_legacy_id',
      'category_name',
      'uom_legacy_id',
      'uom_name',
      'origin_country',
      'volume_ml',
      'alcohol_pct',
      'vintage_year',
      'price_retail',
      'price_mid_wholesale',
      'price_wholesale',
      'cost',
      'purchase_cost',
      'min_stock',
      'max_stock',
      'image_url',
      'notes',
      'is_active',
      'is_divisible',
      'price_mid_wholesale_min_qty',
      'price_wholesale_min_qty',
      'single_price_mode',
    ],
    rows: productRows,
  },
  legacy_product_stocks: {
    columns: ['product_legacy_id', 'branch_legacy_id', 'qty'],
    rows: buildProductStocks(),
  },
  legacy_product_uoms: {
    columns: [
      'legacy_id',
      'product_legacy_id',
      'uom_legacy_id',
      'uom_name',
      'factor_to_base',
      'price_retail',
      'price_mid_wholesale',
      'price_wholesale',
      'is_active',
    ],
    rows: buildProductUoms(),
  },
  legacy_customers: {
    columns: [
      'legacy_id',
      'branch_legacy_id',
      'name',
      'phone',
      'email',
      'birthday',
      'gender',
      'tags',
      'status',
      'preferred_payment_method',
      'preferred_branch_legacy_id',
      'notes',
      'is_active',
      'customer_types',
      'credit_limit',
      'wallet_enabled',
      'wallet_balance',
      'created_at',
    ],
    rows: buildCustomers(),
  },
  legacy_sales: {
    columns: [
      'legacy_id',
      'branch_legacy_id',
      'customer_legacy_id',
      'payment_method',
      'price_type',
      'subtotal',
      'discount_amount',
      'total',
      'delivery_address',
      'notes',
      'created_by',
      'created_at',
      'deleted_at',
      'delete_note',
      'coupon_code',
      'wallet_used',
      'credit_used',
      'cash_received',
      'payment_type_audit',
      'split_payment_method',
      'split_payment_amount',
    ],
    rows: buildSales(),
  },
  legacy_sale_items: {
    columns: [
      'legacy_id',
      'sale_legacy_id',
      'product_legacy_id',
      'product_uom_legacy_id',
      'qty',
      'price_type',
      'unit_price',
      'line_total',
      'factor_used',
      'qty_base',
    ],
    rows: buildSaleItems(),
  },
  legacy_credit_payments: {
    columns: [
      'legacy_id',
      'sale_legacy_id',
      'customer_legacy_id',
      'amount',
      'payment_method',
      'reference',
      'notes',
      'created_by',
      'created_at',
      'deleted_at',
    ],
    rows: buildCreditPayments(),
  },
  legacy_purchases: {
    columns: [
      'legacy_id',
      'branch_legacy_id',
      'supplier_legacy_id',
      'reference',
      'purchase_date',
      'total',
      'notes',
      'created_by',
      'created_at',
      'deleted_at',
      'delete_note',
      'is_credit',
    ],
    rows: buildPurchases(),
  },
  legacy_purchase_items: {
    columns: [
      'legacy_id',
      'purchase_legacy_id',
      'product_legacy_id',
      'product_uom_legacy_id',
      'qty',
      'cost_per_unit',
      'subtotal',
      'factor_used',
      'qty_base',
    ],
    rows: buildPurchaseItems(),
  },
};

mkdirSync(outDir, { recursive: true });

for (const [name, table] of Object.entries(tables)) {
  const csvPath = path.join(outDir, `${name}.csv`);
  writeFileSync(csvPath, toCsv(table.columns, table.rows));
}

writeFileSync(path.join(outDir, 'load_staging_csv.psql'), buildPsqlLoader());

const summary = buildSummary();
writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function tableRows(name) {
  const insertRe = new RegExp(`INSERT INTO \`${escapeRegExp(name)}\` \\(([^)]+)\\) VALUES\\n([\\s\\S]*?);`, 'g');
  const rows = [];
  let match;
  while ((match = insertRe.exec(sql))) {
    const columns = Array.from(match[1].matchAll(/`([^`]+)`/g), (columnMatch) => columnMatch[1]);
    for (const values of splitMysqlRows(match[2])) {
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    }
  }
  return rows;
}

function splitMysqlRows(valuesSql) {
  const rows = [];
  let row = [];
  let token = '';
  let quoted = false;
  let tokenWasQuoted = false;
  let escaped = false;
  let inRow = false;

  for (let i = 0; i < valuesSql.length; i += 1) {
    const ch = valuesSql[i];

    if (!inRow) {
      if (ch === '(') {
        inRow = true;
        row = [];
        token = '';
        tokenWasQuoted = false;
      }
      continue;
    }

    if (quoted) {
      if (escaped) {
        token += decodeMysqlEscape(ch);
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === "'") {
        if (valuesSql[i + 1] === "'") {
          token += "'";
          i += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      token += ch;
      continue;
    }

    if (ch === "'") {
      quoted = true;
      tokenWasQuoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(coerceMysqlToken(token, tokenWasQuoted));
      token = '';
      tokenWasQuoted = false;
      continue;
    }
    if (ch === ')') {
      row.push(coerceMysqlToken(token, tokenWasQuoted));
      rows.push(row);
      inRow = false;
      token = '';
      tokenWasQuoted = false;
      continue;
    }
    token += ch;
  }

  return rows;
}

function decodeMysqlEscape(ch) {
  switch (ch) {
    case '0': return '\0';
    case 'b': return '\b';
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case 'Z': return '\x1a';
    default: return ch;
  }
}

function coerceMysqlToken(raw, quoted) {
  if (quoted) return raw;
  const value = raw.trim();
  if (value.toUpperCase() === 'NULL') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function buildSuppliers() {
  return source.proveedores.map((row) => ({
    legacy_id: legacyId(row.idproveedor),
    name: nullableText(row.nombre) || nullableText(row.razonsocial) || `Proveedor ${legacyId(row.idproveedor)}`,
    phone: nullableText(row.telefono),
    email: validEmail(row.correo),
    address: nullableText(row.direccion),
    rfc: nullableText(row.rfc),
    notes: joinNotes([
      ['Razon social origen', row.razonsocial],
      ['Correo origen', validEmail(row.correo) ? null : row.correo],
      ['CP origen', row.cp],
      ['Fecha alta origen', safeDate(row.create)],
    ]),
    is_active: num(row.status) === 1,
  }));
}

function buildProducts() {
  return source.productos.map((row) => {
    const productId = legacyId(row.idproducto);
    const measureId = legacyId(row.medida);
    const measureName = normalizeUomName(byMeasureId.get(measureId)?.medida);
    const primary = choosePrimaryPresentation(productId);
    const lastCost = latestCostByProduct.get(productId) ?? null;
    const imagePath = firstImageByProduct.get(productId) ?? null;
    const barcode = nullableCode(row.codigo_barras);

    return {
      legacy_id: productId,
      sku: buildSku(productId),
      barcode,
      name: nullableText(row.producto) || `Producto ${productId}`,
      brand_legacy_id: null,
      brand_name: null,
      category_legacy_id: DEFAULT_CATEGORY_ID,
      category_name: DEFAULT_CATEGORY_NAME,
      uom_legacy_id: uomLegacyIdByMeasureId.get(measureId) ?? null,
      uom_name: measureName,
      origin_country: null,
      volume_ml: null,
      alcohol_pct: null,
      vintage_year: null,
      price_retail: money(primary?.menudeo),
      price_mid_wholesale: money(primary?.mayoreo),
      price_wholesale: money(primary?.mayoreo),
      cost: lastCost,
      purchase_cost: lastCost,
      min_stock: num(row.minimo),
      max_stock: 9999,
      image_url: imagePath,
      notes: joinNotes([
        ['ID producto origen', productId],
        ['Medida origen', byMeasureId.get(measureId)?.medida],
        ['Generado sistema origen', row.generado_sistema],
      ]),
      is_active: num(row.status) === 1,
      is_divisible: isDivisibleMeasure(measureName),
      price_mid_wholesale_min_qty: primary ? Math.max(1, num(primary.cantidadminima, 1)) : 6,
      price_wholesale_min_qty: primary ? Math.max(1, num(primary.cantidadminima, 1)) : 12,
      single_price_mode: primary ? money(primary.mayoreo) === money(primary.menudeo) : false,
    };
  });
}

function buildProductStocks() {
  return source.productos.map((row) => ({
    product_legacy_id: legacyId(row.idproducto),
    branch_legacy_id: 'branch:default',
    qty: num(row.stock),
  }));
}

function buildProductUoms() {
  return source.presentaciones
    .filter((row) => productLegacyIds.has(legacyId(row.idproducto)))
    .map((row) => {
      const name = normalizeUomName(row.presentacion) || `PRESENTACION ${legacyId(row.idpresentacion)}`;
      return {
        legacy_id: presentationLegacyId(row.idpresentacion),
        product_legacy_id: legacyId(row.idproducto),
        uom_legacy_id: uomLegacyIdByPresentationName.get(name) ?? null,
        uom_name: name,
        factor_to_base: factorToBase(row),
        price_retail: money(row.menudeo),
        price_mid_wholesale: money(row.mayoreo),
        price_wholesale: money(row.mayoreo),
        is_active: num(row.status) === 1,
      };
    });
}

function buildCustomers() {
  return source.clientes.map((row) => {
    const active = num(row.status) === 1;
    return {
      legacy_id: legacyId(row.idcliente),
      branch_legacy_id: 'branch:default',
      name: nullableText(row.nombre) || nullableText(row.razonsocial) || `Cliente ${legacyId(row.idcliente)}`,
      phone: nullableText(row.telefono),
      email: validEmail(row.correo),
      birthday: null,
      gender: null,
      tags: '{}',
      status: active ? 'ACTIVO' : 'PERDIDO',
      preferred_payment_method: num(row.status_credito) === 1 ? 'CREDITO' : 'EFECTIVO',
      preferred_branch_legacy_id: 'branch:default',
      notes: joinNotes([
        ['Razon social origen', row.razonsocial],
        ['RFC origen', row.rfc],
        ['Correo origen', validEmail(row.correo) ? null : row.correo],
        ['Direccion origen', row.direccion],
        ['CP origen', row.cp],
        ['Dias credito origen', row.diascredito],
        ['Credito usado origen', row.creditousado],
      ]),
      is_active: active,
      customer_types: '{materiales}',
      credit_limit: money(row.credito),
      wallet_enabled: false,
      wallet_balance: 0,
      created_at: safeTimestamp(row.create),
    };
  });
}

function buildSales() {
  return source.ventas.map((row) => {
    const saleId = legacyId(row.idventa);
    const creditSale = isCreditSale(row);
    const total = money(row.total);
    return {
      legacy_id: saleId,
      branch_legacy_id: 'branch:default',
      customer_legacy_id: legacyId(row.cliente),
      payment_method: creditSale ? 'CREDITO' : 'EFECTIVO',
      price_type: dominantPriceType(saleItemsBySaleId.get(saleId) ?? []),
      subtotal: total,
      discount_amount: 0,
      total,
      delivery_address: nullableText(row.direccion),
      notes: joinNotes([
        ['Usuario origen', row.usuario],
        ['Vendedor origen', row.vendedor],
        ['Liquidado origen', row.liquidado],
        ['Credito abonado origen', row.creditoabonado],
        ['Fecha limite origen', safeDate(row.fecha_limite)],
        ['Dias restantes origen', row.dias_restantes],
        ['Status origen', row.status],
      ]),
      created_by: DEFAULT_CREATED_BY,
      created_at: safeTimestamp(row.fecha),
      deleted_at: null,
      delete_note: null,
      coupon_code: null,
      wallet_used: 0,
      credit_used: creditSale ? total : 0,
      cash_received: creditSale ? 0 : total,
      payment_type_audit: '[]',
      split_payment_method: null,
      split_payment_amount: 0,
    };
  });
}

function buildSaleItems() {
  const rows = [];
  for (const row of source.listaventas) {
    const saleId = legacyId(row.idventa);
    const presentation = byPresentationId.get(legacyId(row.presentacion));
    if (!bySaleId.has(saleId)) {
      warnings.saleItemsSkippedMissingSale += 1;
      continue;
    }
    if (!presentation) {
      warnings.saleItemsSkippedMissingPresentation += 1;
      continue;
    }
    const productId = legacyId(presentation.idproducto);
    if (!productLegacyIds.has(productId)) {
      warnings.saleItemsSkippedMissingProduct += 1;
      continue;
    }
    const qty = num(row.cantidad);
    if (qty <= 0) {
      warnings.saleItemsSkippedInvalidQty += 1;
      continue;
    }
    const factor = factorToBase(presentation);
    const lineTotal = money(row.subtotal);
    rows.push({
      legacy_id: legacyId(row.idlistaventas),
      sale_legacy_id: saleId,
      product_legacy_id: productId,
      product_uom_legacy_id: presentationLegacyId(row.presentacion),
      qty,
      price_type: priceType(row),
      unit_price: roundMoney(lineTotal / qty),
      line_total: lineTotal,
      factor_used: factor,
      qty_base: roundQty(qty * factor),
    });
  }
  return rows;
}

function buildCreditPayments() {
  const rows = [];
  for (const row of source.abonos) {
    const amount = money(row.monto);
    const saleId = legacyId(row.idventa);
    const sale = bySaleId.get(saleId);
    if (amount <= 0) {
      warnings.creditPaymentsSkippedInvalidAmount += 1;
      continue;
    }
    if (!sale) {
      warnings.creditPaymentsSkippedMissingSale += 1;
      continue;
    }
    if (!isCreditSale(sale)) {
      warnings.creditPaymentsSkippedNonCreditSale += 1;
      continue;
    }
    rows.push({
      legacy_id: legacyId(row.idabono),
      sale_legacy_id: saleId,
      customer_legacy_id: legacyId(sale.cliente),
      amount,
      payment_method: paymentMethod(row.forma_pago),
      reference: `abono:${legacyId(row.idabono)}`,
      notes: joinNotes([
        ['Abono origen', row.idabono],
        ['Venta origen', saleId],
        ['Forma pago origen', row.forma_pago],
      ]),
      created_by: DEFAULT_CREATED_BY,
      created_at: safeTimestamp(row.fecha),
      deleted_at: null,
    });
  }
  return rows;
}

function buildPurchases() {
  return source.entradas.map((row) => {
    const purchaseId = legacyId(row.identrada);
    const payments = purchasePaymentsByPurchaseId.get(purchaseId) ?? [];
    const paymentTotal = payments.reduce((sum, payment) => sum + money(payment.monto), 0);
    return {
      legacy_id: purchaseId,
      branch_legacy_id: 'branch:default',
      supplier_legacy_id: legacyId(row.idproveedor),
      reference: `entrada:${purchaseId}`,
      purchase_date: safeDate(row.fecha),
      total: money(row.total),
      notes: joinNotes([
        ['Usuario origen', row.usuario],
        ['Liquidado origen', row.liquidado],
        ['Credito abonado origen', row.creditoabonado],
        ['Dias credito origen', row.diascredito],
        ['Status origen', row.status],
        ['Abonos proveedor origen', paymentTotal > 0 ? roundMoney(paymentTotal) : null],
      ]),
      created_by: DEFAULT_CREATED_BY,
      created_at: safeTimestamp(row.fecha),
      deleted_at: null,
      delete_note: null,
      is_credit: num(row.credito) === 1,
    };
  });
}

function buildPurchaseItems() {
  const rows = [];
  for (const row of source.listaentradas) {
    const purchaseId = legacyId(row.identrada);
    const presentation = byPresentationId.get(legacyId(row.presentacion));
    if (!byPurchaseId.has(purchaseId)) {
      warnings.purchaseItemsSkippedMissingPurchase += 1;
      continue;
    }
    if (!presentation) {
      warnings.purchaseItemsSkippedMissingPresentation += 1;
      continue;
    }
    const productId = legacyId(presentation.idproducto);
    if (!productLegacyIds.has(productId)) {
      warnings.purchaseItemsSkippedMissingProduct += 1;
      continue;
    }
    const qty = num(row.cantidad);
    if (qty <= 0) {
      warnings.purchaseItemsSkippedInvalidQty += 1;
      continue;
    }
    const factor = factorToBase(presentation);
    const subtotal = money(row.subtotal);
    rows.push({
      legacy_id: legacyId(row.idlistaentrada),
      purchase_legacy_id: purchaseId,
      product_legacy_id: productId,
      product_uom_legacy_id: presentationLegacyId(row.presentacion),
      qty,
      cost_per_unit: roundMoney(subtotal / qty),
      subtotal,
      factor_used: factor,
      qty_base: roundQty(qty * factor),
    });
  }
  return rows;
}

function buildLatestCostByProduct() {
  const latest = new Map();
  for (const item of source.listaentradas) {
    const presentation = byPresentationId.get(legacyId(item.presentacion));
    const purchase = byPurchaseId.get(legacyId(item.identrada));
    if (!presentation || !purchase) continue;
    const qty = num(item.cantidad);
    const factor = factorToBase(presentation);
    const qtyBase = qty * factor;
    if (qtyBase <= 0) continue;
    const productId = legacyId(presentation.idproducto);
    const date = safeTimestamp(purchase.fecha) ?? '';
    const cost = roundMoney(money(item.subtotal) / qtyBase);
    const current = latest.get(productId);
    if (!current || date >= current.date) {
      latest.set(productId, { date, cost });
    }
  }
  return new Map(Array.from(latest.entries(), ([productId, value]) => [productId, value.cost]));
}

function choosePrimaryPresentation(productId) {
  const presentations = presentationsByProductId.get(productId) ?? [];
  if (presentations.length === 0) return null;
  const candidates = presentations
    .filter((row) => num(row.status) === 1);
  const sourceRows = candidates.length > 0 ? candidates : presentations;
  return [...sourceRows].sort((a, b) => {
    const fa = factorToBase(a);
    const fb = factorToBase(b);
    const aExact = Math.abs(fa - 1) < 0.000001 ? 0 : 1;
    const bExact = Math.abs(fb - 1) < 0.000001 ? 0 : 1;
    return aExact - bExact || fa - fb || num(a.idpresentacion) - num(b.idpresentacion);
  })[0] ?? null;
}

function dominantPriceType(items) {
  const counts = { MENUDEO: 0, MEDIO_MAYOREO: 0, MAYOREO: 0, ESPECIAL: 0 };
  for (const item of items) counts[priceType(item)] += 1;
  if (counts.ESPECIAL > 0) return 'ESPECIAL';
  if (counts.MAYOREO > 0) return 'MAYOREO';
  if (counts.MEDIO_MAYOREO > 0) return 'MEDIO_MAYOREO';
  return 'MENUDEO';
}

function priceType(row) {
  const label = String(row.tipoventa ?? '').trim().toLowerCase();
  if (num(row.pespecial) === 1 || label.includes('especial')) return 'ESPECIAL';
  if (label.includes('medio')) return 'MEDIO_MAYOREO';
  if (label.includes('mayoreo')) return 'MAYOREO';
  return 'MENUDEO';
}

function paymentMethod(value) {
  const label = String(value ?? '').trim().toLowerCase();
  if (label.startsWith('tar') || label === 't') return 'TARJETA';
  if (label.startsWith('trans') || label === 'r') return 'TRANSFERENCIA';
  if (label.startsWith('che') || label === 'c') return 'CHEQUE';
  return 'EFECTIVO';
}

function isCreditSale(row) {
  return num(row.credito) === 1 || num(row.liquidado) === 0;
}

function factorToBase(row) {
  const factor = num(row.factor_a_base);
  return factor > 0 ? factor : 1;
}

function presentationLegacyId(value) {
  return `presentacion:${legacyId(value)}`;
}

function buildSku(productId) {
  return `MAT-${String(productId).padStart(5, '0')}`;
}

function isDivisibleMeasure(name) {
  const normalized = String(name ?? '').toUpperCase();
  return normalized.includes('KILO') || normalized.includes('METRO') || normalized.includes('LITRO');
}

function ensureUom(legacy, name, symbol, sortOrder) {
  const normalized = normalizeUomName(name);
  if (!normalized) return null;
  const key = normalized.toLowerCase();
  const existing = uomsByName.get(key);
  if (existing) return existing.legacy_id;
  const row = {
    legacy_id: legacy,
    name: normalized,
    symbol: nullableText(symbol),
    sort_order: sortOrder ?? uomsByName.size,
  };
  uomsByName.set(key, row);
  return legacy;
}

function normalizeUomName(value) {
  const text = nullableText(value);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim().toUpperCase();
  if (['KILO(S)', 'KILOS', 'KILO'].includes(normalized)) return 'KILOS';
  if (['PIEZA(S)', 'PIEZAS', 'PIEZA'].includes(normalized)) return normalized === 'PIEZA' ? 'PIEZA' : 'PIEZAS';
  if (['METRO(S)', 'METROS', 'METRO'].includes(normalized)) return normalized === 'METRO' ? 'METRO' : 'METROS';
  return normalized;
}

function guessSymbol(name) {
  const normalized = String(name ?? '').toUpperCase();
  if (normalized.includes('KILO')) return 'kg';
  if (normalized.includes('PIEZA')) return 'pza';
  if (normalized.includes('METRO')) return 'm';
  if (normalized === 'TON') return 'ton';
  if (normalized === 'BULTO') return 'bulto';
  return null;
}

function nullableCode(value) {
  const text = nullableText(value);
  if (!text) return null;
  if (['undefined', 'null', 'n/a', 'na'].includes(text.toLowerCase())) return null;
  return text;
}

function nullableText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return null;
  return text;
}

function validEmail(value) {
  const text = nullableText(value);
  if (!text) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

function safeDate(value) {
  const text = nullableText(value);
  if (!text || text.startsWith('0000-00-00')) return null;
  return text.slice(0, 10);
}

function safeTimestamp(value) {
  const text = nullableText(value);
  if (!text || text.startsWith('0000-00-00')) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  return text;
}

function joinNotes(entries) {
  const parts = [];
  for (const [label, value] of entries) {
    const text = nullableText(value);
    if (text) parts.push(`${label}: ${text}`);
  }
  return parts.length > 0 ? parts.join(' | ') : null;
}

function legacyId(value) {
  if (value == null) return null;
  return String(value).trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  return roundMoney(num(value));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundQty(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function indexBy(rows, key) {
  return new Map(rows.map((row) => [legacyId(row[key]), row]));
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = legacyId(row[key]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'uom';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvValue(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildPsqlLoader() {
  const loadOrder = [
    'legacy_branches',
    'legacy_categories',
    'legacy_brands',
    'legacy_uoms',
    'legacy_suppliers',
    'legacy_products',
    'legacy_product_stocks',
    'legacy_product_uoms',
    'legacy_customers',
    'legacy_sales',
    'legacy_sale_items',
    'legacy_credit_payments',
    'legacy_purchases',
    'legacy_purchase_items',
  ];
  const truncates = [...loadOrder].reverse().map((name) => `migration_vinos.${name}`).join(', ');
  const lines = [
    '\\set ON_ERROR_STOP on',
    '',
    `truncate ${truncates};`,
    '',
  ];

  for (const name of loadOrder) {
    const table = tables[name];
    const csvPath = path.resolve(outDir, `${name}.csv`).replace(/\\/g, '/').replace(/'/g, "''");
    lines.push(`\\copy migration_vinos.${name} (${table.columns.join(', ')}) from '${csvPath}' with (format csv, header true)`);
  }

  return `${lines.join('\n')}\n`;
}

function buildSummary() {
  const saleCreditRows = source.ventas.filter(isCreditSale);
  const creditSaleIds = new Set(saleCreditRows.map((row) => legacyId(row.idventa)));
  const creditPayments = tables.legacy_credit_payments.rows;
  const salesTotal = source.ventas.reduce((sum, row) => sum + money(row.total), 0);
  const stagingSalesTotal = tables.legacy_sales.rows.reduce((sum, row) => sum + money(row.total), 0);
  const creditTotal = saleCreditRows.reduce((sum, row) => sum + money(row.total), 0);
  const creditPaid = creditPayments.reduce((sum, row) => sum + money(row.amount), 0);

  return {
    dump: path.resolve(dumpPath),
    outDir: path.resolve(outDir),
    branch: {
      code: branchCode,
      name: branchName,
      address: branchAddress,
    },
    sourceCounts: Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, rows.length])),
    stagingCounts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length])),
    totals: {
      sourceSalesTotal: roundMoney(salesTotal),
      stagingSalesTotal: roundMoney(stagingSalesTotal),
      sourceCreditSalesCount: saleCreditRows.length,
      sourceCreditSalesTotal: roundMoney(creditTotal),
      stagedCreditPaymentsCount: creditPayments.length,
      stagedCreditPaymentsTotal: roundMoney(creditPaid),
      expectedCreditBalance: roundMoney(creditTotal - creditPaid),
      sourceCreditSaleIdsWithPayments: source.abonos
        .filter((row) => creditSaleIds.has(legacyId(row.idventa)) && money(row.monto) > 0)
        .length,
    },
    warnings,
  };
}
