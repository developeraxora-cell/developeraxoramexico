import { PDFDocument, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';
import { getBranchFooterText } from './branchFooter';

interface WalletHistoryCustomerInfo {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface WalletHistoryWalletInfo {
  id: string;
  current_balance: number;
  opened_amount: number;
  opened_at: string;
  last_recharge_at: string | null;
}

interface WalletHistoryMovementRow {
  id: string;
  movement_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface WalletHistoryPdfInput {
  moduleLabel: 'MATERIALES' | 'CONCRETERA';
  branchName: string;
  branchId?: string | null;
  customer: WalletHistoryCustomerInfo;
  wallet: WalletHistoryWalletInfo;
  movements: WalletHistoryMovementRow[];
  previewWindow?: Window | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 30;
const FOOTER_Y = 64;
const FRAME_Y = 75;
const FRAME_HEIGHT = PAGE_HEIGHT - FRAME_Y - 70;
const FRAME_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TABLE_HEADER_HEIGHT = 16;
const ROW_HEIGHT = 22;

let watermarkPngBytesPromise: Promise<ArrayBuffer | null> | null = null;

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

const toSafeFilenameDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

const formatLocalDateTime = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';

  const normalized = raw.includes('T')
    ? raw
    : raw.includes(' ')
      ? raw.replace(' ', 'T')
      : `${raw}T00:00:00`;

  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
};

const getWatermarkPngBytes = async () => {
  if (!watermarkPngBytesPromise) {
    watermarkPngBytesPromise = fetch('/lopar-watermark.png')
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.arrayBuffer();
      })
      .catch(() => null);
  }
  return watermarkPngBytesPromise;
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

const fitText = (text: string, font: any, size: number, maxWidth: number) => {
  let safe = String(text ?? '');
  while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > maxWidth) {
    safe = safe.slice(0, -1);
  }
  if (safe !== text && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
  return safe;
};

const drawCenteredCellText = (
  page: any,
  text: string,
  xStart: number,
  xEnd: number,
  y: number,
  size: number,
  font: any,
  color = rgb(0, 0, 0),
) => {
  const safe = fitText(text, font, size, xEnd - xStart - 8);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, {
    x: xStart + Math.max(4, ((xEnd - xStart) - width) / 2),
    y,
    size,
    font,
    color,
  });
};

const drawLeftCellText = (
  page: any,
  text: string,
  xStart: number,
  xEnd: number,
  y: number,
  size: number,
  font: any,
  color = rgb(0, 0, 0),
) => {
  const safe = fitText(text, font, size, xEnd - xStart - 8);
  page.drawText(safe, {
    x: xStart + 4,
    y,
    size,
    font,
    color,
  });
};

type PdfPageContext = {
  page: any;
  cursorY: number;
  pageNumber: number;
};

type TableColumn = {
  label: string;
  width: number;
  align?: 'left' | 'center';
};

const createPage = async (
  pdfDoc: PDFDocument,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
  input: WalletHistoryPdfInput,
  pageNumber: number,
) => {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  if (watermarkImage) {
    const dims = watermarkImage.scale(0.5);
    page.drawImage(watermarkImage, {
      x: (PAGE_WIDTH - dims.width) / 2,
      y: (PAGE_HEIGHT - dims.height) / 2 - 40,
      width: dims.width,
      height: dims.height,
      opacity: 0.12,
    });
  }

  page.drawRectangle({
    x: MARGIN_X,
    y: FRAME_Y,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });

  const title = `${input.moduleLabel} ${(input.branchName || 'SUCURSAL').toUpperCase()}`;
  const titleWidth = fontBold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: PAGE_HEIGHT - 42,
    size: 14,
    font: fontBold,
  });

  const subtitle = 'HISTORIAL DE SALDO A FAVOR';
  const subtitleWidth = fontBold.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (PAGE_WIDTH - subtitleWidth) / 2,
    y: PAGE_HEIGHT - 62,
    size: 10,
    font: fontBold,
  });

  page.drawText(`CLIENTE: ${input.customer.name.toUpperCase()}`, {
    x: MARGIN_X + 12,
    y: PAGE_HEIGHT - 100,
    size: 10,
    font: fontBold,
  });
  page.drawText(`FECHA: ${new Date().toLocaleString()}`, {
    x: PAGE_WIDTH - MARGIN_X - 170,
    y: PAGE_HEIGHT - 100,
    size: 10,
    font: fontBold,
  });
  page.drawText(`DIRECCION: ${(input.customer.address || '—').toUpperCase()}`, {
    x: MARGIN_X + 12,
    y: PAGE_HEIGHT - 122,
    size: 10,
    font: fontBold,
  });
  page.drawText(`SALDO ACTUAL: ${formatCurrency(input.wallet.current_balance)}`, {
    x: PAGE_WIDTH - MARGIN_X - 200,
    y: PAGE_HEIGHT - 122,
    size: 10,
    font: fontBold,
  });
  page.drawText(`APERTURA: ${formatCurrency(input.wallet.opened_amount)}`, {
    x: MARGIN_X + 12,
    y: PAGE_HEIGHT - 144,
    size: 10,
    font: fontBold,
  });
  page.drawText(`ULTIMA RECARGA: ${formatLocalDateTime(input.wallet.last_recharge_at)}`, {
    x: PAGE_WIDTH - MARGIN_X - 230,
    y: PAGE_HEIGHT - 144,
    size: 10,
    font: fontBold,
  });

  page.drawText(getBranchFooterText(input.branchName, { moduleLabel: input.moduleLabel, branchId: input.branchId }), {
    x: MARGIN_X + 80,
    y: FOOTER_Y,
    size: 9,
    font: fontBold,
  });
  page.drawText(`Pagina ${pageNumber}`, {
    x: PAGE_WIDTH - MARGIN_X - 52,
    y: FOOTER_Y,
    size: 9,
    font: fontBold,
  });

  return { page, cursorY: PAGE_HEIGHT - 178, pageNumber };
};

