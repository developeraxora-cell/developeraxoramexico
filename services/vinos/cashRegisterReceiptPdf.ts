import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';
import type { CashRegisterSession } from './cashRegister.service';

interface GenerateCashRegisterReceiptOptions {
  mode?: 'download' | 'open' | 'print';
  targetWindow?: Window | null;
}

export interface CashRegisterReceiptInput {
  session: CashRegisterSession;
  branchName: string;
}

const sanitize = (text: string): string => {
  if (!text) return '';
  return String(text)
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[→←]/g, '->')
    .replace(/[^\x00-\xFF]/g, '?');
};

const formatLocalDateTime = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('es-MX');
};

export const generateVinosCashRegisterReceipt = async (
  input: CashRegisterReceiptInput,
  options: GenerateCashRegisterReceiptOptions = {},
) => {
  const { session } = input;
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const width = 212.6;
  const marginLeft = 5;
  const marginRight = 12;
  const contentWidth = width - marginLeft - marginRight;
  const lineGap = 10;

  const wrapText = (text: string, maxWidth: number, font: PDFFont, size: number) => {
    const safeText = sanitize(text).replace(/\s+/g, ' ').trim();
    if (!safeText) return [''];
    const lines: string[] = [];
    let current = '';
    safeText.split(' ').forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        return;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        return;
      }
      let chunk = '';
      word.split('').forEach((char) => {
        const next = `${chunk}${char}`;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = char;
        }
      });
      current = chunk;
    });
    if (current) lines.push(current);
    return lines;
  };

  const openingNotes = session.opening_observations?.trim()
    ? wrapText(`OBS. APERTURA: ${session.opening_observations.trim().toUpperCase()}`, contentWidth, fontRegular, 7)
    : [];
  const closingNotes = session.closing_observations?.trim()
    ? wrapText(`OBS. CIERRE: ${session.closing_observations.trim().toUpperCase()}`, contentWidth, fontRegular, 7)
    : [];
  const rows = [
    ['NUMERO DE TICKETS', String(Number(session.ticket_count ?? 0))],
    ['PRODUCTOS VENDIDOS', String(Number(session.products_sold ?? 0))],
    ['EFECTIVO INICIAL', formatCurrency(Number(session.opening_cash ?? 0))],
    ['VENTAS EFECTIVO', formatCurrency(Number(session.cash_sales_total ?? 0))],
    ['VENTAS TARJETA', formatCurrency(Number(session.card_sales_total ?? 0))],
    ['TRANSFERENCIAS', formatCurrency(Number(session.transfer_sales_total ?? 0))],
    ['VENTAS CREDITO', formatCurrency(Number(session.credit_sales_total ?? 0))],
    ['DEVOLUCIONES', formatCurrency(Number(session.returns_total ?? 0))],
    ['CORTESIAS', formatCurrency(Number(session.courtesy_total ?? 0))],
    ['DESCUENTOS', `-${formatCurrency(Number(session.discounts_total ?? 0))}`],
    ['CANCELACIONES', `${Number(session.cancellations_count ?? 0)} - ${formatCurrency(Number(session.cancellations_total ?? 0))}`],
    ['TOTAL VENDIDO', formatCurrency(Number(session.total_sold ?? 0))],
    ['EFECTIVO ESPERADO', formatCurrency(Number(session.expected_cash ?? 0))],
    ['EFECTIVO ENTREGADO', session.delivered_cash == null ? '-' : formatCurrency(Number(session.delivered_cash ?? 0))],
    ['DIFERENCIA', session.cash_difference == null ? '-' : formatCurrency(Number(session.cash_difference ?? 0))],
  ];

  const dynamicHeight =
    210 +
    rows.length * 15 +
    openingNotes.length * lineGap +
    closingNotes.length * lineGap;
  const height = Math.max(360, Math.min(14000, dynamicHeight));
  const page = pdfDoc.addPage([width, height]);
  let y = height - 14;

  const drawCentered = (text: string, size: number, font: PDFFont) => {
    const safe = sanitize(text);
    const textWidth = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: Math.max(marginLeft, marginLeft + (contentWidth - textWidth) / 2), y, size, font });
    y -= size + 4;
  };

  const drawLine = (text: string, size = 7, font: PDFFont = fontRegular) => {
    page.drawText(sanitize(text), { x: marginLeft, y, size, font });
    y -= lineGap;
  };

  const drawWrapped = (lines: string[], size = 7, font: PDFFont = fontRegular) => {
    lines.forEach((line) => drawLine(line, size, font));
  };

  const drawDivider = () => {
    page.drawLine({
      start: { x: marginLeft, y: y + 3 },
      end: { x: width - marginRight, y: y + 3 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    y -= 8;
  };

  const drawAmountRow = (label: string, amount: string, size = 8, font: PDFFont = fontBold) => {
    const safeLabel = sanitize(label);
    const safeAmount = sanitize(amount);
    page.drawText(safeLabel, { x: marginLeft, y, size, font });
    const amountWidth = font.widthOfTextAtSize(safeAmount, size);
    page.drawText(safeAmount, { x: width - marginRight - amountWidth, y, size, font });
    y -= size + 6;
  };

  drawCentered('CASA TAHONA', 12, fontBold);
  drawCentered('CORTE DE CAJA', 9, fontBold);
  drawCentered(`C-${String(session.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`, 10, fontBold);
  drawDivider();

  drawLine(`SUCURSAL: ${(input.branchName || session.branch_name || 'CASA TAHONA').toUpperCase()}`, 7, fontRegular);
  drawLine(`CAJERA: ${(session.cashier_name || '-').toUpperCase()}`, 7, fontRegular);
  drawLine(`APERTURA: ${formatLocalDateTime(session.opened_at)}`, 7, fontRegular);
  drawLine(`CIERRE: ${formatLocalDateTime(session.closed_at)}`, 7, fontRegular);
  drawDivider();

  drawLine('RESUMEN DE VENTAS', 8, fontBold);
  drawDivider();
  rows.forEach(([label, amount]) => drawAmountRow(label, amount, label === 'TOTAL VENDIDO' || label === 'DIFERENCIA' ? 9 : 8, fontBold));
  drawDivider();

  if (openingNotes.length > 0) drawWrapped(openingNotes, 7, fontRegular);
  if (closingNotes.length > 0) drawWrapped(closingNotes, 7, fontRegular);
  if (openingNotes.length > 0 || closingNotes.length > 0) drawDivider();

  drawCentered('COMPROBANTE DE CIERRE', 7, fontRegular);
  drawCentered('CONSERVE ESTE DOCUMENTO', 8, fontBold);

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const filename = `corte-caja-C-${String(session.id).replace(/-/g, '').slice(0, 6).toUpperCase()}.pdf`;

  if (options.mode === 'open' || options.mode === 'print') {
    const target = options.targetWindow && !options.targetWindow.closed
      ? options.targetWindow
      : window.open('', '_blank');
    if (target) {
      if (options.mode === 'print') {
        target.document.open();
        target.document.write(`<!doctype html>
<html>
  <head>
    <title>Corte de caja</title>
    <style>
      html, body { margin: 0; height: 100%; font-family: Arial, sans-serif; }
      iframe { border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe id="pdfFrame" src="${url}"></iframe>
    <script>
      const frame = document.getElementById('pdfFrame');
      function printPdf() {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch (error) {
          window.print();
        }
      }
      frame.addEventListener('load', () => setTimeout(printPdf, 500));
    <\/script>
  </body>
</html>`);
        target.document.close();
      } else {
        target.location.href = url;
      }
      target.focus();
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
};
