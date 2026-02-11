const DEFAULT_LOCALE = 'es-CO';
const DEFAULT_CURRENCY = 'COP';

export const formatCurrency = (value: number, locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY) => {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatNumber = (
  value: number,
  locale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {}
) => {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale, options).format(amount);
};

export const CURRENCY_CODE = DEFAULT_CURRENCY;
export const CURRENCY_LOCALE = DEFAULT_LOCALE;
