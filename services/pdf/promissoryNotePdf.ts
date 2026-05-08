import type { PDFDocument } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { formatCurrency } from '../currency';
import { getBranchFooterText } from './branchFooter';

interface AppendPromissoryNotePageInput {
  pdfDoc: PDFDocument;
  fontRegular: any;
  fontBold: any;
  watermarkImage?: any | null;
  moduleLabel: 'MATERIALES' | 'CONCRETERA';
  branchName: string;
  branchId?: string | null;
  customerName: string;
  amount: number;
  dueDate?: string | null;
}

interface DrawPromissoryFooterInput {
  page: any;
  fontRegular: any;
  fontBold: any;
  branchName: string;
  customerName: string;
  amount: number;
  dueDate?: string | null;
  topY: number;
  leftX: number;
  rightX: number;
}

const getPromissoryPlaceOfPayment = (branchName: string) => {
  const normalized = String(branchName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (normalized.includes('DEGOLLADO')) return 'Degollado Jalisco';
  if (normalized.includes('JESUS MARIA')) return 'Jesus Maria Jalisco';
  return branchName || 'SUCURSAL';
};

const formatLocalDate = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '__ / __ / __';

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }

  const normalized = raw.includes('T')
    ? raw
    : raw.includes(' ')
      ? raw.replace(' ', 'T')
      : `${raw}T00:00:00`;
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('es-MX');
};

const units = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const specialTens: Record<number, string> = {
  10: 'diez',
  11: 'once',
  12: 'doce',
  13: 'trece',
  14: 'catorce',
  15: 'quince',
  16: 'dieciseis',
  17: 'diecisiete',
  18: 'dieciocho',
  19: 'diecinueve',
  20: 'veinte',
};
const tens = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const apocopateOne = (value: string) =>
  value
    .replace(/veintiuno$/u, 'veintiun')
    .replace(/ y uno$/u, ' y un')
    .replace(/uno$/u, 'un');

const convertBelowHundred = (value: number, apocopate = false): string => {
  if (value < 10) return apocopate ? apocopateOne(units[value]) : units[value];
  if (value <= 20) return apocopate ? apocopateOne(specialTens[value]) : specialTens[value];
  if (value < 30) {
    const word = `${tens[2]}${units[value - 20]}`;
    return apocopate ? apocopateOne(word) : word;
  }
  const ten = Math.floor(value / 10);
  const unit = value % 10;
  const word = unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
  return apocopate ? apocopateOne(word) : word;
};

const convertBelowThousand = (value: number, apocopate = false): string => {
  if (value === 0) return '';
  if (value === 100) return 'cien';
  if (value < 100) return convertBelowHundred(value, apocopate);

  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const word = rest === 0
    ? hundreds[hundred]
    : `${hundreds[hundred]} ${convertBelowHundred(rest, apocopate)}`;
  return apocopate ? apocopateOne(word) : word;
};

