const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'MXN';
const DEFAULT_CURRENCY_SYMBOL = '$';

export const formatCurrency = (value: number, locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY) => {
  const amount = Number.isFinite(value) ? value : 0;
  const formattedAmount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  const symbol = currency === 'MXN' || currency === 'COP' || currency === 'USD'
    ? DEFAULT_CURRENCY_SYMBOL
    : `${currency} `;

  return amount < 0 ? `-${symbol} ${formattedAmount}` : `${symbol} ${formattedAmount}`;
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
