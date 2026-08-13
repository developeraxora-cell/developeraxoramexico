#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_DUMP = 'concre45_crm2.sql';
const DEFAULT_OUT_DIR = 'migration/materiales_jesus_maria/out';
const BRANCH_LEGACY_ID = 'branch:jesus-maria';
const BRANCH_CODE = 'B2';
const BRANCH_NAME = 'JESUS MARIA LOPAR';
const BRANCH_ADDRESS = 'Calle 45 x 10';
const CATEGORY_LEGACY_ID = 'category:materiales';
const CATEGORY_NAME = 'Materiales';

const argv = parseArgs(process.argv.slice(2));
const dumpPath = argv._[0] ?? DEFAULT_DUMP;
const outDir = argv.out ?? DEFAULT_OUT_DIR;
const branchCode = String(argv['branch-code'] ?? BRANCH_CODE).trim();
const branchName = String(argv['branch-name'] ?? BRANCH_NAME).trim();
const branchAddress = String(argv['branch-address'] ?? BRANCH_ADDRESS).trim();

if (!branchCode || branchCode.toUpperCase() === 'CODIGO_REAL') {
  throw new Error('Codigo de sucursal invalido. Para Materiales Jesus Maria usa --branch-code B2.');
}
if (branchCode !== 'B2') {
  console.warn(`Aviso: esta migracion es para Materiales Jesus Maria. En Supabase la sucursal detectada es B2; se recibio ${branchCode}.`);
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

const productsById = indexBy(source.productos, 'idproducto');
const presentationsById = indexBy(source.presentaciones, 'idpresentacion');
const salesById = indexBy(source.ventas, 'idventa');
const purchasesById = indexBy(source.entradas, 'identrada');
const measuresById = indexBy(source.medidas, 'idmedida');
const saleItemsBySaleId = groupBy(source.listaventas, 'idventa');
const paymentsBySaleId = groupBy(source.abonos, 'idventa');
const purchasePaymentsByPurchaseId = groupBy(source.abonosentradas, 'identrada');
const presentationsByProductId = groupBy(source.presentaciones, 'idproducto');

const uomsByCode = new Map();
const measureUomLegacyById = new Map();
const presentationUomLegacyByName = new Map();

for (const measure of source.medidas) {
  const name = normalizeUomName(measure.medida);
  const code = uomCode(name);
  const legacy = `measure:${legacyId(measure.idmedida)}`;
  ensureUom(legacy, code, name);
  measureUomLegacyById.set(legacyId(measure.idmedida), legacy);
}

for (const presentation of source.presentaciones) {
  const name = normalizeUomName(presentation.presentacion) || `PRESENTACION ${legacyId(presentation.idpresentacion)}`;
  const code = uomCode(name);
  const legacy = `presentation-uom:${code}`;
  ensureUom(legacy, code, name);
  presentationUomLegacyByName.set(name, legacy);
}

const firstImageByProduct = new Map();
for (const image of source.producto_imagenes) {
  const productId = legacyId(image.producto_id);
  if (!firstImageByProduct.has(productId) && nullableText(image.imagen)) {
    firstImageByProduct.set(productId, nullableText(image.imagen));
  }
}

const latestCostByProduct = buildLatestCostByProduct();
const productRows = buildProducts();
const productLegacyIds = new Set(productRows.map((row) => row.legacy_id));
const creditPaymentRows = buildCreditPayments();
const creditPaymentSumBySale = creditPaymentRows.reduce((acc, row) => {
  acc[row.note_legacy_id] = (acc[row.note_legacy_id] ?? 0) + Number(row.amount ?? 0);
  return acc;
}, {});

const tables = {
  legacy_branches: {
    columns: ['legacy_id', 'code', 'name', 'address', 'phone', 'is_active'],
    rows: [{
      legacy_id: BRANCH_LEGACY_ID,
      code: branchCode,
      name: branchName,
      address: branchAddress,
      phone: null,
      is_active: true,
    }],
  },
  legacy_categories: {
    columns: ['legacy_id', 'name'],
    rows: [{ legacy_id: CATEGORY_LEGACY_ID, name: CATEGORY_NAME }],
  },
  legacy_uoms: {
    columns: ['legacy_id', 'code', 'name'],
    rows: Array.from(uomsByCode.values()).sort((a, b) => a.code.localeCompare(b.code)),
  },
  legacy_suppliers: {
    columns: ['legacy_id', 'branch_legacy_id', 'name', 'phone', 'email', 'address', 'notes', 'is_active', 'created_at'],
    rows: buildSuppliers(),
  },
  legacy_products: {
    columns: ['legacy_id', 'branch_legacy_id', 'sku', 'barcode', 'name', 'category_legacy_id', 'base_uom_legacy_id', 'purchase_price', 'wholesale_price', 'retail_price', 'min_stock', 'stock_qty', 'description', 'is_divisible', 'is_active', 'created_at'],
    rows: productRows,
  },
  legacy_product_uoms: {
    columns: ['legacy_id', 'product_legacy_id', 'uom_legacy_id', 'purpose', 'factor_to_base', 'wholesale_price', 'retail_price', 'is_default_purchase', 'is_default_sale'],
    rows: buildProductUoms(),
  },
  legacy_credit_customers: {
    columns: ['legacy_id', 'branch_legacy_id', 'name', 'phone', 'address', 'credit_limit', 'default_credit_days', 'policy', 'allow_cash_if_blocked', 'late_tolerance_days', 'is_active', 'created_at'],
    rows: buildCreditCustomers(),
  },
  legacy_inventory_transactions: {
    columns: ['legacy_id', 'tx_type', 'branch_legacy_id', 'supplier_legacy_id', 'customer_legacy_id', 'reference', 'notes', 'purchase_date', 'is_credit', 'nombre_cliente', 'direccion_cliente', 'payment_type', 'wallet_amount', 'cash_amount', 'credit_amount', 'created_by', 'created_at'],
    rows: [...buildPurchases(), ...buildSales()],
  },
  legacy_inventory_transaction_items: {
    columns: ['legacy_id', 'transaction_legacy_id', 'product_legacy_id', 'product_uom_legacy_id', 'qty', 'factor_used', 'qty_base', 'unit_price', 'line_total', 'barcode_scanned'],
    rows: [...buildPurchaseItems(), ...buildSaleItems()],
  },
  legacy_credit_notes: {
    columns: ['legacy_id', 'sale_legacy_id', 'customer_legacy_id', 'folio', 'sale_reference', 'issue_date', 'due_date', 'credit_days_applied', 'total', 'paid_amount', 'balance', 'notes'],
    rows: buildCreditNotes(),
  },
  legacy_credit_payments: {
    columns: ['legacy_id', 'note_legacy_id', 'paid_at', 'amount', 'method', 'reference', 'notes'],
    rows: creditPaymentRows,
  },
};

mkdirSync(outDir, { recursive: true });
for (const [name, table] of Object.entries(tables)) {
  writeFileSync(path.join(outDir, `${name}.csv`), toCsv(table.columns, table.rows));
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
    branch_legacy_id: BRANCH_LEGACY_ID,
    name: nullableText(row.nombre) || nullableText(row.razonsocial) || `Proveedor ${legacyId(row.idproveedor)}`,
    phone: nullableText(row.telefono),
    email: validEmail(row.correo),
    address: nullableText(row.direccion),
    notes: joinNotes([
      ['Razon social origen', row.razonsocial],
      ['RFC origen', row.rfc],
      ['Correo origen', validEmail(row.correo) ? null : row.correo],
      ['CP origen', row.cp],
    ]),
    is_active: num(row.status) === 1,
    created_at: safeTimestamp(row.create),
  }));
}

