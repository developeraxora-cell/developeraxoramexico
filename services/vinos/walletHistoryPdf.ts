import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';

export interface WalletPdfMovementRow {
  date: string;
  reference: string;
  user: string;
  notes?: string | null;
  amount: number;
}

export interface WalletPdfInput {
  branchName: string;
  customerName: string;
  generatedAt: string;
  currentBalance: number;
  opening: number;
  lastRecharge: string | null;
  recargas: WalletPdfMovementRow[];
  gastos: WalletPdfMovementRow[];
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 30;
const FOOTER_Y = 64;
const FRAME_Y = 75;
const FRAME_HEIGHT = PAGE_HEIGHT - FRAME_Y - 70;
const FRAME_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TABLE_HEADER_H = 16;
const ROW_H = 22;

const sanitize = (text: string): string => {
  if (!text) return '';
  return String(text)
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\xFF]/g, '?');
};

const fitText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  let safe = sanitize(String(text ?? ''));
  while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > maxWidth) {
    safe = safe.slice(0, -1);
  }
  if (safe !== sanitize(text) && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
  return safe;
};

const drawCenteredCellText = (page: PDFPage, text: string, xStart: number, xEnd: number, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) => {
  const safe = fitText(text, font, size, xEnd - xStart - 8);
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: xStart + Math.max(4, ((xEnd - xStart) - w) / 2), y, size, font, color });
};

type Ctx = { page: PDFPage; cursorY: number; pageNumber: number };

interface TableCol { label: string; width: number }

