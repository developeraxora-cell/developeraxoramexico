import { Consumption, consumptionFolio } from './consumption.service';
import { formatCurrency } from '../currency';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function printConsumptionTicket(row: Consumption, settlement: boolean, target: Window | null) {
  if (!target || target.closed) throw new Error('No se pudo abrir la impresion. Usa Reimprimir y permite ventanas emergentes.');
  const date = (v: string) => new Date(v.length === 10 ? `${v}T12:00:00-06:00` : v).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', ...(v.length > 10 ? { timeStyle: 'short' as const } : {}) });
  const total = settlement ? row.total : row.items.reduce((s, i) => s + i.qty_out * i.unit_price, 0);
  target.document.open();
  target.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(consumptionFolio(row.folio))}</title><style>
    @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font:12px monospace;color:#000;margin:0;padding:8px;max-width:76mm}h1{font-size:17px;text-align:center}h2{font-size:14px;text-align:center}p{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:6px 2px;text-align:right;vertical-align:top;border-bottom:1px dashed #888}td:first-child,th:first-child{text-align:left}.name{font-weight:bold;text-align:left}button{padding:10px}@media print{button{display:none}}</style></head><body>
    <h1>CASA TAHONA</h1><h2>${settlement ? 'LIQUIDACION DE CONSUMO' : 'SALIDA A CONSUMO'}</h2>
    <p>Folio: ${escape(consumptionFolio(row.folio))}<br>Cliente: ${escape(row.customer_name)}<br>Salida: ${escape(date(row.created_at))}<br>Fecha limite: ${escape(date(row.due_date))}${settlement && row.settled_at ? `<br>Liquidacion: ${escape(date(row.settled_at))}<br>Pago: ${escape(row.payment_method)}<br>Venta: ${row.sale_id ? escape(`V-${row.sale_id.replace(/-/g, '').slice(0,6).toUpperCase()}`) : 'Devolucion total'}` : ''}</p>
    <table><thead><tr><th>Salieron</th>${settlement ? '<th>Regresaron</th><th>Consumidas</th>' : ''}<th>Precio</th><th>Total</th></tr></thead><tbody>
    ${row.items.map(i => `<tr><td class="name" colspan="${settlement ? 5 : 3}">${escape(i.product_name)}</td></tr><tr><td>${i.qty_out}</td>${settlement ? `<td>${i.qty_returned}</td><td>${i.qty_out-i.qty_returned}</td>` : ''}<td>${escape(formatCurrency(i.unit_price))}</td><td>${escape(formatCurrency((settlement ? i.qty_out-i.qty_returned : i.qty_out)*i.unit_price))}</td></tr>`).join('')}</tbody></table>
    <h2>${settlement ? row.payment_method === 'CREDITO' ? 'CARGO A CREDITO' : 'TOTAL COBRADO' : 'VALOR DE SALIDA'}: ${escape(formatCurrency(total))}</h2>
    ${!settlement ? '<p>Salida sin pago. Firma de recibido:</p><br><hr>' : ''}<button onclick="window.print()">Imprimir</button></body></html>`);
  target.document.close();
  target.focus();
  target.print();
}
