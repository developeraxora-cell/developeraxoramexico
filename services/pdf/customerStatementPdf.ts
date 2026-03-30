import { PDFDocument, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

interface CustomerInfo {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
}

interface CustomerNoteRow {
  id: string;
  folio: string;
  issue_date: string;
  due_date: string;
  total: number;
  paid_amount: number;
  balance: number;
  status: 'PAGADA' | 'VENCIDA' | 'ABIERTA';
}

interface CustomerPaymentRow {
  note_id: string;
  paid_at: string;
  amount: number;
  method: string;
  reference: string | null;
}

interface CustomerSaleDetailItem {
  product_name: string;
  presentation: string;
  sale_type: string;
  qty: number;
  subtotal: number;
}

interface CustomerSaleDetailRow {
  note_id: string;
  folio: string;
  created_at: string;
  items: CustomerSaleDetailItem[];
}

interface CustomerStatementPdfInput {
  moduleLabel: 'MATERIALES' | 'CONCRETERA';
  branchName: string;
  customer: CustomerInfo;
  debt: number;
  available: number;
  notes: CustomerNoteRow[];
  payments: CustomerPaymentRow[];
  saleDetails?: CustomerSaleDetailRow[];
  previewWindow?: Window | null;
}

const toFileToken = (value: string | null | undefined, fallback: string) => {
  const source = String(value ?? '');
  const normalized = typeof source.normalize === 'function' ? source.normalize('NFD') : source;
  const cleaned = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
  return cleaned || fallback;
};

const formatLocalDateTime = (value: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';

  const normalized = raw.includes('T')
    ? raw
    : raw.includes(' ')
      ? raw.replace(' ', 'T')
      : `${raw}T00:00:00`;

  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);

  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(raw);
    if (Number.isNaN(fallback.getTime())) return raw;
    return fallback.toLocaleString();
  }

  return parsed.toLocaleString();
};