function buildProducts() {
  return source.productos.map((row) => {
    const productId = legacyId(row.idproducto);
    const measureId = legacyId(row.medida);
    const baseUomLegacy = measureUomLegacyById.get(measureId) ?? measureUomLegacyById.values().next().value;
    const baseUomName = normalizeUomName(measuresById.get(measureId)?.medida);
    const primary = choosePrimaryPresentation(productId);
    const lastCost = latestCostByProduct.get(productId) ?? 0;
    const barcode = nullableCode(row.codigo_barras);
    return {
      legacy_id: productId,
      branch_legacy_id: BRANCH_LEGACY_ID,
      sku: `MAT-${String(productId).padStart(5, '0')}`,
      barcode,
      name: nullableText(row.producto) || `Producto ${productId}`,
      category_legacy_id: CATEGORY_LEGACY_ID,
      base_uom_legacy_id: baseUomLegacy,
      purchase_price: lastCost,
      wholesale_price: money(primary?.mayoreo),
      retail_price: money(primary?.menudeo),
      min_stock: num(row.minimo),
      stock_qty: num(row.stock),
      description: joinNotes([
        ['ID producto origen', productId],
        ['Medida origen', measuresById.get(measureId)?.medida],
        ['Imagen origen', firstImageByProduct.get(productId)],
        ['Generado sistema origen', row.generado_sistema],
      ]),
      is_divisible: isDivisibleUom(baseUomName),
      is_active: num(row.status) === 1,
      created_at: null,
    };
  });
}

