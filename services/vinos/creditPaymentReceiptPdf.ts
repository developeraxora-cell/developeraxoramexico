import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

export interface VinosCreditPaymentReceiptInput {
  paymentId: string;
  saleId: string;
  saleCreatedAt: string;
  paymentCreatedAt: string;
  branchName: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  saleTotal: number;
  previousDebt: number;
  paymentAmount: number;
  currentDebt: number;
}

interface GenerateVinosCreditPaymentReceiptOptions {
  mode?: 'download' | 'open' | 'print';
  targetWindow?: Window | null;
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

const shortCode = (prefix: string, id: string) =>
  `${prefix}-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export const generateVinosCreditPaymentReceipt = async (
  input: VinosCreditPaymentReceiptInput,
  options: GenerateVinosCreditPaymentReceiptOptions = {},
) => {
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

  const customerLines = wrapText(`CLIENTE: ${(input.customerName || 'PUBLICO GENERAL').toUpperCase()}`, contentWidth, fontRegular, 7);
  const noteLines = input.notes?.trim()
    ? wrapText(`NOTAS: ${input.notes.trim().toUpperCase()}`, contentWidth, fontRegular, 7)
    : [];
  const referenceLines = input.reference?.trim()
    ? wrapText(`REFERENCIA: ${input.reference.trim().toUpperCase()}`, contentWidth, fontRegular, 7)
    : [];
  const dynamicHeight =
    258 +
    customerLines.length * lineGap +
    noteLines.length * lineGap +
    referenceLines.length * lineGap;
  const height = Math.max(320, Math.min(14000, dynamicHeight));
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
  drawCentered('COMPROBANTE DE ABONO', 9, fontBold);
  drawCentered(shortCode('A', input.paymentId), 10, fontBold);
  drawDivider();

  drawLine(`SUCURSAL: ${(input.branchName || 'CASA TAHONA').toUpperCase()}`, 7, fontRegular);
  drawLine(`VENTA: ${shortCode('V', input.saleId)}`, 8, fontBold);
  drawLine(`FECHA VENTA: ${formatLocalDateTime(input.saleCreatedAt)}`, 7, fontRegular);
  drawLine(`FECHA ABONO: ${formatLocalDateTime(input.paymentCreatedAt)}`, 7, fontRegular);
  drawLine(`ATENDIO: ${(input.cashierName || '-').toUpperCase()}`, 7, fontRegular);
  drawWrapped(customerLines, 7, fontRegular);
  drawLine(`METODO: ${(input.paymentMethod || '-').toUpperCase()}`, 7, fontBold);
  if (referenceLines.length > 0) drawWrapped(referenceLines, 7, fontRegular);
  drawDivider();

  drawAmountRow('MONTO DE VENTA', formatCurrency(Number(input.saleTotal ?? 0)), 8, fontBold);
  drawAmountRow('DEUDA ANTERIOR', formatCurrency(Number(input.previousDebt ?? 0)), 8, fontBold);
  drawAmountRow('ABONO', `-${formatCurrency(Number(input.paymentAmount ?? 0))}`, 9, fontBold);
  drawDivider();
  drawAmountRow('DEUDA ACTUAL', formatCurrency(Number(input.currentDebt ?? 0)), 12, fontBold);
  drawDivider();

  if (noteLines.length > 0) {
    drawWrapped(noteLines, 7, fontRegular);
    drawDivider();
  }

  drawCentered('CONSERVE ESTE COMPROBANTE', 7, fontRegular);
  y -= 2;
  drawCentered('MUCHAS GRACIAS', 10, fontBold);

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const filename = `abono-${shortCode('A', input.paymentId)}-${shortCode('V', input.saleId)}.pdf`;

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
    <title>Comprobante de abono</title>
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
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