const openPdfPreview = (blob: Blob, filename: string, targetWindow?: Window | null) => {
  const url = URL.createObjectURL(blob);
  let previewWindow = targetWindow && !targetWindow.closed ? targetWindow : null;

  if (!previewWindow) {
    previewWindow = window.open('', '_blank');
  }

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.document.title = filename;
      previewWindow.location.href = url;
    } catch {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  } else {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const drawCellText = (
  page: any,
  text: string,
  xStart: number,
  xEnd: number,
  y: number,
  size: number,
  font: any,
  color = rgb(0, 0, 0)
) => {
  const colWidth = xEnd - xStart;
  const available = colWidth - 8;
  let safe = text ?? '';
  while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > available) {
    safe = safe.slice(0, -1);
  }
  if (safe !== text && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
  const textWidth = font.widthOfTextAtSize(safe, size);
  const textX = xStart + Math.max(4, (colWidth - textWidth) / 2);
  page.drawText(safe, { x: textX, y, size, font, color });
};

const drawSalesDetailPages = async (
  pdfDoc: PDFDocument,
  input: CustomerStatementPdfInput,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
  startingPageNumber: number
) => {
  const saleDetails = (input.saleDetails ?? []).filter((sale) => sale.items.length > 0);
  if (saleDetails.length === 0) return;

  const pageSize: [number, number] = [595.28, 841.89];
  const marginX = 30;
  const frameY = 75;
  const frameTop = pageSize[1] - 70;
  const frameHeight = frameTop - frameY;
  const frameWidth = pageSize[0] - marginX * 2;
  const headers = ['PRODUCTO', 'PRESENTACION', 'TIPO DE VENTA', 'CANTIDAD', 'SUB TOTAL'];
  const ratios = [0.35, 0.2, 0.18, 0.11, 0.16];
  const xs = ratios.reduce<number[]>((acc, ratio) => {
    acc.push(acc[acc.length - 1] + frameWidth * ratio);
    return acc;
  }, [marginX]);

  const startPage = (pageNumber: number) => {
    const page = pdfDoc.addPage(pageSize);
    const { width, height } = page.getSize();

    if (watermarkImage) {
      const dims = watermarkImage.scale(0.5);
      page.drawImage(watermarkImage, {
        x: (width - dims.width) / 2,
        y: (height - dims.height) / 2 - 40,
        width: dims.width,
        height: dims.height,
        opacity: 0.12,
      });
    }

    page.drawRectangle({
      x: marginX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    const title = `${input.moduleLabel} ${(input.branchName || 'SUCURSAL').toUpperCase()}`;
    const titleWidth = fontBold.widthOfTextAtSize(title, 14);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 42,
      size: 14,
      font: fontBold,
    });

    const subtitle = 'DETALLE DE VENTAS ASOCIADAS';
    const subtitleWidth = fontBold.widthOfTextAtSize(subtitle, 10);
    page.drawText(subtitle, {
      x: (width - subtitleWidth) / 2,
      y: height - 62,
      size: 10,
      font: fontBold,
    });

    page.drawText(`CLIENTE: ${input.customer.name.toUpperCase()}`, {
      x: marginX + 10,
      y: height - 100,
      size: 10,
      font: fontBold,
    });

    page.drawText(`FECHA: ${new Date().toLocaleString()}`, {
      x: width - marginX - 170,
      y: height - 100,
      size: 10,
      font: fontBold,
    });

    page.drawText('KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326', {
      x: marginX + 80,
      y: 64,
      size: 9,
      font: fontBold,
    });
    page.drawText(`Pagina ${pageNumber}`, { x: width - marginX - 52, y: 64, size: 9, font: fontBold });

    return { page, cursorY: height - 130 };
  };

  const drawTableHeader = (page: any, topY: number) => {
    page.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
    headers.forEach((header, idx) => {
      drawCellText(page, header, xs[idx], xs[idx + 1], topY - 12, 8, fontBold, rgb(1, 1, 1));
    });
  };

  let pageNumber = startingPageNumber;
  let { page, cursorY } = startPage(pageNumber);

  for (const sale of saleDetails) {
    const saleTotal = sale.items.reduce((acc, item) => acc + Number(item.subtotal ?? 0), 0);
    const minimumBlockHeight = 58 + 16 + 18;
    if (cursorY - minimumBlockHeight < frameY + 24) {
      pageNumber += 1;
      ({ page, cursorY } = startPage(pageNumber));
    }

    page.drawText(`FOLIO: ${sale.folio}`, {
      x: marginX + 12,
      y: cursorY,
      size: 10,
      font: fontBold,
    });
    page.drawText(`FECHA DE REGISTRO: ${formatLocalDateTime(sale.created_at)}`, {
      x: marginX + 170,
      y: cursorY,
      size: 10,
      font: fontBold,
    });
    page.drawText(`TOTAL: ${formatCurrency(saleTotal)}`, {
      x: pageSize[0] - marginX - 140,
      y: cursorY,
      size: 10,
      font: fontBold,
    });

    let tableTop = cursorY - 10;
    drawTableHeader(page, tableTop);
    let rowY = tableTop - 32;

    for (const item of sale.items) {
      if (rowY - 2 < frameY + 24) {
        pageNumber += 1;
        ({ page, cursorY } = startPage(pageNumber));
        page.drawText(`FOLIO: ${sale.folio} (CONTINUA)`, {
          x: marginX + 12,
          y: cursorY,
          size: 10,
          font: fontBold,
        });
        tableTop = cursorY - 10;
        drawTableHeader(page, tableTop);
        rowY = tableTop - 32;
      }

      const rowHeight = 18;
      page.drawRectangle({
        x: marginX,
        y: rowY - 2,
        width: frameWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < xs.length - 1; c += 1) {
        page.drawLine({
          start: { x: xs[c], y: rowY - 2 },
          end: { x: xs[c], y: rowY + rowHeight - 2 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }

      drawCellText(page, item.product_name ?? '-', xs[0], xs[1], rowY + 4, 8, fontBold);
      drawCellText(page, item.presentation ?? '-', xs[1], xs[2], rowY + 4, 8, fontRegular);
      drawCellText(page, item.sale_type ?? '-', xs[2], xs[3], rowY + 4, 8, fontRegular);
      drawCellText(page, String(item.qty ?? 0), xs[3], xs[4], rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(Number(item.subtotal ?? 0)), xs[4], xs[5], rowY + 4, 8, fontBold);
      rowY -= rowHeight;
    }

    cursorY = rowY - 18;
  }
};

export const generateCustomerStatementPdf = async (input: CustomerStatementPdfInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const pageSize: [number, number] = [595.28, 841.89];
  const [width, height] = pageSize;

  let watermarkImage: any = null;
  try {
    const logoBytes = await fetch('/lopar-watermark.png').then((r) => r.arrayBuffer());
    watermarkImage = await pdfDoc.embedPng(logoBytes);
  } catch {
    watermarkImage = null;
  }

  const marginX = 30;
  const frameY = 75;
  const frameTop = height - 70;
  const frameHeight = frameTop - frameY;
  const frameWidth = width - marginX * 2;
  const title = `${input.moduleLabel} ${(input.branchName || 'SUCURSAL').toUpperCase()}`;
  const titleSize = 14;
  const subtitle = 'ESTADO DE CUENTA CLIENTE';
  const infoTop = height - 105;
  const rightInfoX = width - marginX - 220;

  const startStatementPage = (pageNumber: number) => {
    const page = pdfDoc.addPage(pageSize);
    if (watermarkImage) {
      const dims = watermarkImage.scale(0.5);
      page.drawImage(watermarkImage, {
        x: (width - dims.width) / 2,
        y: (height - dims.height) / 2 - 40,
        width: dims.width,
        height: dims.height,
        opacity: 0.12,
      });
    }

    page.drawRectangle({
      x: marginX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 42,
      size: titleSize,
      font: fontBold,
    });

    const subtitleWidth = fontBold.widthOfTextAtSize(subtitle, 10);
    page.drawText(subtitle, {
      x: (width - subtitleWidth) / 2,
      y: height - 62,
      size: 10,
      font: fontBold,
    });

    page.drawText(`FECHA: ${new Date().toLocaleString()}`, { x: marginX + 10, y: infoTop, size: 10, font: fontBold });
    page.drawText(`CLIENTE: ${input.customer.name.toUpperCase()}`, { x: marginX + 10, y: infoTop - 20, size: 10, font: fontBold });
    page.drawText(`TELEFONO: ${(input.customer.phone ?? '-').toUpperCase()}`, { x: marginX + 10, y: infoTop - 40, size: 10, font: fontBold });
    page.drawText(`DIRECCION: ${(input.customer.address ?? '-').toUpperCase()}`, { x: marginX + 10, y: infoTop - 60, size: 10, font: fontBold });
    page.drawText(`LIMITE: ${formatCurrency(Number(input.customer.credit_limit ?? 0))}`, { x: marginX + 10, y: infoTop - 80, size: 10, font: fontBold });
    page.drawText(`DEUDA ACTUAL: ${formatCurrency(Number(input.debt ?? 0))}`, { x: rightInfoX, y: infoTop - 20, size: 10, font: fontBold });
    page.drawText(`DISPONIBLE: ${formatCurrency(Number(input.available ?? 0))}`, { x: rightInfoX, y: infoTop - 40, size: 10, font: fontBold });

    page.drawText('KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326', {
      x: marginX + 80,
      y: 64,
      size: 9,
      font: fontBold,
    });
    page.drawText(`Pagina ${pageNumber}`, { x: width - marginX - 52, y: 64, size: 9, font: fontBold });

    return page;
  };

  const notesTop = infoTop - 112;
  const notesHeaders = ['FOLIO', 'EMISION', 'VENCE', 'TOTAL', 'ABONADO', 'SALDO', 'ESTADO'];
  const notesRatios = [0.18, 0.13, 0.13, 0.16, 0.14, 0.14, 0.12];
  const notesXs = notesRatios.reduce<number[]>((acc, ratio) => {
    acc.push(acc[acc.length - 1] + frameWidth * ratio);
    return acc;
  }, [marginX]);
  const drawNotesHeader = (page: any, topY: number) => {
    page.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
    notesHeaders.forEach((header, idx) => {
      drawCellText(page, header, notesXs[idx], notesXs[idx + 1], topY - 12, 8, fontBold, rgb(1, 1, 1));
    });
  };

  const paymentHeaders = ['FECHA', 'FOLIO', 'METODO', 'MONTO', 'REFERENCIA'];
  const paymentRatios = [0.26, 0.22, 0.16, 0.16, 0.2];
  const paymentXs = paymentRatios.reduce<number[]>((acc, ratio) => {
    acc.push(acc[acc.length - 1] + frameWidth * ratio);
    return acc;
  }, [marginX]);
  const drawPaymentHeader = (page: any, topY: number) => {
    page.drawRectangle({ x: marginX, y: topY - 16, width: frameWidth, height: 16, color: rgb(0, 0, 0) });
    paymentHeaders.forEach((header, idx) => {
      drawCellText(page, header, paymentXs[idx], paymentXs[idx + 1], topY - 12, 8, fontBold, rgb(1, 1, 1));
    });
  };

  const notesById = input.notes.reduce<Record<string, CustomerNoteRow>>((acc, note) => {
    acc[note.id] = note;
    return acc;
  }, {});

  let pageNumber = 1;
  let page = startStatementPage(pageNumber);
  let rowY = notesTop - 32;
  drawNotesHeader(page, notesTop);

  if (input.notes.length === 0) {
    page.drawRectangle({
      x: marginX,
      y: rowY - 2,
      width: frameWidth,
      height: 20,
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
    });
    page.drawText('SIN NOTAS REGISTRADAS', { x: marginX + 200, y: rowY + 4, size: 8, font: fontBold });
    rowY -= 22;
  } else {
    for (const note of input.notes) {
      const rowHeight = 18;
      if (rowY - 2 < frameY + 24) {
        pageNumber += 1;
        page = startStatementPage(pageNumber);
        drawNotesHeader(page, notesTop);
        rowY = notesTop - 32;
      }
      page.drawRectangle({
        x: marginX,
        y: rowY - 2,
        width: frameWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < notesXs.length - 1; c += 1) {
        page.drawLine({
          start: { x: notesXs[c], y: rowY - 2 },
          end: { x: notesXs[c], y: rowY + rowHeight - 2 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      drawCellText(page, note.folio ?? '-', notesXs[0], notesXs[1], rowY + 4, 8, fontBold);
      drawCellText(page, note.issue_date ?? '-', notesXs[1], notesXs[2], rowY + 4, 8, fontRegular);
      drawCellText(page, note.due_date ?? '-', notesXs[2], notesXs[3], rowY + 4, 8, fontRegular);
      drawCellText(page, formatCurrency(Number(note.total ?? 0)), notesXs[3], notesXs[4], rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(Number(note.paid_amount ?? 0)), notesXs[4], notesXs[5], rowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(Number(note.balance ?? 0)), notesXs[5], notesXs[6], rowY + 4, 8, fontBold);
      drawCellText(page, note.status ?? 'ABIERTA', notesXs[6], notesXs[7], rowY + 4, 8, fontBold);
      rowY -= rowHeight;
    }
  }

  const ensurePaymentSection = () => {
    const minimumSectionHeight = 46;
    if (rowY - 18 - minimumSectionHeight < frameY + 24) {
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
    page.drawRectangle({
      x: marginX,
      y: payRowY - 2,
      width: frameWidth,
      height: 20,
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
    });
    page.drawText('SIN ABONOS REGISTRADOS', { x: marginX + 195, y: payRowY + 4, size: 8, font: fontBold });
  } else {
    for (const payment of input.payments) {
      const rowHeight = 18;
      if (payRowY - 2 < frameY + 24) {
        pageNumber += 1;
        page = startStatementPage(pageNumber);
        paymentTop = notesTop;
        page.drawText('ABONOS REALIZADOS', { x: marginX + 16, y: paymentTop + 8, size: 10, font: fontBold });
        drawPaymentHeader(page, paymentTop);
        payRowY = paymentTop - 32;
      }
      page.drawRectangle({
        x: marginX,
        y: payRowY - 2,
        width: frameWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < paymentXs.length - 1; c += 1) {
        page.drawLine({
          start: { x: paymentXs[c], y: payRowY - 2 },
          end: { x: paymentXs[c], y: payRowY + rowHeight - 2 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      drawCellText(page, formatLocalDateTime(payment.paid_at), paymentXs[0], paymentXs[1], payRowY + 4, 8, fontRegular);
      drawCellText(page, notesById[payment.note_id]?.folio ?? '-', paymentXs[1], paymentXs[2], payRowY + 4, 8, fontBold);
      drawCellText(page, payment.method ?? 'EFECTIVO', paymentXs[2], paymentXs[3], payRowY + 4, 8, fontBold);
      drawCellText(page, formatCurrency(Number(payment.amount ?? 0)), paymentXs[3], paymentXs[4], payRowY + 4, 8, fontBold);
      drawCellText(page, payment.reference ?? '-', paymentXs[4], paymentXs[5], payRowY + 4, 8, fontRegular);
      payRowY -= rowHeight;
    }
  }

  await drawSalesDetailPages(pdfDoc, input, fontRegular, fontBold, watermarkImage, pageNumber + 1);

  const pdfBytes = await pdfDoc.save();
  const filename = `${input.moduleLabel}-${toFileToken(input.branchName, 'SUCURSAL')}-CLIENTE-${toFileToken(input.customer.name, 'SIN-NOMBRE')}.pdf`;
  openPdfPreview(new Blob([pdfBytes], { type: 'application/pdf' }), filename, input.previewWindow);
};
