/** Curated list of ISO-4217 codes offered in pickers. Any valid code is accepted on import. */
export const COMMON_CURRENCIES: readonly string[] = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'CNY',
  'CAD',
  'AUD',
  'NZD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'TRY',
  'UAH',
  'ILS',
  'AED',
  'SAR',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'EGP',
  'ZAR',
  'NGN',
  'KES',
  'BRL',
  'MXN',
  'ARS',
  'CLP',
  'COP',
  'PEN',
  'SGD',
  'HKD',
  'TWD',
  'KRW',
  'THB',
  'MYR',
  'IDR',
  'PHP',
  'VND',
  'PKR',
  'BDT',
  'LKR',
  'NPR',
];

/** Offered first, with a name and symbol, in every currency picker. */
export const PRIMARY_CURRENCIES = ['INR', 'USD', 'EUR'] as const;
export type PrimaryCurrency = (typeof PRIMARY_CURRENCIES)[number];

export function isPrimaryCurrency(code: string): code is PrimaryCurrency {
  return (PRIMARY_CURRENCIES as readonly string[]).includes(code);
}

/** Picker order: rupee, dollar and euro, then the rest; an unlisted current code is kept. */
export function currencyChoices(current?: string): string[] {
  const rest = COMMON_CURRENCIES.filter((c) => !isPrimaryCurrency(c));
  const all = [...PRIMARY_CURRENCIES, ...rest];
  return current && !all.includes(current) ? [current, ...all] : all;
}
