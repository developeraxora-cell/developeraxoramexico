import { PDFDocument, rgb } from 'pdf-lib';
import { formatNumber } from '../currency';
import { getBranchFooterText } from './branchFooter';

interface PhysicalInventoryReportRow {
  product_name: string;
  base_uom_code: string;
  system_qty: number;
  physical_qty: number;
  difference_qty: number;
  observation: string | null;
}

interface PhysicalInventoryReportInput {
  moduleLabel: 'MATERIALES';
  branchName: string;
  branchId?: string | null;
  inventoryName: string;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVO' | 'CERRADO';
  summary: {
    total: number;
    exact: number;
    missing: number;
    surplus: number;
    reliability: number;
  };
  rows: PhysicalInventoryReportRow[];
  previewWindow?: Window | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 28;
const FOOTER_Y = 64;
const FRAME_Y = 75;
const FRAME_HEIGHT = PAGE_HEIGHT - FRAME_Y - 70;
const FRAME_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TABLE_HEADER_HEIGHT = 18;
const ROW_HEIGHT = 22;

let watermarkPngBytesPromise: Promise<ArrayBuffer | null> | null = null;

const toSafeFilenameDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

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

const formatLocalDate = (value: string | null | undefined) => {
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
  return parsed.toLocaleDateString();
};

const triggerDownload = (url: string, filename: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const openPdfPreview = (blob: Blob, filename: string, targetWindow?: Window | null) => {
  const url = URL.createObjectURL(blob);
  const previewWindow = targetWindow && !targetWindow.closed ? targetWindow : null;

  // Solo navegar si la ventana fue abierta antes (gesto del usuario). Tras los await
  // de generacion, window.open queda bloqueado por el navegador -> descargar directo.
  if (previewWindow) {
    try {
      previewWindow.document.title = filename;
      previewWindow.location.href = url;
    } catch {
      triggerDownload(url, filename);
    }
  } else {
    triggerDownload(url, filename);
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

const createPage = async (
  pdfDoc: PDFDocument,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
  input: PhysicalInventoryReportInput,
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

  const subtitle = 'REPORTE DE INVENTARIO FISICO';
  const subtitleWidth = fontBold.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (PAGE_WIDTH - subtitleWidth) / 2,
    y: PAGE_HEIGHT - 62,
    size: 10,
    font: fontBold,
  });

  page.drawText(`INVENTARIO: ${input.inventoryName.toUpperCase()}`, {
    x: MARGIN_X + 12,
    y: PAGE_HEIGHT - 96,
    size: 10,
    font: fontBold,
  });
  page.drawText(`FECHA INICIO: ${formatLocalDate(input.startDate)}`, {
    x: MARGIN_X + 12,
    y: PAGE_HEIGHT - 118,
    size: 10,
    font: fontBold,
  });
  page.drawText(`FECHA FIN: ${formatLocalDate(input.endDate)}`, {
    x: PAGE_WIDTH - MARGIN_X - 170,
    y: PAGE_HEIGHT - 118,
    size: 10,
    font: fontBold,
  });
  page.drawText(`ESTADO: ${input.status}`, {
    x: PAGE_WIDTH - MARGIN_X - 170,
    y: PAGE_HEIGHT - 96,
    size: 10,
    font: fontBold,
  });

  const footerText = getBranchFooterText(input.branchName, {
    moduleLabel: input.moduleLabel,
    branchId: input.branchId,
  });
  page.drawText(footerText, {
    x: MARGIN_X + 75,
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

  return { page, cursorY: PAGE_HEIGHT - 144, pageNumber };
};

const ensureTableSpace = async (
  pdfDoc: PDFDocument,
  ctx: PdfPageContext,
  neededHeight: number,
  fontRegular: any,
  fontBold: any,
  watermarkImage: any,
  input: PhysicalInventoryReportInput,
) => {
  if (ctx.cursorY - neededHeight >= FOOTER_Y + 30) return ctx;
  return createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, ctx.pageNumber + 1);
};

const drawSummaryTable = (
  page: any,
  startX: number,
  topY: number,
  tableWidth: number,
  summary: PhysicalInventoryReportInput['summary'],
  fontRegular: any,
  fontBold: any,
) => {
  const labels = [
    'TOTAL PRODUCTOS',
    'SIN DIFERENCIAS',
    'CON FALTANTE',
    'CON SOBRANTE',
    'PORCENTAJE DE FIABILIDAD',
  ];
  const values = [
    String(summary.total),
    String(summary.exact),
    String(summary.missing),
    String(summary.surplus),
    `${summary.reliability.toFixed(2)}%`,
  ];
  const colWidth = 72;
  const summaryWidth = colWidth * labels.length;
  const LABEL_H = 16;
  const VALUE_H = 18;

  // Centrar horizontalmente dentro del marco
  startX = startX + (tableWidth - summaryWidth) / 2;

  const labelTop = topY;
  const valueTop = labelTop - LABEL_H;

  // Fila de etiquetas (cabecera negra)
  page.drawRectangle({
    x: startX,
    y: labelTop - LABEL_H,
    width: summaryWidth,
    height: LABEL_H,
    color: rgb(0, 0, 0),
  });
  // Fila de valores (blanca con borde)
  page.drawRectangle({
    x: startX,
    y: valueTop - VALUE_H,
    width: summaryWidth,
    height: VALUE_H,
    borderWidth: 0.5,
    borderColor: rgb(0, 0, 0),
    color: rgb(1, 1, 1),
  });

  let x = startX;
  labels.forEach((label, index) => {
    const nextX = x + colWidth;
    if (index > 0) {
      // divisor visible en cabecera (blanco) y en valores (negro)
      page.drawLine({ start: { x, y: labelTop }, end: { x, y: valueTop }, thickness: 0.5, color: rgb(1, 1, 1) });
      page.drawLine({ start: { x, y: valueTop }, end: { x, y: valueTop - VALUE_H }, thickness: 0.5, color: rgb(0, 0, 0) });
    }
    drawCenteredCellText(page, label, x, nextX, labelTop - 11, 6, fontBold, rgb(1, 1, 1));
    drawCenteredCellText(page, values[index], x, nextX, valueTop - 12, 9, fontBold);
    x = nextX;
  });

  return valueTop - VALUE_H - 18;
};

export const generatePhysicalInventoryReportPdf = async (input: PhysicalInventoryReportInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
  const watermarkPngBytes = await getWatermarkPngBytes();
  const watermarkImage = watermarkPngBytes ? await pdfDoc.embedPng(watermarkPngBytes) : null;

  let ctx = await createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, 1);

  ctx.cursorY = drawSummaryTable(
    ctx.page,
    MARGIN_X,
    ctx.cursorY - 8,
    FRAME_WIDTH,
    input.summary,
    fontRegular,
    fontBold,
  );

  const cols: TableColumn[] = [
    { label: '#', width: 24, align: 'center' },
    { label: 'PRODUCTO', width: 150, align: 'left' },
    { label: 'UNIDAD BASE', width: 58, align: 'center' },
    { label: 'STOCK SISTEMA', width: 70, align: 'center' },
    { label: 'STOCK FISICO', width: 66, align: 'center' },
    { label: 'DIFERENCIA', width: 62, align: 'center' },
    { label: 'OBSERVACION', width: 109, align: 'left' },
  ];

  const tableWidth = cols.reduce((sum, col) => sum + col.width, 0);
  const startX = MARGIN_X;

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
      drawCenteredCellText(ctx.page, col.label, x, nextX, ctx.cursorY - 12, 7, fontBold, rgb(1, 1, 1));
      x = nextX;
    });
    ctx.cursorY -= TABLE_HEADER_HEIGHT;
  };

  const drawTableRow = (row: PhysicalInventoryReportRow, rowIndex: number) => {
    ctx.page.drawRectangle({
      x: startX,
      y: ctx.cursorY - ROW_HEIGHT,
      width: tableWidth,
      height: ROW_HEIGHT,
      color: rgb(1, 1, 1),
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
    });

    let x = startX;
    const values = [
      String(rowIndex + 1),
      row.product_name,
      row.base_uom_code || '-',
      formatNumber(Number(row.system_qty), undefined, { maximumFractionDigits: 3 }),
      formatNumber(Number(row.physical_qty), undefined, { maximumFractionDigits: 3 }),
      formatNumber(Number(row.difference_qty), undefined, { maximumFractionDigits: 3 }),
      row.observation || '-',
    ];

    cols.forEach((col, colIndex) => {
      const nextX = x + col.width;
      const value = values[colIndex];
      if (col.align === 'left') {
        drawLeftCellText(ctx.page, value, x, nextX, ctx.cursorY - 14, 8, fontBold);
      } else {
        drawCenteredCellText(ctx.page, value, x, nextX, ctx.cursorY - 14, 8, fontBold);
      }
      ctx.page.drawLine({
        start: { x: nextX, y: ctx.cursorY },
        end: { x: nextX, y: ctx.cursorY - ROW_HEIGHT },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      x = nextX;
    });

    ctx.cursorY -= ROW_HEIGHT;
  };

  const rows = input.rows;

  if (rows.length === 0) {
    ctx = await ensureTableSpace(pdfDoc, ctx, ROW_HEIGHT + 16, fontRegular, fontBold, watermarkImage, input);
    drawHeader();
    ctx.page.drawRectangle({
      x: startX,
      y: ctx.cursorY - ROW_HEIGHT,
      width: tableWidth,
      height: ROW_HEIGHT,
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
      color: rgb(1, 1, 1),
    });
    drawCenteredCellText(ctx.page, 'SIN PRODUCTOS REGISTRADOS', startX, startX + tableWidth, ctx.cursorY - 14, 8.5, fontBold);
    ctx.cursorY -= ROW_HEIGHT;
  } else {
    ctx = await ensureTableSpace(pdfDoc, ctx, TABLE_HEADER_HEIGHT + ROW_HEIGHT, fontRegular, fontBold, watermarkImage, input);
    drawHeader();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (ctx.cursorY - ROW_HEIGHT < FOOTER_Y + 30) {
        ctx = await createPage(pdfDoc, fontRegular, fontBold, watermarkImage, input, ctx.pageNumber + 1);
        drawHeader();
      }
      drawTableRow(row, index);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const filename = `REPORTE INVENTARIO FISICO - ${toFileToken(input.inventoryName, 'INVENTARIO')} - ${toFileToken(input.branchName, 'SUCURSAL')} - ${toSafeFilenameDateTime(new Date())}.pdf`;
  openPdfPreview(blob, filename, input.previewWindow);
};