function buildProductUoms() {
  const rows = [];
  const defaultByProduct = new Set();
  for (const p of source.presentaciones) {
    const productId = legacyId(p.idproducto);
    if (!productLegacyIds.has(productId)) continue;
    const name = normalizeUomName(p.presentacion) || `PRESENTACION ${legacyId(p.idpresentacion)}`;
    const legacy = presentationLegacyId(p.idpresentacion);
    const factor = factorToBase(p);
    const isDefault = !defaultByProduct.has(productId) && Math.abs(factor - 1) < 0.000001;
    if (isDefault) defaultByProduct.add(productId);
    rows.push({
      legacy_id: legacy,
      product_legacy_id: productId,
      uom_legacy_id: presentationUomLegacyByName.get(name),
      purpose: 'BOTH',
      factor_to_base: factor,
      wholesale_price: money(p.mayoreo),
      retail_price: money(p.menudeo),
      is_default_purchase: isDefault,
      is_default_sale: isDefault,
    });
  }

  for (const product of productRows) {
    const hasDefault = rows.some((row) => row.product_legacy_id === product.legacy_id && row.is_default_purchase);
    if (hasDefault) continue;
    rows.push({
      legacy_id: `base:${product.legacy_id}`,
      product_legacy_id: product.legacy_id,
      uom_legacy_id: product.base_uom_legacy_id,
      purpose: 'BOTH',
      factor_to_base: 1,
      wholesale_price: product.wholesale_price,
      retail_price: product.retail_price,
      is_default_purchase: true,
      is_default_sale: true,
    });
  }

  return rows;
}

function buildCreditCustomers() {
  return source.clientes.map((row) => ({
    legacy_id: legacyId(row.idcliente),
    branch_legacy_id: BRANCH_LEGACY_ID,
    name: nullableText(row.nombre) || nullableText(row.razonsocial) || `Cliente ${legacyId(row.idcliente)}`,
    phone: nullableText(row.telefono),
    address: nullableText(row.direccion),
    credit_limit: money(row.credito),
    default_credit_days: Math.max(1, num(row.diascredito, 15) || 15),
    policy: 'BLOQUEO_PARCIAL',
    allow_cash_if_blocked: true,
    late_tolerance_days: 0,
    is_active: num(row.status) === 1,
    created_at: safeTimestamp(row.create),
  }));
}

function buildPurchases() {
  return source.entradas.map((row) => {
    const id = legacyId(row.identrada);
    return {
      legacy_id: purchaseLegacyId(id),
      tx_type: 'PURCHASE',
      branch_legacy_id: BRANCH_LEGACY_ID,
      supplier_legacy_id: legacyId(row.idproveedor),
      customer_legacy_id: null,
      reference: `MIG-JM-ENTRADA-${id}`,
      notes: null,
      purchase_date: safeDate(row.fecha),
      is_credit: num(row.credito) === 1,
      nombre_cliente: null,
      direccion_cliente: null,
      payment_type: null,
      wallet_amount: 0,
      cash_amount: 0,
      credit_amount: 0,
      created_by: nullableText(row.usuario),
      created_at: safeTimestamp(row.fecha),
    };
  });
}

