import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

export interface StatementNoteRow {
  id: string;
  folio: string;
  emission: string;
  due_date: string;
  total: number;
  paid: number;
  pending: number;
  status: 'PAGADA' | 'VENCIDA' | 'ABIERTA' | 'PARCIAL';
}

export interface StatementPaymentRow {
  note_id: string;
  paid_at: string;
  amount: number;
  method: string;
  reference: string | null;
}

export interface StatementSaleDetailItem {
  product_name: string;
  presentation: string;
  sale_type: string;
  qty: number;
  subtotal: number;
}

export interface StatementSaleDetailRow {
  note_id: string;
  folio: string;
  created_at: string;
  items: StatementSaleDetailItem[];
}

export interface StatementInput {
  branchName: string;
  customerName: string;
  customerPhone?: string | null;
  generatedAt: string;
  limit: number;
  debt: number;
  available: number;
  notes: StatementNoteRow[];
  payments: StatementPaymentRow[];
  saleDetails?: StatementSaleDetailRow[];
}

const sanitize = (text: string): string => {
  if (!text) return '';
  return String(text)
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\xFF]/g, '?');
};

const formatLocalDateTime = (value: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const normalized = raw.includes('T') ? raw : raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T00:00:00`;
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('es-MX');
};

const drawCellText = (page: PDFPage, text: string, xStart: number, xEnd: number, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) => {
  const colWidth = xEnd - xStart;
  const available = colWidth - 8;
  let safe = sanitize(text ?? '');
  while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > available) {
    safe = safe.slice(0, -1);
  }
  if (safe.length > 3 && font.widthOfTextAtSize(sanitize(text ?? ''), size) > available) safe = `${safe.slice(0, -3)}...`;
  const textWidth = font.widthOfTextAtSize(safe, size);
  const textX = xStart + Math.max(4, (colWidth - textWidth) / 2);
  page.drawText(safe, { x: textX, y, size, font, color });
};

export const generateVinosStatementPdf = async (input: StatementInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontReg = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const pageSize: [number, number] = [595.28, 841.89];
  const [width, height] = pageSize;

  const marginX = 30;
  const frameY = 75;
  const frameTop = height - 70;
  const frameHeight = frameTop - frameY;
  const frameWidth = width - marginX * 2;
  const title = sanitize(`VINOS ${(input.branchName || 'CASA TAHONA').toUpperCase()}`);
  const titleSize = 14;
  const subtitle = 'ESTADO DE CUENTA CLIENTE';
  const infoTop = height - 105;
  const rightInfoX = width - marginX - 220;

  const startStatementPage = (pageNumber: number) => {
    const page = pdfDoc.addPage(pageSize);
    page.drawRectangle({ x: marginX, y: frameY, width: frameWidth, height: frameHeight, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (width - titleWidth) / 2, y: height - 42, size: titleSize, font: fontBold });
    const subWidth = fontBold.widthOfTextAtSize(subtitle, 10);
    page.drawText(subtitle, { x: (width - subWidth) / 2, y: height - 62, size: 10, font: fontBold });

    page.drawText(sanitize(`FECHA: ${input.generatedAt}`), { x: marginX + 10, y: infoTop, size: 10, font: fontBold });
    page.drawText(sanitize(`CLIENTE: ${input.customerName.toUpperCase()}`), { x: marginX + 10, y: infoTop - 20, size: 10, font: fontBold });
    page.drawText(sanitize(`TELEFONO: ${(input.customerPhone ?? '-').toUpperCase()}`), { x: marginX + 10, y: infoTop - 40, size: 10, font: fontBold });
    page.drawText(sanitize(`LIMITE: ${formatCurrency(input.limit)}`), { x: marginX + 10, y: infoTop - 60, size: 10, font: fontBold });
    page.drawText(sanitize(`DEUDA ACTUAL: ${formatCurrency(input.debt)}`), { x: rightInfoX, y: infoTop - 20, size: 10, font: fontBold });
    page.drawText(sanitize(`DISPONIBLE: ${formatCurrency(input.available)}`), { x: rightInfoX, y: infoTop - 40, size: 10, font: fontBold });

    page.drawText(sanitize(`Casa Tahona - Vinos - ${input.branchName || ''}`.trim()), { x: marginX + 80, y: 64, size: 9, font: fontBold });
    page.drawText(`Pagina ${pageNumber}`, { x: width - marginX - 52, y: 64, size: 9, font: fontBold });
    return page;
  };

  const notesTop = infoTop - 92;
  const notesHeaders = ['FOLIO', 'EMISION', 'VENCE', 'TOTAL', 'ABONADO', 'SALDO', 'ESTADO'];
  const notesRatios = [0.18, 0.13, 0.13, 0.16, 0.14, 0.14, 0.12];
  const notesXs = notesRatios.reduce<number[]>((acc, ratio) => {
    acc.push(acc[acc.length - 1] + frameWidth * ratio);
    return acc;
  }, [marginX]);

  const drawNotesHeader = (page: PDFPage, topY: number) => {
    page.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
    notesHeaders.forEach((h, i) => drawCellText(page, h, notesXs[i], notesXs[i + 1], topY - 12, 8, fontBold, rgb(1, 1, 1)));
  };

  const paymentHeaders = ['FECHA', 'FOLIO', 'METODO', 'MONTO', 'REFERENCIA'];
  const paymentRatios = [0.26, 0.22, 0.16, 0.16, 0.2];
  const paymentXs = paymentRatios.reduce<number[]>((acc, ratio) => {
    acc.push(acc[acc.length - 1] + frameWidth * ratio);
    return acc;
  }, [marginX]);

  const drawPaymentHeader = (page: PDFPage, topY: number) => {
    page.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
    paymentHeaders.forEach((h, i) => drawCellText(page, h, paymentXs[i], paymentXs[i + 1], topY - 12, 8, fontBold, rgb(1, 1, 1)));
  };

  const notesById = input.notes.reduce<Record<string, StatementNoteRow>>((acc, n) => {
    acc[n.id] = n;
    return acc;
  }, {});

  let pageNumber = 1;
  let page = startStatementPage(pageNumber);
  let rowY = notesTop - 32;
  drawNotesHeader(page, notesTop);

  if (input.notes.length === 0) {
    page.drawRectangle({ x: marginX, y: rowY - 2, width: frameWidth, height: 20, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
    page.drawText('SIN NOTAS REGISTRADAS', { x: marginX + 200, y: rowY + 4, size: 8, font: fontBold });
    rowY -= 22;
  } else {
    for (const note of input.notes) {
      const rh = 18;
      if (rowY - 2 < frameY + 24) {
        pageNumber += 1;
        page = startStatementPage(pageNumber);
        drawNotesHeader(page, notesTop);
        rowY = notesTop - 32;
      }
      page.drawRectangle({ x: marginX, y: rowY - 2, width: frameWidth, height: rh, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
      for (let c = 1; c < notesXs.length - 1; c += 1) {
        page.drawLine({ start: { x: notesXs[c], y: rowY - 2 }, end: { x: notesXs[c], y: rowY + rh - 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
      }
      drawCellText(page, note.folio,                        notesXs[0], notesXs[1], rowY + 4, 8, fontBold);
      drawCellText(page, note.emission,                     notesXs[1], notesXs[2], rowY + 4, 8, fontReg);
      drawCellText(page, note.due_date,                     notesXs[2], notesXs[3], rowY + 4, 8, fontReg);
      drawCellText(page, formatCurrency(note.total),        notesXs[3], notesXs[4], rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(note.paid),         notesXs[4], notesXs[5], rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(note.pending),      notesXs[5], notesXs[6], rowY + 4, 8, fontBold);
      drawCellText(page, note.status,                       notesXs[6], notesXs[7], rowY + 4, 8, fontBold);
      rowY -= rh;
    }
  }

  // Abonos
  const ensurePaymentSection = () => {
    if (rowY - 18 - 46 < frameY + 24) {
      pageNumber += 1;
      page = startStatementPage(pageNumber);
      rowY = notesTop - 18;
    }
  };
  ensurePaymentSection();
  let paymentTop = rowY - 26;
  page.drawText('ABONOS REALIZADOS', { x: marginX + 16, y: paymentTop + 8, size: 10, font: fontBold });
  drawPaymentHeader(page, paymentTop);
  let payRowY = paymentTop - 32;

  if (input.payments.length === 0) {
    page.drawRectangle({ x: marginX, y: payRowY - 2, width: frameWidth, height: 20, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
    page.drawText('SIN ABONOS REGISTRADOS', { x: marginX + 195, y: payRowY + 4, size: 8, font: fontBold });
  } else {
    for (const p of input.payments) {
      const rh = 18;
      if (payRowY - 2 < frameY + 24) {
        pageNumber += 1;
        page = startStatementPage(pageNumber);
        paymentTop = notesTop;
        page.drawText('ABONOS REALIZADOS', { x: marginX + 16, y: paymentTop + 8, size: 10, font: fontBold });
        drawPaymentHeader(page, paymentTop);
        payRowY = paymentTop - 32;
      }
      page.drawRectangle({ x: marginX, y: payRowY - 2, width: frameWidth, height: rh, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
      for (let c = 1; c < paymentXs.length - 1; c += 1) {
        page.drawLine({ start: { x: paymentXs[c], y: payRowY - 2 }, end: { x: paymentXs[c], y: payRowY + rh - 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
      }
      drawCellText(page, formatLocalDateTime(p.paid_at),                   paymentXs[0], paymentXs[1], payRowY + 4, 8, fontReg);
      drawCellText(page, notesById[p.note_id]?.folio ?? '-',               paymentXs[1], paymentXs[2], payRowY + 4, 8, fontBold);
      drawCellText(page, p.method,                                         paymentXs[2], paymentXs[3], payRowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(p.amount),                         paymentXs[3], paymentXs[4], payRowY + 4, 8, fontBold);
      drawCellText(page, p.reference ?? '-',                               paymentXs[4], paymentXs[5], payRowY + 4, 8, fontReg);
      payRowY -= rh;
    }
  }

  // ── DETALLE DE VENTAS ASOCIADAS ─────────────────────────
  const saleDetails = (input.saleDetails ?? []).filter(s => s.items.length > 0);
  if (saleDetails.length > 0) {
    const headers = ['PRODUCTO', 'PRESENTACION', 'TIPO DE VENTA', 'CANTIDAD', 'SUB TOTAL'];
    const ratios = [0.35, 0.2, 0.18, 0.11, 0.16];
    const xs = ratios.reduce<number[]>((acc, r) => {
      acc.push(acc[acc.length - 1] + frameWidth * r);
      return acc;
    }, [marginX]);

    const startDetailPage = (pn: number) => {
      const p = pdfDoc.addPage(pageSize);
      p.drawRectangle({ x: marginX, y: frameY, width: frameWidth, height: frameHeight, borderWidth: 1, borderColor: rgb(0, 0, 0) });
      const tw = fontBold.widthOfTextAtSize(title, titleSize);
      p.drawText(title, { x: (width - tw) / 2, y: height - 42, size: titleSize, font: fontBold });
      const subTxt = 'DETALLE DE VENTAS ASOCIADAS';
      const sw = fontBold.widthOfTextAtSize(subTxt, 10);
      p.drawText(subTxt, { x: (width - sw) / 2, y: height - 62, size: 10, font: fontBold });
      p.drawText(sanitize(`CLIENTE: ${input.customerName.toUpperCase()}`), { x: marginX + 10, y: height - 100, size: 10, font: fontBold });
      p.drawText(sanitize(`FECHA: ${input.generatedAt}`), { x: width - marginX - 170, y: height - 100, size: 10, font: fontBold });
      p.drawText(sanitize(`Casa Tahona - Vinos - ${input.branchName || ''}`.trim()), { x: marginX + 80, y: 64, size: 9, font: fontBold });
      p.drawText(`Pagina ${pn}`, { x: width - marginX - 52, y: 64, size: 9, font: fontBold });
      return { page: p, cursorY: height - 130 };
    };

    const drawHeaderRow = (p: PDFPage, topY: number) => {
      p.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
      headers.forEach((h, i) => drawCellText(p, h, xs[i], xs[i + 1], topY - 12, 8, fontBold, rgb(1, 1, 1)));
    };

    pageNumber += 1;
    let ctx = startDetailPage(pageNumber);
    let cursorY = ctx.cursorY;
    let detailPage = ctx.page;

    for (const sale of saleDetails) {
      const saleTotal = sale.items.reduce((a, it) => a + Number(it.subtotal ?? 0), 0);
      const minBlock = 58 + 16 + 18;
      if (cursorY - minBlock < frameY + 24) {
        pageNumber += 1;
        ctx = startDetailPage(pageNumber);
        cursorY = ctx.cursorY;
        detailPage = ctx.page;
      }
      detailPage.drawText(sanitize(`FOLIO: ${sale.folio}`), { x: marginX + 12, y: cursorY, size: 10, font: fontBold });
      detailPage.drawText(sanitize(`FECHA DE REGISTRO: ${formatLocalDateTime(sale.created_at)}`), { x: marginX + 170, y: cursorY, size: 10, font: fontBold });
      detailPage.drawText(sanitize(`TOTAL: ${formatCurrency(saleTotal)}`), { x: width - marginX - 140, y: cursorY, size: 10, font: fontBold });

      let tableTop = cursorY - 10;
      drawHeaderRow(detailPage, tableTop);
      let rY = tableTop - 32;

      for (const item of sale.items) {
        if (rY - 2 < frameY + 24) {
          pageNumber += 1;
          ctx = startDetailPage(pageNumber);
          cursorY = ctx.cursorY;
          detailPage = ctx.page;
          detailPage.drawText(sanitize(`FOLIO: ${sale.folio} (CONTINUA)`), { x: marginX + 12, y: cursorY, size: 10, font: fontBold });
          tableTop = cursorY - 10;
          drawHeaderRow(detailPage, tableTop);
          rY = tableTop - 32;
        }
        const rh = 18;
        detailPage.drawRectangle({ x: marginX, y: rY - 2, width: frameWidth, height: rh, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
        for (let c = 1; c < xs.length - 1; c += 1) {
          detailPage.drawLine({ start: { x: xs[c], y: rY - 2 }, end: { x: xs[c], y: rY + rh - 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
        }
        drawCellText(detailPage, item.product_name,                xs[0], xs[1], rY + 4, 8, fontBold);
        drawCellText(detailPage, item.presentation,                xs[1], xs[2], rY + 4, 8, fontReg);
        drawCellText(detailPage, item.sale_type,                   xs[2], xs[3], rY + 4, 8, fontReg);
        drawCellText(detailPage, String(item.qty),                 xs[3], xs[4], rY + 4, 8, fontBold);
        drawCellText(detailPage, formatCurrency(item.subtotal),    xs[4], xs[5], rY + 4, 8, fontBold);
        rY -= rh;
      }
      cursorY = rY - 18;
    }
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win || win.closed) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado-cuenta-${input.customerName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