const ensureTableSpace = async (
  pdfDoc: PDFDocument,
  ctx: PdfPageContext,
  neededHeight: number,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
  input: WalletHistoryPdfInput,
) => {
  if (ctx.cursorY - neededHeight >= FOOTER_Y + 30) return ctx;
  return createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, ctx.pageNumber + 1);
};

const drawSectionTitle = (
  page: any,
  title: string,
  y: number,
  fontBold: any,
) => {
  const width = fontBold.widthOfTextAtSize(title, 10);
  page.drawText(title, {
    x: (PAGE_WIDTH - width) / 2,
    y,
    size: 10,
    font: fontBold,
  });
};

const drawMovementTable = async (
  pdfDoc: PDFDocument,
  ctx: PdfPageContext,
  title: string,
  movements: WalletHistoryMovementRow[],
  input: WalletHistoryPdfInput,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
) => {
  const cols: TableColumn[] = [
    { label: 'NO.', width: 40, align: 'center' },
    { label: 'FECHA', width: 135 },
    { label: 'REFERENCIA', width: 125 },
    { label: 'USUARIO / NOTA', width: 140 },
    { label: 'MONTO', width: 95, align: 'center' },
  ];
  const tableWidth = cols.reduce((sum, col) => sum + col.width, 0);
  const startX = MARGIN_X;

  ctx = await ensureTableSpace(pdfDoc, ctx, 42, fontRegular, fontBold, watermarkImage, input);
  drawSectionTitle(ctx.page, title, ctx.cursorY, fontBold);
  ctx.cursorY -= 10;

  const drawHeader = () => {
    ctx.page.drawRectangle({
      x: startX,
      y: ctx.cursorY - TABLE_HEADER_HEIGHT,
      width: tableWidth,
      height: TABLE_HEADER_HEIGHT,
      color: rgb(0, 0, 0),
    });
    let x = startX;
    cols.forEach((col) => {
      const nextX = x + col.width;
      drawCenteredCellText(ctx.page, col.label, x, nextX, ctx.cursorY - 11, 8, fontBold, rgb(1, 1, 1));
      x = nextX;
    });
    ctx.cursorY -= TABLE_HEADER_HEIGHT;
  };

  drawHeader();

  if (movements.length === 0) {
    ctx = await ensureTableSpace(pdfDoc, ctx, ROW_HEIGHT, fontRegular, fontBold, watermarkImage, input);
    ctx.page.drawRectangle({
      x: startX,
      y: ctx.cursorY - ROW_HEIGHT,
      width: tableWidth,
      height: ROW_HEIGHT,
      borderWidth: 0.8,
      borderColor: rgb(0, 0, 0),
    });
    drawCenteredCellText(ctx.page, 'SIN MOVIMIENTOS REGISTRADOS', startX, startX + tableWidth, ctx.cursorY - 14, 8.5, fontBold);
    ctx.cursorY -= ROW_HEIGHT + 14;
    return ctx;
  }

  for (let index = 0; index < movements.length; index += 1) {
    const movement = movements[index];
    if (ctx.cursorY - ROW_HEIGHT < FOOTER_Y + 30) {
      ctx = await createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, ctx.pageNumber + 1);
      drawSectionTitle(ctx.page, title, ctx.cursorY, fontBold);
      ctx.cursorY -= 10;
      drawHeader();
    }

    ctx.page.drawRectangle({
      x: startX,
      y: ctx.cursorY - ROW_HEIGHT,
      width: tableWidth,
      height: ROW_HEIGHT,
      borderWidth: 0.8,
      borderColor: rgb(0, 0, 0),
    });

    let x = startX;
    const cells = [
      String(index + 1),
      formatLocalDateTime(movement.created_at),
      movement.reference || '—',
      movement.created_by || movement.notes || '—',
      formatCurrency(movement.amount),
    ];

    cols.forEach((col, colIndex) => {
      const nextX = x + col.width;
      drawCenteredCellText(ctx.page, cells[colIndex], x, nextX, ctx.cursorY - 14, 8, fontRegular);
      ctx.page.drawLine({
        start: { x: nextX, y: ctx.cursorY },
        end: { x: nextX, y: ctx.cursorY - ROW_HEIGHT },
        thickness: 0.8,
        color: rgb(0, 0, 0),
      });
      x = nextX;
    });

    ctx.cursorY -= ROW_HEIGHT;
  }

  const totalAmount = movements.reduce((sum, movement) => sum + Number(movement.amount ?? 0), 0);
  if (ctx.cursorY - ROW_HEIGHT < FOOTER_Y + 30) {
    ctx = await createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, ctx.pageNumber + 1);
    drawSectionTitle(ctx.page, title, ctx.cursorY, fontBold);
    ctx.cursorY -= 10;
    drawHeader();
  }

  const totalLabelStartX = startX + cols.slice(0, cols.length - 2).reduce((sum, col) => sum + col.width, 0);
  const totalAmountStartX = totalLabelStartX + cols[cols.length - 2].width;
  const totalEndX = startX + tableWidth;

  ctx.page.drawLine({
    start: { x: startX, y: ctx.cursorY },
    end: { x: totalEndX, y: ctx.cursorY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  ctx.page.drawLine({
    start: { x: startX, y: ctx.cursorY },
    end: { x: startX, y: ctx.cursorY - ROW_HEIGHT },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  ctx.page.drawLine({
    start: { x: totalEndX, y: ctx.cursorY },
    end: { x: totalEndX, y: ctx.cursorY - ROW_HEIGHT },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  ctx.page.drawLine({
    start: { x: totalLabelStartX, y: ctx.cursorY },
    end: { x: totalLabelStartX, y: ctx.cursorY - ROW_HEIGHT },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  ctx.page.drawLine({
    start: { x: totalAmountStartX, y: ctx.cursorY },
    end: { x: totalAmountStartX, y: ctx.cursorY - ROW_HEIGHT },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  ctx.page.drawLine({
    start: { x: totalLabelStartX, y: ctx.cursorY - ROW_HEIGHT },
    end: { x: totalEndX, y: ctx.cursorY - ROW_HEIGHT },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  drawCenteredCellText(ctx.page, 'TOTAL', totalLabelStartX, totalAmountStartX, ctx.cursorY - 14, 8.5, fontBold);
  drawCenteredCellText(ctx.page, formatCurrency(totalAmount), totalAmountStartX, totalEndX, ctx.cursorY - 14, 8.5, fontBold);

  ctx.cursorY -= ROW_HEIGHT + 16;
  return ctx;
};

export const generateWalletHistoryPdf = async (input: WalletHistoryPdfInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const watermarkPngBytes = await getWatermarkPngBytes();
  const watermarkImage = watermarkPngBytes ? await pdfDoc.embedPng(watermarkPngBytes) : null;

  const creditMovements = input.movements.filter((movement) => movement.balance_after >= movement.balance_before);
  const debitMovements = input.movements.filter((movement) => movement.balance_after < movement.balance_before);

  let ctx = await createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, 1);
  ctx = await drawMovementTable(pdfDoc, ctx, 'RECARGAS REALIZADAS', creditMovements, input, fontRegular, fontBold, watermarkImage);
  ctx = await drawMovementTable(pdfDoc, ctx, 'GASTOS REALIZADOS', debitMovements, input, fontRegular, fontBold, watermarkImage);

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const filename = `HISTORIAL DE SALDO A FAVOR - ${toFileToken(input.customer.name, 'CLIENTE').replace(/-/g, ' ')} - ${toSafeFilenameDateTime(new Date())}.pdf`;
  openPdfPreview(blob, filename, input.previewWindow);
};