function buildSales() {
  return source.ventas.map((row) => {
    const id = legacyId(row.idventa);
    const customer = source.clientes.find((c) => legacyId(c.idcliente) === legacyId(row.cliente));
    const total = money(row.total);
    const credit = isCreditSale(row);
    return {
      legacy_id: saleLegacyId(id),
      tx_type: 'SALE',
      branch_legacy_id: BRANCH_LEGACY_ID,
      supplier_legacy_id: null,
      customer_legacy_id: legacyId(row.cliente),
      reference: `MIG-JM-VENTA-${id}`,
      notes: null,
      purchase_date: null,
      is_credit: credit,
      nombre_cliente: nullableText(customer?.nombre) || `Cliente ${legacyId(row.cliente)}`,
      direccion_cliente: nullableText(row.direccion),
      payment_type: credit ? 'CREDITO' : 'EFECTIVO',
      wallet_amount: 0,
      cash_amount: credit ? 0 : total,
      credit_amount: credit ? total : 0,
      created_by: nullableText(row.usuario),
      created_at: safeTimestamp(row.fecha),
    };
  });
}

function buildPurchaseItems() {
  const rows = [];
  for (const item of source.listaentradas) {
    const purchaseId = legacyId(item.identrada);
    const presentation = presentationsById.get(legacyId(item.presentacion));
    if (!purchasesById.has(purchaseId)) {
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
    const qty = num(item.cantidad);
    if (qty <= 0) {
      warnings.purchaseItemsSkippedInvalidQty += 1;
      continue;
    }
    const lineTotal = money(item.subtotal);
    const factor = factorToBase(presentation);
    rows.push({
      legacy_id: `purchase-item:${legacyId(item.idlistaentrada)}`,
      transaction_legacy_id: purchaseLegacyId(purchaseId),
      product_legacy_id: productId,
      product_uom_legacy_id: presentationLegacyId(item.presentacion),
      qty,
      factor_used: factor,
      qty_base: roundQty(qty * factor),
      unit_price: roundMoney(lineTotal / qty),
      line_total: lineTotal,
      barcode_scanned: null,
    });
  }
  return rows;
}

function buildSaleItems() {
  const rows = [];
  for (const item of source.listaventas) {
    const saleId = legacyId(item.idventa);
    const presentation = presentationsById.get(legacyId(item.presentacion));
    if (!salesById.has(saleId)) {
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
    const qty = num(item.cantidad);
    if (qty <= 0) {
      warnings.saleItemsSkippedInvalidQty += 1;
      continue;
    }
    const lineTotal = money(item.subtotal);
    const factor = factorToBase(presentation);
    rows.push({
      legacy_id: `sale-item:${legacyId(item.idlistaventas)}`,
      transaction_legacy_id: saleLegacyId(saleId),
      product_legacy_id: productId,
      product_uom_legacy_id: presentationLegacyId(item.presentacion),
      qty,
      factor_used: factor,
      qty_base: roundQty(qty * factor),
      unit_price: roundMoney(lineTotal / qty),
      line_total: lineTotal,
      barcode_scanned: null,
    });
  }
  return rows;
}

function buildCreditPayments() {
  const rows = [];
  for (const payment of source.abonos) {
    const saleId = legacyId(payment.idventa);
    const sale = salesById.get(saleId);
    const amount = money(payment.monto);
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
      legacy_id: `credit-payment:${legacyId(payment.idabono)}`,
      note_legacy_id: creditNoteLegacyId(saleId),
      paid_at: safeTimestamp(payment.fecha),
      amount,
      method: paymentMethod(payment.forma_pago),
      reference: `MIG-JM-ABONO-${legacyId(payment.idabono)}`,
      notes: joinNotes([
        ['Abono origen', payment.idabono],
        ['Venta origen', saleId],
        ['Forma pago origen', payment.forma_pago],
      ]),
    });
  }

  const actualPaidByNote = rows.reduce((acc, row) => {
    acc[row.note_legacy_id] = roundMoney((acc[row.note_legacy_id] ?? 0) + money(row.amount));
    return acc;
  }, {});

  for (const sale of source.ventas.filter(isCreditSale)) {
    const saleId = legacyId(sale.idventa);
    const noteLegacyId = creditNoteLegacyId(saleId);
    const declaredPaid = money(sale.creditoabonado);
    const actualPaid = money(actualPaidByNote[noteLegacyId]);
    const missingPaid = roundMoney(declaredPaid - actualPaid);
    if (missingPaid <= 0) continue;

    rows.push({
      legacy_id: `credit-payment:synthetic:${saleId}`,
      note_legacy_id: noteLegacyId,
      paid_at: safeTimestamp(sale.fecha),
      amount: missingPaid,
      method: 'EFECTIVO',
      reference: `MIG-JM-ABONO-SINT-${saleId}`,
      notes: joinNotes([
        ['Abono sintetico por creditoabonado origen', missingPaid],
        ['Venta origen', saleId],
        ['Credito abonado origen', sale.creditoabonado],
      ]),
    });
  }

  return rows;
}