export const generateVinosWalletHistoryPdf = async (input: WalletPdfInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontReg = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');

  const createPage = (pageNumber: number): Ctx => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    page.drawRectangle({
      x: MARGIN_X, y: FRAME_Y, width: FRAME_WIDTH, height: FRAME_HEIGHT,
      borderWidth: 1, borderColor: rgb(0, 0, 0),
    });

    const title = sanitize(`VINOS ${(input.branchName || 'CASA TAHONA').toUpperCase()}`);
    const tw = fontBold.widthOfTextAtSize(title, 14);
    page.drawText(title, { x: (PAGE_WIDTH - tw) / 2, y: PAGE_HEIGHT - 42, size: 14, font: fontBold });

    const subtitle = 'HISTORIAL DE SALDO A FAVOR';
    const sw = fontBold.widthOfTextAtSize(subtitle, 10);
    page.drawText(subtitle, { x: (PAGE_WIDTH - sw) / 2, y: PAGE_HEIGHT - 62, size: 10, font: fontBold });

    // CLIENTE + FECHA (row 1)
    page.drawText(sanitize(`CLIENTE: ${input.customerName.toUpperCase()}`), {
      x: MARGIN_X + 12, y: PAGE_HEIGHT - 100, size: 10, font: fontBold,
    });
    page.drawText(sanitize(`FECHA: ${input.generatedAt}`), {
      x: PAGE_WIDTH - MARGIN_X - 200, y: PAGE_HEIGHT - 100, size: 10, font: fontBold,
    });

    // SALDO ACTUAL (row 2 — solo derecha, sin DIRECCION)
    page.drawText(sanitize(`SALDO ACTUAL: ${formatCurrency(input.currentBalance)}`), {
      x: PAGE_WIDTH - MARGIN_X - 200, y: PAGE_HEIGHT - 122, size: 10, font: fontBold,
    });

    // APERTURA + ULTIMA RECARGA (row 3)
    page.drawText(sanitize(`APERTURA: ${formatCurrency(input.opening)}`), {
      x: MARGIN_X + 12, y: PAGE_HEIGHT - 144, size: 10, font: fontBold,
    });
    page.drawText(sanitize(`ULTIMA RECARGA: ${input.lastRecharge ?? '-'}`), {
      x: PAGE_WIDTH - MARGIN_X - 230, y: PAGE_HEIGHT - 144, size: 10, font: fontBold,
    });

    // Footer
    page.drawText(sanitize(`Casa Tahona - Vinos - ${input.branchName || ''}`.trim()), {
      x: MARGIN_X + 80, y: FOOTER_Y, size: 9, font: fontBold,
    });
    page.drawText(`Pagina ${pageNumber}`, {
      x: PAGE_WIDTH - MARGIN_X - 52, y: FOOTER_Y, size: 9, font: fontBold,
    });

    return { page, cursorY: PAGE_HEIGHT - 178, pageNumber };
  };

  const ensureSpace = (ctx: Ctx, neededHeight: number): Ctx => {
    if (ctx.cursorY - neededHeight >= FOOTER_Y + 30) return ctx;
    return createPage(ctx.pageNumber + 1);
  };

  const drawSectionTitle = (page: PDFPage, title: string, y: number) => {
    const w = fontBold.widthOfTextAtSize(title, 10);
    page.drawText(title, { x: (PAGE_WIDTH - w) / 2, y, size: 10, font: fontBold });
  };

  const drawMovementTable = (ctxIn: Ctx, title: string, movements: WalletPdfMovementRow[]): Ctx => {
    const cols: TableCol[] = [
      { label: 'NO.',            width: 40  },
      { label: 'FECHA',          width: 135 },
      { label: 'REFERENCIA',     width: 125 },
      { label: 'USUARIO / NOTA', width: 140 },
      { label: 'MONTO',          width: 95  },
    ];
    const tableWidth = cols.reduce((s, c) => s + c.width, 0);
    const startX = MARGIN_X + (FRAME_WIDTH - tableWidth) / 2;

    let ctx = ensureSpace(ctxIn, 42);
    drawSectionTitle(ctx.page, title, ctx.cursorY);
    ctx = { ...ctx, cursorY: ctx.cursorY - 10 };

    const drawHeader = () => {
      ctx.page.drawRectangle({
        x: startX, y: ctx.cursorY - TABLE_HEADER_H,
        width: tableWidth, height: TABLE_HEADER_H,
        color: rgb(0, 0, 0),
      });
      let x = startX;
      cols.forEach(col => {
        const nextX = x + col.width;
        drawCenteredCellText(ctx.page, col.label, x, nextX, ctx.cursorY - 11, 8, fontBold, rgb(1, 1, 1));
        x = nextX;
      });
      ctx = { ...ctx, cursorY: ctx.cursorY - TABLE_HEADER_H };
    };

    drawHeader();

    if (movements.length === 0) {
      ctx = ensureSpace(ctx, ROW_H);
      ctx.page.drawRectangle({
        x: startX, y: ctx.cursorY - ROW_H,
        width: tableWidth, height: ROW_H,
        borderWidth: 0.5, borderColor: rgb(0, 0, 0),
      });
      drawCenteredCellText(ctx.page, 'SIN MOVIMIENTOS REGISTRADOS', startX, startX + tableWidth, ctx.cursorY - ROW_H / 2 - 3, 8, fontBold);
      ctx = { ...ctx, cursorY: ctx.cursorY - ROW_H };
    } else {
      let total = 0;
      movements.forEach((mov, idx) => {
        ctx = ensureSpace(ctx, ROW_H);
        ctx.page.drawRectangle({
          x: startX, y: ctx.cursorY - ROW_H,
          width: tableWidth, height: ROW_H,
          borderWidth: 0.5, borderColor: rgb(0, 0, 0),
        });
        // Verticales
        let xLines = startX;
        for (let i = 0; i < cols.length - 1; i += 1) {
          xLines += cols[i].width;
          ctx.page.drawLine({
            start: { x: xLines, y: ctx.cursorY - ROW_H },
            end:   { x: xLines, y: ctx.cursorY },
            thickness: 0.5, color: rgb(0, 0, 0),
          });
        }

        let x = startX;
        const yText = ctx.cursorY - ROW_H / 2 - 3;
        drawCenteredCellText(ctx.page, String(idx + 1),                x, x + cols[0].width, yText, 8, fontReg);
        x += cols[0].width;
        drawCenteredCellText(ctx.page, mov.date,                       x, x + cols[1].width, yText, 8, fontReg);
        x += cols[1].width;
        drawCenteredCellText(ctx.page, mov.reference,                  x, x + cols[2].width, yText, 8, fontBold);
        x += cols[2].width;
        drawCenteredCellText(ctx.page, mov.user || '-',                x, x + cols[3].width, yText, 8, fontReg);
        x += cols[3].width;
        drawCenteredCellText(ctx.page, formatCurrency(mov.amount),     x, x + cols[4].width, yText, 8, fontBold);

        total += Number(mov.amount);
        ctx = { ...ctx, cursorY: ctx.cursorY - ROW_H };
      });

      // TOTAL row
      ctx = ensureSpace(ctx, ROW_H);
      ctx.page.drawRectangle({
        x: startX, y: ctx.cursorY - ROW_H,
        width: tableWidth, height: ROW_H,
        borderWidth: 0.5, borderColor: rgb(0, 0, 0),
      });
      let xLines = startX;
      for (let i = 0; i < cols.length - 1; i += 1) {
        xLines += cols[i].width;
        ctx.page.drawLine({
          start: { x: xLines, y: ctx.cursorY - ROW_H },
          end:   { x: xLines, y: ctx.cursorY },
          thickness: 0.5, color: rgb(0, 0, 0),
        });
      }
      const yText = ctx.cursorY - ROW_H / 2 - 3;
      const totalLabelX = startX + cols[0].width + cols[1].width + cols[2].width;
      drawCenteredCellText(ctx.page, 'TOTAL', totalLabelX, totalLabelX + cols[3].width, yText, 8, fontBold);
      const totalMontoX = totalLabelX + cols[3].width;
      drawCenteredCellText(ctx.page, formatCurrency(total), totalMontoX, totalMontoX + cols[4].width, yText, 8, fontBold);
      ctx = { ...ctx, cursorY: ctx.cursorY - ROW_H };
    }

    return { ...ctx, cursorY: ctx.cursorY - 24 };
  };

  let ctx = createPage(1);
  ctx = drawMovementTable(ctx, 'RECARGAS REALIZADAS', input.recargas);
  ctx = drawMovementTable(ctx, 'GASTOS REALIZADOS', input.gastos);

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win || win.closed) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `saldo-favor-${input.customerName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