const convertIntegerToSpanish = (value: number): string => {
  if (value === 0) return 'cero';
  if (value < 1000) return convertBelowThousand(value, true);

  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const rest = value % 1000;
  const parts: string[] = [];

  if (millions > 0) {
    parts.push(millions === 1 ? 'un millon' : `${convertBelowThousand(millions, true)} millones`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mil' : `${convertBelowThousand(thousands, true)} mil`);
  }
  if (rest > 0) {
    parts.push(convertBelowThousand(rest, true));
  }

  return parts.join(' ');
};

const formatCurrencyAsWords = (amount: number) => {
  const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const integerPart = Math.floor(safeAmount);
  const cents = Math.round((safeAmount - integerPart) * 100);
  const pesosLabel = integerPart === 1 ? 'peso mexicano' : 'pesos mexicanos';
  const centsText = cents > 0 ? ` con ${String(cents).padStart(2, '0')} centavos` : '';
  return `${convertIntegerToSpanish(integerPart)} ${pesosLabel}${centsText}`;
};

export const appendPromissoryNotePage = ({
  pdfDoc,
  fontRegular,
  fontBold,
  watermarkImage,
  moduleLabel,
  branchName,
  branchId,
  customerName,
  amount,
  dueDate,
}: AppendPromissoryNotePageInput) => {
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const marginX = 30;
  const outerY = 75;
  const outerTop = height - 70;
  const outerHeight = outerTop - outerY;

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
    y: outerY,
    width: width - marginX * 2,
    height: outerHeight,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });

  const title = `${moduleLabel} ${(branchName || 'SUCURSAL').toUpperCase()}`;
  const titleWidth = fontBold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 42,
    size: 14,
    font: fontBold,
  });

  const footerLines = [
    'PAGARE MERCANTIL',
    '',
    'Debo y pagare incondicionalmente a la orden de:',
    '',
    'La cantidad de:',
    formatCurrency(amount),
    `(${formatCurrencyAsWords(amount)})`,
    '',
    'por mercancia recibida a mi entera satisfaccion.',
    '',
    `Fecha de vencimiento: ${formatLocalDate(dueDate)}`,
    '',
    `Lugar de pago: ${getPromissoryPlaceOfPayment(branchName)}`,
    '',
    'En caso de incumplimiento, pagare intereses moratorios del 10% mensual hasta la liquidacion total del adeudo.',
    '',
    `Nombre del deudor: ${customerName.toUpperCase()}`,
    '',
    'Firma: ________________________________________________',
  ];

  let y = height - 150;
  const maxWidth = width - marginX * 2 - 24;

  const drawWrappedText = (text: string, font: any, size: number, lineHeight = 16) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      y -= lineHeight;
      return;
    }

    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        page.drawText(line, { x: marginX + 12, y, size, font });
        y -= lineHeight;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x: marginX + 12, y, size, font });
      y -= lineHeight;
    }
  };

  const footerTopY = 200;
  page.drawLine({
    start: { x: marginX + 12, y: footerTopY },
    end: { x: width - marginX - 12, y: footerTopY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  y = footerTopY - 18;
  footerLines.forEach((line, index) => {
    if (!line) {
      y -= index === 0 ? 6 : 4;
      return;
    }
    const font = index === 0
      ? fontBold
      : line.startsWith('Fecha de vencimiento:')
        || line.startsWith('Lugar de pago:')
        || line.startsWith('Nombre del deudor:')
        || line.startsWith('Firma del deudor:')
      ? fontBold
      : fontRegular;
    drawWrappedText(line, font, index === 0 ? 10 : 7.5, index === 0 ? 13 : 11);
  });

  page.drawText(getBranchFooterText(branchName, { moduleLabel, branchId }), {
    x: marginX + 80,
    y: 64,
    size: 9,
    font: fontBold,
  });
  page.drawText(`Pagina ${pdfDoc.getPageCount()}`, {
    x: width - marginX - 54,
    y: 64,
    size: 9,
    font: fontBold,
  });
};

export const drawPromissoryFooterBlock = ({
  page,
  fontRegular,
  fontBold,
  branchName,
  customerName,
  amount,
  dueDate,
  topY,
  leftX,
  rightX,
}: DrawPromissoryFooterInput) => {
  const maxWidth = rightX - leftX;
  const contentLeftX = leftX + 14;
  const lines = [
    { text: 'PAGARE MERCANTIL', bold: true, size: 8.5, gap: 9 },
    { text: `Debo y pagare incondicionalmente a la orden de: ${formatCurrency(amount)} (${formatCurrencyAsWords(amount)}) por mercancia recibida a mi entera satisfaccion.`, bold: false, size: 6, gap: 7 },
    { text: `Fecha de vencimiento: ${formatLocalDate(dueDate)}   Lugar de pago: ${getPromissoryPlaceOfPayment(branchName)}`, bold: true, size: 6, gap: 7 },
    { text: 'En caso de incumplimiento, pagare intereses moratorios del 10% mensual hasta la liquidacion total del adeudo.', bold: false, size: 5.8, gap: 7 },
    { text: `Nombre del deudor: ${customerName.toUpperCase()}   Firma: ________________________________________________`, bold: true, size: 6, gap: 7 },
  ];

  page.drawLine({
    start: { x: leftX, y: topY },
    end: { x: rightX, y: topY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  let y = topY - 14;

  const drawWrapped = (text: string, font: any, size: number, lineGap: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        page.drawText(line, { x: contentLeftX, y, size, font });
        y -= lineGap;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x: contentLeftX, y, size, font });
      y -= lineGap;
    }
  };

  lines.forEach((line) => {
    const font = line.bold ? fontBold : fontRegular;
    drawWrapped(line.text, font, line.size, line.gap);
  });
};
