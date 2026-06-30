import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

export interface VinosSalePdfInput {
  saleId: string;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerAddress?: string;
  cashierName: string;
  paymentMethod: 'EFECTIVO' | 'CREDITO' | 'TRANSFERENCIA' | 'TARJETA' | 'CORTESIA';
  walletUsed?: number;
  creditUsed?: number;
  cashReceived?: number;
  cashChange?: number;
  saleNotes?: string | null;
  items: Array<{
    name: string;
    presentation: string;
    priceType?: string | null;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  discountCode?: string | null;   // código de cupón/promoción aplicado
}

interface GenerateVinosSaleTicketOptions {
  mode?: 'download' | 'open' | 'print';
  targetWindow?: Window | null;
}

// Reemplazar caracteres no soportados por WinAnsi (Helvetica)
const sanitize = (text: string): string => {
  if (!text) return '';
  return String(text)
    .replace(/[—–]/g, '-')   // em/en dash
    .replace(/[‘’]/g, "'")   // smart quotes
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')       // ellipsis
    .replace(/[→←]/g, '->')  // arrows
    .replace(/[^\x00-\xFF]/g, '?');    // cualquier char fuera Latin-1
};

const formatLocalDateTime = (value: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('es-MX');
};

const statusLabel = (input: VinosSalePdfInput): string => {
  if (Number(input.walletUsed ?? 0) > 0 && Number(input.walletUsed) >= Number(input.total)) return 'SALDO A FAVOR';
  if (input.paymentMethod === 'CREDITO') return 'CREDITO';
  if (input.paymentMethod === 'TRANSFERENCIA') return 'TRANSFERENCIA';
  if (input.paymentMethod === 'TARJETA') return 'TARJETA';
  if (input.paymentMethod === 'CORTESIA') return 'SIN COSTO';
  return 'LIQUIDADO';
};

const priceTierLabel = (value?: string | null): string => {
  const key = String(value ?? '').toUpperCase();
  if (key === 'MAYOREO') return 'MAYOREO';
  if (key === 'MEDIO_MAYOREO') return 'MEDIO MAYOREO';
  if (key === 'MENUDEO') return 'MENUDEO';
  return '';
};

export const generateVinosSaleTicket = async (input: VinosSalePdfInput, options: GenerateVinosSaleTicketOptions = {}) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const width = 212.6; // 75 mm thermal paper
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

  const lineBlocks = input.items.map((item) => {
    const nameLines = wrapText((item.name || 'PRODUCTO').toUpperCase(), contentWidth, fontBold, 8);
    const priceType = priceTierLabel(item.priceType);
    const priceTypeLines = priceType ? wrapText(`PRECIO: ${priceType}`, contentWidth, fontBold, 7) : [];
    const presentationLines = wrapText((item.presentation || '-').toUpperCase(), contentWidth, fontRegular, 7);
    return {
      item,
      nameLines,
      priceTypeLines,
      presentationLines,
      height: (nameLines.length * 10) + (priceTypeLines.length * 9) + (presentationLines.length * 9) + 20,
    };
  });

  const notesLines = input.saleNotes?.trim()
    ? wrapText(`OBS: ${input.saleNotes.trim().toUpperCase()}`, contentWidth, fontRegular, 7)
    : [];
  const customerLines = wrapText(`CLIENTE: ${(input.customerName || 'PUBLICO GENERAL').toUpperCase()}`, contentWidth, fontRegular, 7);
  const footerLines = wrapText('GRACIAS POR SU COMPRA', contentWidth, fontBold, 8);
  const itemsHeight = lineBlocks.reduce((sum, block) => sum + block.height, 0);
  const dynamicHeight =
    176 +
    (customerLines.length * lineGap) +
    (notesLines.length * lineGap) +
    itemsHeight +
    (Number(input.discount ?? 0) > 0 ? 14 : 0) +
    (Number(input.walletUsed ?? 0) > 0 ? 14 : 0) +
    (Number(input.creditUsed ?? 0) > 0 ? 14 : 0) +
    (input.paymentMethod === 'EFECTIVO' && Number(input.cashReceived ?? 0) > 0 ? 28 : 0) +
    (input.discountCode ? 12 : 0) +
    (footerLines.length * lineGap);
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
    y -= size + 5;
  };

  drawCentered('CASA TAHONA', 12, fontBold);
  drawCentered('NOTA DE VENTA', 9, fontBold);
  drawCentered(`V-${String(input.saleId).replace(/-/g, '').slice(0, 6).toUpperCase()}`, 10, fontBold);
  drawDivider();

  drawLine(`FECHA: ${formatLocalDateTime(input.createdAt)}`, 7, fontRegular);
  drawLine(`CAJERO: ${(input.cashierName || '-').toUpperCase()}`, 7, fontRegular);
  drawWrapped(customerLines, 7, fontRegular);
  drawLine(`ESTATUS: ${statusLabel(input)}`, 7, fontBold);
  if (notesLines.length > 0) drawWrapped(notesLines, 7, fontRegular);
  drawDivider();

  drawLine('PRODUCTOS', 8, fontBold);
  drawDivider();
  lineBlocks.forEach(({ item, nameLines, priceTypeLines, presentationLines }) => {
    const qty = Number(item.qty ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const subtotal = Number(item.subtotal ?? qty * unitPrice);
    drawWrapped(nameLines, 8, fontBold);
    if (priceTypeLines.length > 0) drawWrapped(priceTypeLines, 7, fontBold);
    drawWrapped(presentationLines, 7, fontRegular);
    drawAmountRow(`${qty.toFixed(2)} x ${formatCurrency(unitPrice)}`, formatCurrency(subtotal), 7, fontRegular);
    y -= 3;
  });
  drawDivider();

  const discountAmt = Number(input.discount ?? 0);
  const walletUsed = Number(input.walletUsed ?? 0);
  const creditUsed = Number(input.creditUsed ?? 0);
  drawAmountRow('SUBTOTAL', formatCurrency(Number(input.subtotal ?? 0)), 8, fontBold);
  if (discountAmt > 0) drawAmountRow('DESCUENTO', `-${formatCurrency(discountAmt)}`, 8, fontBold);
  if (walletUsed > 0) drawAmountRow('SALDO A FAVOR', `-${formatCurrency(walletUsed)}`, 8, fontBold);
  if (creditUsed > 0) drawAmountRow('CREDITO', formatCurrency(creditUsed), 8, fontBold);
  drawDivider();
  drawAmountRow('TOTAL', formatCurrency(Number(input.total ?? 0)), 12, fontBold);
  if (input.paymentMethod === 'EFECTIVO' && Number(input.cashReceived ?? 0) > 0) {
    const cashReceived = Number(input.cashReceived ?? 0);
    const cashChange = Number(input.cashChange ?? Math.max(0, cashReceived - Number(input.total ?? 0)));
    drawAmountRow('PAGO CON', formatCurrency(cashReceived), 8, fontBold);
    drawAmountRow('CAMBIO', formatCurrency(cashChange), 8, fontBold);
  }
  if (input.discountCode) drawLine(`CODIGO: ${String(input.discountCode).toUpperCase()}`, 7, fontRegular);
  drawDivider();
  drawCentered('CONSERVE ESTE COMPROBANTE', 7, fontRegular);
  footerLines.forEach((line) => drawCentered(line, 8, fontBold));

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
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
    <title>Nota de venta</title>
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
  a.download = `venta-V-${String(input.saleId).replace(/-/g, '').slice(0, 6).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