function buildCreditNotes() {
  return source.ventas
    .filter(isCreditSale)
    .map((sale) => {
      const saleId = legacyId(sale.idventa);
      const total = money(sale.total);
      const paid = roundMoney(creditPaymentSumBySale[creditNoteLegacyId(saleId)] ?? 0);
      const issue = safeDate(sale.fecha) ?? new Date().toISOString().slice(0, 10);
      const due = safeDate(sale.fecha_limite) ?? addDays(issue, Math.max(1, num(sale.dias_restantes, 15) || 15));
      return {
        legacy_id: creditNoteLegacyId(saleId),
        sale_legacy_id: saleLegacyId(saleId),
        customer_legacy_id: legacyId(sale.cliente),
        folio: `MIG-JM-CRED-${saleId}`,
        sale_reference: `MIG-JM-VENTA-${saleId}`,
        issue_date: issue,
        due_date: due,
        credit_days_applied: diffDays(issue, due),
        total,
        paid_amount: paid,
        balance: Math.max(0, roundMoney(total - paid)),
        notes: null,
      };
    });
}

function buildLatestCostByProduct() {
  const latest = new Map();
  for (const item of source.listaentradas) {
    const presentation = presentationsById.get(legacyId(item.presentacion));
    const purchase = purchasesById.get(legacyId(item.identrada));
    if (!presentation || !purchase) continue;
    const qtyBase = num(item.cantidad) * factorToBase(presentation);
    if (qtyBase <= 0) continue;
    const productId = legacyId(presentation.idproducto);
    const date = safeTimestamp(purchase.fecha) ?? '';
    const cost = roundMoney(money(item.subtotal) / qtyBase);
    const current = latest.get(productId);
    if (!current || date >= current.date) latest.set(productId, { date, cost });
  }
  return new Map(Array.from(latest.entries(), ([key, value]) => [key, value.cost]));
}

function choosePrimaryPresentation(productId) {
  const rows = presentationsByProductId.get(productId) ?? [];
  if (rows.length === 0) return null;
  const active = rows.filter((row) => num(row.status) === 1);
  return [...(active.length ? active : rows)].sort((a, b) => {
    const fa = factorToBase(a);
    const fb = factorToBase(b);
    const da = Math.abs(fa - 1) < 0.000001 ? 0 : 1;
    const db = Math.abs(fb - 1) < 0.000001 ? 0 : 1;
    return da - db || fa - fb || num(a.idpresentacion) - num(b.idpresentacion);
  })[0] ?? null;
}

function ensureUom(legacyIdValue, code, name) {
  if (!code || !name) return;
  if (!uomsByCode.has(code)) {
    uomsByCode.set(code, { legacy_id: legacyIdValue, code, name });
  }
}

function uomCode(name) {
  const clean = String(name ?? '').trim().toUpperCase();
  if (clean === 'KILOS') return 'KG';
  if (clean === 'PIEZAS' || clean === 'PIEZA') return 'PZA';
  if (clean === 'METROS' || clean === 'METRO') return 'M';
  if (clean === 'TON') return 'TON';
  if (clean === 'BULTO') return 'BULTO';
  return clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'UOM';
}

