import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';
import type { ProductWithStock } from './products.service';

export interface VinosProductsListPdfInput {
  products: ProductWithStock[];
  branchName?: string | null;
  title?: string;
}

const sanitize = (text: string): string => String(text ?? '')
  .replace(/[—–]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[…]/g, '...')
  .replace(/[^\x00-\xFF]/g, '?');

const formatDate = () => new Date().toLocaleString('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const drawText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color = rgb(0.08, 0.12, 0.2),
) => {
  const safe = sanitize(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) {
    page.drawText(safe, { x, y, size, font, color });
    return;
  }
  let trimmed = safe;
  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}...`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  page.drawText(`${trimmed}...`, { x, y, size, font, color });
};

export const generateVinosProductsListPdf = async (input: VinosProductsListPdfInput) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont('Helvetica');
  const fontBold = await pdfDoc.embedFont('Helvetica-Bold');

  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;
  const rowHeight = 34;
  const headerHeight = 22;
  const tableTopGap = 70;
  const bottomMargin = 28;
  const columns = [
    { key: 'product', label: 'PRODUCTO', width: 150 },
    { key: 'category', label: 'CATEGORIA', width: 72 },
    { key: 'uom', label: 'UNIDAD', width: 55 },
    { key: 'stock', label: 'STOCK', width: 38 },
    { key: 'cost', label: 'PREC. COMPRA', width: 65 },
    { key: 'retail', label: 'MENUDEO', width: 65 },
    { key: 'mid', label: 'M. MAYOREO', width: 65 },
    { key: 'wholesale', label: 'MAYOREO', width: 65 },
    { key: 'notes', label: 'OBSERVACION', width: 219 },
  ];

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNumber = 1;

  const drawPageHeader = () => {
    y = pageHeight - margin;
    page.drawText(sanitize(input.title ?? 'LISTA DE PRODUCTOS'), {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0.05, 0.09, 0.16),
    });
    y -= 16;
    page.drawText(sanitize(`${input.branchName ?? 'CASA TAHONA'} · ${formatDate()} · ${input.products.length} productos`), {
      x: margin,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.38, 0.46, 0.58),
    });
    page.drawText(sanitize(`Pagina ${pageNumber}`), {
      x: pageWidth - margin - 48,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.38, 0.46, 0.58),
    });
    y = pageHeight - tableTopGap;
  };

  const drawTableHeader = () => {
    let x = margin;
    page.drawRectangle({
      x: margin,
      y: y - headerHeight + 5,
      width: pageWidth - (margin * 2),
      height: headerHeight,
      color: rgb(0.95, 0.97, 0.99),
      borderColor: rgb(0.86, 0.9, 0.95),
      borderWidth: 0.6,
    });
    columns.forEach((col) => {
      drawText(page, col.label, x + 4, y - 9, col.width - 8, fontBold, 6.5, rgb(0.48, 0.56, 0.68));
      x += col.width;
    });
    y -= headerHeight;
  };

  const addPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    drawPageHeader();
    drawTableHeader();
  };

  drawPageHeader();
  drawTableHeader();

  input.products.forEach((product) => {
    if (y - rowHeight < bottomMargin) addPage();

    let x = margin;
    page.drawRectangle({
      x: margin,
      y: y - rowHeight + 3,
      width: pageWidth - (margin * 2),
      height: rowHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.9, 0.93, 0.96),
      borderWidth: 0.4,
    });

    const values: Record<string, string> = {
      product: product.name,
      category: product.category?.name ?? '-',
      uom: product.uom?.name ?? '-',
      stock: String(product.total_stock ?? 0),
      cost: product.last_purchase_cost != null ? formatCurrency(product.last_purchase_cost) : '-',
      retail: formatCurrency(product.price_retail),
      mid: formatCurrency(product.price_mid_wholesale),
      wholesale: formatCurrency(product.price_wholesale),
      notes: '',
    };

    columns.forEach((col) => {
      if (col.key === 'notes') {
        page.drawRectangle({
          x: x + 4,
          y: y - rowHeight + 7,
          width: col.width - 8,
          height: rowHeight - 10,
          borderColor: rgb(0.78, 0.84, 0.91),
          borderWidth: 0.6,
        });
      } else {
        drawText(page, values[col.key], x + 4, y - 14, col.width - 8, fontRegular, 7);
        if (col.key === 'product') {
          drawText(page, product.sku, x + 4, y - 25, col.width - 8, fontRegular, 6, rgb(0.55, 0.64, 0.76));
        }
      }
      x += col.width;
    });
    y -= rowHeight;
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `productos-casa-tahona-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
