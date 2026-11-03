import { mul, parseDecimal, toMinorUnits } from './rational';
import type { MinorUnits } from './types';

/** Currencies whose minor unit differs from 2 digits; used when Intl data is unavailable. */
const FRACTION_DIGIT_OVERRIDES: Readonly<Record<string, number>> = {
  BHD: 3,
  CLP: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  TND: 3,
  UGX: 0,
  VND: 0,
  XAF: 0,
  XOF: 0,
};

const ISO_CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

export function isValidCurrencyCode(code: string): boolean {
  return ISO_CURRENCY_RE.test(code);
}

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for an ISO-4217 currency (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyFractionDigits(currency: string): number {
  const cached = digitsCache.get(currency);
  if (cached !== undefined) return cached;
  let digits = FRACTION_DIGIT_OVERRIDES[currency] ?? 2;
  try {
    const resolved = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions();
    if (typeof resolved.maximumFractionDigits === 'number') digits = resolved.maximumFractionDigits;
  } catch {
    // Unknown currency for this Intl implementation: keep the table value.
  }
  digitsCache.set(currency, digits);
  return digits;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(
  locale: string,
  currency: string,
  signDisplay: SignDisplay,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${signDisplay}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const digits = currencyFractionDigits(currency);
    try {
      formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        signDisplay,
      });
    } catch {
      formatter = new Intl.NumberFormat('en', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        signDisplay,
      });
    }
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export type SignDisplay = 'auto' | 'always' | 'exceptZero' | 'never';

export interface FormatMoneyOptions {
  locale?: string;
  signDisplay?: SignDisplay;
}

/** The single formatting entry point for money anywhere in the app. */
export function formatMoney(
  amount: MinorUnits,
  currency: string,
  { locale = 'en-US', signDisplay = 'auto' }: FormatMoneyOptions = {},
): string {
  const digits = currencyFractionDigits(currency);
  const major = amount / 10 ** digits;
  return getFormatter(locale, currency, signDisplay).format(major);
}

/** Formats minor units as a plain, locale-independent decimal string ("1234.50"). */
export function toMajorString(amount: MinorUnits, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const negative = amount < 0;
  const abs = Math.abs(Math.trunc(amount))
    .toString()
    .padStart(digits + 1, '0');
  const intPart = digits === 0 ? abs : abs.slice(0, -digits);
  const fracPart = digits === 0 ? '' : `.${abs.slice(-digits)}`;
  return `${negative ? '-' : ''}${intPart}${fracPart}`;
}

export interface ParseAmountOptions {
  decimalSeparator?: '.' | ',';
  allowNegative?: boolean;
}

/**
 * Parses user/imported text ("1,234.56", "1.234,56", "-12", "$ 9.99") into minor units.
 * Returns null for anything that is not a finite, representable amount.
 */
export function parseAmount(
  input: string,
  currency: string,
  { decimalSeparator = '.', allowNegative = true }: ParseAmountOptions = {},
): MinorUnits | null {
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[\s\u00A0\u202F']/g, '');
  text = text.replace(/^[^\d.,+-]+|[^\d.,]+$/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  const thousands = decimalSeparator === '.' ? ',' : '.';
  text = text.split(thousands).join('');
  if (decimalSeparator === ',') text = text.replace(',', '.');
  if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') return null;
  const value = parseDecimal(text);
  if (!value) return null;
  const minor = Number(toMinorUnits(value, currencyFractionDigits(currency)));
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_SAFE_MINOR) return null;
  if (negative && !allowNegative) return null;
  return negative ? -minor : minor;
}

/**
 * Converts an amount between currencies with a manual exchange rate expressed as
 * "1 unit of `from` = `rate` units of `to`". Handles differing minor-unit digits.
 */
export function convertAmount(
  amount: MinorUnits,
  fromCurrency: string,
  toCurrency: string,
  rate: string,
): MinorUnits | null {
  const parsedRate = parseDecimal(rate.replace(',', '.'));
  if (!parsedRate || parsedRate.num <= 0n) return null;
  const major = parseDecimal(toMajorString(amount, fromCurrency));
  if (!major) return null;
  const converted = Number(
    toMinorUnits(mul(major, parsedRate), currencyFractionDigits(toCurrency)),
  );
  return Number.isSafeInteger(converted) ? converted : null;
}

export function isValidAmount(amount: unknown): amount is MinorUnits {
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0;
}
