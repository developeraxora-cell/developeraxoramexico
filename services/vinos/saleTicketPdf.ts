import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

export interface VinosSalePdfInput {
  saleId: string;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerAddress?: string;
  cashierName: string;
  paymentMethod: 'EFECTIVO' | 'CREDITO' | 'CORTESIA';
  walletUsed?: number;
  creditUsed?: number;
  saleNotes?: string | null;
  items: Array<{
    name: string;
    presentation: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  discountCode?: string | null;   // código de cupón/promoción aplicado
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
  if (input.paymentMethod === 'CORTESIA') return 'SIN COSTO';
  return 'LIQUIDADO';
};

export const generateVinosSaleTicket = async (input: VinosSalePdfInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const pageSize: [number, number] = [595.28, 841.89];
  const [width, height] = pageSize;

  const marginX = 30;
  const outerY = 75;
  const outerTop = height - 70;
  const outerHeight = outerTop - outerY;
  const infoTop = height - 105;
  const tableTop = infoTop - 144;
  const tableWidth = width - marginX * 2;
  const colRatios = [0.36, 0.2, 0.14, 0.15, 0.15];
  const colXs = colRatios.reduce<number[]>((acc, ratio) => {
    const prev = acc[acc.length - 1];
    acc.push(prev + tableWidth * ratio);
    return acc;
  }, [marginX]);

  const drawCellText = (page: PDFPage, text: string, col: number, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) => {
    const xStart = colXs[col];
    const xEnd = colXs[col + 1];
    const colWidth = xEnd - xStart;
    const available = colWidth - 6;
    let safe = text ?? '';
    while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > available) {
      safe = `${safe.slice(0, -1)}`;
    }
    if (safe !== text && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
    const textWidth = font.widthOfTextAtSize(safe, size);
    const textX = xStart + Math.max(3, (colWidth - textWidth) / 2);
    page.drawText(safe, { x: textX, y, size, font, color });
  };

  const itemsPerPage = 24;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(input.items.length / itemsPerPage)) },
    (_, idx) => input.items.slice(idx * itemsPerPage, (idx + 1) * itemsPerPage),
  );

  pages.forEach((pageItems, pageIndex) => {
    const page = pdfDoc.addPage(pageSize);

    page.drawRectangle({
      x: marginX,
      y: outerY,
      width: width - marginX * 2,
      height: outerHeight,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    const title = sanitize(`VINOS ${(input.branchName || 'CASA TAHONA').toUpperCase()}`);
    const titleSize = 14;
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 42,
      size: titleSize,
      font: fontBold,
    });

    const rightInfoX = width - marginX - 155;
    const status = statusLabel(input);
    page.drawText(sanitize(`FECHA:  ${formatLocalDateTime(input.createdAt)}`), { x: marginX + 10, y: infoTop, size: 10, font: fontBold });
    page.drawText(sanitize(`CLIENTE:  ${(input.customerName || 'PUBLICO GENERAL').toUpperCase()}`), { x: marginX + 10, y: infoTop - 24, size: 10, font: fontBold });
    page.drawText(sanitize(status), { x: marginX + 10, y: infoTop - 48, size: 10, font: fontBold });
    page.drawText(sanitize(`OBSERVACION:  ${(input.saleNotes?.trim() || '-').toUpperCase()}`), { x: marginX + 10, y: infoTop - 72, size: 10, font: fontBold });
    page.drawText('NOTA DE VENTA', { x: rightInfoX + 18, y: infoTop, size: 12, font: fontBold });
    page.drawText(`V-${String(input.saleId).replace(/-/g, '').slice(0, 6).toUpperCase()}`, { x: rightInfoX + 60, y: infoTop - 24, size: 12, font: fontBold });
    page.drawText(sanitize(`CAJERO:  ${(input.cashierName || '-').toUpperCase()}`), { x: rightInfoX - 42, y: infoTop - 48, size: 10, font: fontBold });

    page.drawRectangle({ x: marginX, y: tableTop - 16, width: tableWidth, height: 16, color: rgb(0, 0, 0) });
    ['PRODUCTO', 'PRESENTACION', 'CANTIDAD', 'PRECIO UNITARIO', 'SUBTOTAL'].forEach((header, idx) => {
      drawCellText(page, header, idx, tableTop - 12, 8, fontBold, rgb(1, 1, 1));
    });

    let rowY = tableTop - 32;
    pageItems.forEach((item) => {
      const subtotal = Number(item.subtotal ?? (item.qty * item.unitPrice));
      const rowHeight = 18;
      page.drawRectangle({
        x: marginX,
        y: rowY - 2,
        width: tableWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < colXs.length - 1; c += 1) {
        page.drawLine({
          start: { x: colXs[c], y: rowY - 2 },
          end: { x: colXs[c], y: rowY - 2 + rowHeight },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      drawCellText(page, sanitize(item.name.toUpperCase()), 0, rowY + 4, 8, fontBold);
      drawCellText(page, sanitize(item.presentation.toUpperCase()), 1, rowY + 4, 8, fontBold);
      drawCellText(page, Number(item.qty).toFixed(2), 2, rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(Number(item.unitPrice)), 3, rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(subtotal), 4, rowY + 4, 8, fontBold);
      rowY -= rowHeight;
    });

    if (pageIndex === pages.length - 1) {
      const discountAmt = Number(input.discount ?? 0);
      if (discountAmt > 0) {
        const sub = Number(input.subtotal ?? 0);
        const pct = sub > 0 ? Math.round((discountAmt / sub) * 100) : 0;
        const labelX = width - marginX - 250;
        const valueX = width - marginX - 90;
        let sy = 165;
        const rightVal = (txt: string, y: number) => {
          const w = fontBold.widthOfTextAtSize(txt, 11);
          page.drawText(txt, { x: width - marginX - 10 - w, y, size: 11, font: fontBold });
        };
        page.drawText('SUBTOTAL:', { x: labelX, y: sy, size: 11, font: fontBold });
        rightVal(formatCurrency(sub), sy);
        sy -= 18;
        page.drawText(sanitize(`DESCUENTO ${pct}%:`), { x: labelX, y: sy, size: 11, font: fontBold });
        rightVal(`-${formatCurrency(discountAmt)}`, sy);
      }
      page.drawText(`TOTAL:  ${formatCurrency(input.total)}`, { x: width - marginX - 210, y: 108, size: 20, font: fontBold });
    }

    page.drawText(sanitize(`Casa Tahona - Vinos - ${input.branchName || ''}`.trim()), { x: marginX + 80, y: 64, size: 9, font: fontBold });
    page.drawText(`Pagina ${pageIndex + 1} / ${pages.length}`, { x: width - marginX - 80, y: 64, size: 9, font: fontBold });
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `venta-V-${String(input.saleId).replace(/-/g, '').slice(0, 6).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