function normalizeUomName(value) {
  const text = nullableText(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (['KILO(S)', 'KILOS', 'KILO'].includes(upper)) return 'KILOS';
  if (['PIEZA(S)', 'PIEZAS', 'PIEZA'].includes(upper)) return 'PIEZAS';
  if (['METRO(S)', 'METROS', 'METRO'].includes(upper)) return 'METROS';
  return upper;
}

function isDivisibleUom(name) {
  const text = String(name ?? '').toUpperCase();
  return text.includes('KILO') || text.includes('METRO') || text.includes('LITRO') || text === 'TON';
}

function isCreditSale(sale) {
  const saleId = legacyId(sale.idventa);
  const hasPayments = (paymentsBySaleId.get(saleId) ?? []).some((payment) => money(payment.monto) > 0);
  return num(sale.credito) === 1
    || num(sale.liquidado) === 0
    || money(sale.creditoabonado) > 0
    || hasPayments;
}

function factorToBase(presentation) {
  const factor = num(presentation.factor_a_base);
  return factor > 0 ? factor : 1;
}

function paymentMethod(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text.startsWith('tar') || text === 't') return 'TARJETA';
  if (text.startsWith('trans') || text === 'r') return 'TRANSFERENCIA';
  if (text.startsWith('che') || text === 'c') return 'CHEQUE';
  return 'EFECTIVO';
}

function purchaseLegacyId(id) {
  return `purchase:${legacyId(id)}`;
}

function saleLegacyId(id) {
  return `sale:${legacyId(id)}`;
}

function creditNoteLegacyId(id) {
  return `credit-note:${legacyId(id)}`;
}

function presentationLegacyId(id) {
  return `presentation:${legacyId(id)}`;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const start = new Date(`${a}T00:00:00Z`).getTime();
  const end = new Date(`${b}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86400000);
  return Math.max(1, days);
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
  if (['null', 'undefined'].includes(text.toLowerCase())) return null;
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
  return parts.length ? parts.join(' | ') : null;
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvValue(row[column])).join(','));
  return `${lines.join('\n')}\n`;
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildPsqlLoader() {
  const order = [
    'legacy_branches',
    'legacy_categories',
    'legacy_uoms',
    'legacy_suppliers',
    'legacy_products',
    'legacy_product_uoms',
    'legacy_credit_customers',
    'legacy_inventory_transactions',
    'legacy_inventory_transaction_items',
    'legacy_credit_notes',
    'legacy_credit_payments',
  ];
  const truncates = [...order].reverse().map((name) => `migration_materiales_jm.${name}`).join(', ');
  const lines = ['\\set ON_ERROR_STOP on', '', `truncate ${truncates};`, ''];
  for (const name of order) {
    const table = tables[name];
    const csvPath = path.resolve(outDir, `${name}.csv`).replace(/\\/g, '/').replace(/'/g, "''");
    lines.push(`\\copy migration_materiales_jm.${name} (${table.columns.join(', ')}) from '${csvPath}' with (format csv, header true)`);
  }
  return `${lines.join('\n')}\n`;
}

function buildSummary() {
  const creditSales = source.ventas.filter(isCreditSale);
  const salesTotal = source.ventas.reduce((sum, row) => sum + money(row.total), 0);
  const purchaseTotal = source.entradas.reduce((sum, row) => sum + money(row.total), 0);
  const creditTotal = creditSales.reduce((sum, row) => sum + money(row.total), 0);
  const creditPaid = creditPaymentRows.reduce((sum, row) => sum + money(row.amount), 0);
  return {
    dump: path.resolve(dumpPath),
    outDir: path.resolve(outDir),
    target: {
      module: 'materiales',
      branchCode,
      branchName,
      branchAddress,
    },
    sourceCounts: Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, rows.length])),
    stagingCounts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length])),
    totals: {
      sourceSalesTotal: roundMoney(salesTotal),
      sourcePurchasesTotal: roundMoney(purchaseTotal),
      sourceCreditSalesCount: creditSales.length,
      sourceCreditSalesTotal: roundMoney(creditTotal),
      stagedCreditPaymentsCount: creditPaymentRows.length,
      stagedCreditPaymentsTotal: roundMoney(creditPaid),
      expectedCreditBalance: roundMoney(creditTotal - creditPaid),
    },
    warnings,
  };
}
