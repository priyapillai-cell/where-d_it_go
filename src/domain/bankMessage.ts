import { parseAmount } from './money';
import type { Account, Category, CategoryType, MinorUnits } from './types';
import { MAX_NOTE_LENGTH } from './validation';

/** What a bank or UPI text message says about one transaction. */
export interface BankMessage {
  type: CategoryType;
  amount: MinorUnits;
  currency: string;
  merchant: string | null;
  /** Local midnight of the day named in the message, or null when it names none. */
  day: Date | null;
  /** Trailing digits of the account or card ("XX1234" → "1234"). */
  accountDigits: string | null;
  /** `seed.categories` key suggested by the merchant, e.g. `eatingOut` for Swiggy. */
  categoryKey: string | null;
}

const CURRENCY_TOKENS: Record<string, string> = {
  inr: 'INR',
  rs: 'INR',
  '₹': 'INR',
  usd: 'USD',
  us$: 'USD',
  $: 'USD',
  eur: 'EUR',
  '€': 'EUR',
  gbp: 'GBP',
  '£': 'GBP',
  aed: 'AED',
};

const NUMBER = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
const PREFIXED = new RegExp(
  String.raw`(INR|Rs\.?|₹|USD|US\$|\$|EUR|€|GBP|£|AED)\s*(${NUMBER})`,
  'gi',
);
const SUFFIXED = new RegExp(String.raw`(?<![\d.,])(${NUMBER})\s*(INR|USD|EUR|GBP|AED)\b`, 'gi');
/** SBI-style "debited by 450.0" with no currency at all. */
const BARE = new RegExp(
  String.raw`\b(?:debited|credited|deducted)\s+(?:by|for|with)\s+(${NUMBER})`,
  'i',
);
/** An amount right after these words is a balance or limit, not the transaction. */
const BALANCE_BEFORE = /(?:bal(?:ance)?|avl|avbl|available|limit|lmt|outstanding)[\s:.-]*$/i;

const NOT_A_TRANSACTION =
  /\bOTP\b|one[- ]time password|verification code|(?:will|to) be (?:debited|deducted|charged|credited|paid)|has requested|is due|due (?:on|by|date)|\bdeclined\b|\bfailed\b/i;

const EXPENSE_WORDS =
  /\b(?:debited|debit|spent|paid|sent|withdrawn|withdrawal|purchase|deducted|charged|used for|txn of)\b/i;
const INCOME_WORDS =
  /\b(?:credited|credit(?!\s*card)|received|deposited|refund(?:ed)?|reversed)\b/i;

const MERCHANT_STOP = String.raw`(?=\s+(?:on|via|ref|refno|ref\s*no|upi|using|avl|avbl|bal|is|was|txn|thru|through|with|from|for|dated|date)\b|\s*[;,(]|\.(?:\s|$)|\s*$)`;
const EXPENSE_MERCHANT = [
  new RegExp(
    String.raw`\b(?:at|to|towards|trf to|paid to|sent to)\s+(?:VPA\s+)?(.{2,40}?)${MERCHANT_STOP}`,
    'i',
  ),
  /;\s*([^;]{2,40}?)\s+credited\b/i,
  /\bInfo[:\s]+(.{2,40}?)(?=\s*[.;]|\s*$)/i,
];
const INCOME_MERCHANT = [
  new RegExp(String.raw`\b(?:from|by)\s+(?:VPA\s+)?(.{2,40}?)${MERCHANT_STOP}`, 'i'),
  /\bInfo[:\s]+(.{2,40}?)(?=\s*[.;]|\s*$)/i,
];
const NOT_A_MERCHANT =
  /^(?:your|you|the|a\/?c|ac|acct|account|card|bank|beneficiary|upi|imps|neft|rtgs)\b/i;

const ACCOUNT_DIGITS =
  /\b(?:a\/c|ac|acct|account|card)\b\s*(?:no\.?\s*)?(?:ending\s*(?:with\s*)?)?[xX*.\s]*(\d{3,6})\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMERIC_DATE = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const NAMED_DATE =
  /\b(\d{1,2})[-\s]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s,]*(\d{2}|\d{4})\b/i;

const CATEGORY_KEYWORDS: readonly (readonly [string, readonly string[]])[] = [
  [
    'eatingOut',
    [
      'swiggy',
      'zomato',
      'eatsure',
      'restaurant',
      'cafe',
      'starbucks',
      'domino',
      'pizza',
      'mcdonald',
      'kfc',
      'burger',
    ],
  ],
  [
    'food',
    [
      'bigbasket',
      'blinkit',
      'zepto',
      'instamart',
      'grofers',
      'dmart',
      'jiomart',
      'grocery',
      'supermarket',
    ],
  ],
  ['transport', ['uber', 'ola', 'rapido', 'irctc', 'metro', 'redbus', 'namma yatri']],
  ['car', ['petrol', 'fuel', 'hpcl', 'bpcl', 'iocl', 'indian oil', 'fastag']],
  ['communications', ['airtel', 'jio', 'vodafone', 'bsnl', 'recharge']],
  [
    'bills',
    ['electricity', 'bescom', 'tata power', 'broadband', 'insurance', 'water bill', 'gas bill'],
  ],
  ['entertainment', ['netflix', 'spotify', 'hotstar', 'prime video', 'bookmyshow', 'pvr', 'inox']],
  ['clothes', ['myntra', 'ajio', 'zara', 'max fashion']],
  ['health', ['pharmacy', 'apollo', 'medplus', '1mg', 'pharmeasy', 'hospital', 'clinic']],
  ['salary', ['salary']],
];

function currencyOf(token: string): string | null {
  return CURRENCY_TOKENS[token.toLowerCase().replace(/\.$/, '')] ?? null;
}

function findAmount(
  text: string,
  defaultCurrency: string,
): { amount: MinorUnits; currency: string } | null {
  const found: { index: number; raw: string; currency: string }[] = [];
  for (const match of text.matchAll(PREFIXED)) {
    const currency = currencyOf(match[1] ?? '');
    if (currency && match[2]) found.push({ index: match.index, raw: match[2], currency });
  }
  for (const match of text.matchAll(SUFFIXED)) {
    const currency = currencyOf(match[2] ?? '');
    if (currency && match[1]) found.push({ index: match.index, raw: match[1], currency });
  }
  found.sort((a, b) => a.index - b.index);
  const candidates = found.filter((f) => !BALANCE_BEFORE.test(text.slice(0, f.index)));
  const bare = BARE.exec(text);
  if (candidates.length === 0 && bare?.[1]) {
    candidates.push({ index: bare.index, raw: bare[1], currency: defaultCurrency });
  }
  for (const candidate of candidates) {
    const amount = parseAmount(candidate.raw, candidate.currency, { allowNegative: false });
    if (amount !== null && amount > 0) return { amount, currency: candidate.currency };
  }
  return null;
}

function findType(text: string): CategoryType | null {
  const expense = EXPENSE_WORDS.exec(text)?.index ?? -1;
  const income = INCOME_WORDS.exec(text)?.index ?? -1;
  if (expense < 0 && income < 0) return null;
  if (expense < 0) return 'income';
  if (income < 0) return 'expense';
  return expense < income ? 'expense' : 'income';
}

function cleanMerchant(raw: string): string | null {
  let name = raw.trim().replace(/\s+/g, ' ');
  if (name.includes('@')) name = name.slice(0, name.indexOf('@'));
  name = name.replace(/^[*:\-\s]+|[*:\-\s]+$/g, '');
  if (name.length < 2 || NOT_A_MERCHANT.test(name) || /^[\dxX*]+$/.test(name)) return null;
  return name.slice(0, MAX_NOTE_LENGTH);
}

function findMerchant(text: string, type: CategoryType): string | null {
  for (const pattern of type === 'expense' ? EXPENSE_MERCHANT : INCOME_MERCHANT) {
    const raw = pattern.exec(text)?.[1];
    const name = raw ? cleanMerchant(raw) : null;
    if (name) return name;
  }
  return null;
}

function validDay(year: number, month: number, day: number): Date | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, month, day);
  return date.getFullYear() === fullYear && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

/** Day-first, as Indian banks write dates: 24-11-26, 24/11/2026, 24-Nov-26, 24Nov26, 2026-11-24. */
function findDay(text: string): Date | null {
  const iso = ISO_DATE.exec(text);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const named = NAMED_DATE.exec(text);
  if (named) {
    const month = MONTHS.indexOf((named[2] ?? '').slice(0, 3).toLowerCase());
    return validDay(Number(named[3]), month, Number(named[1]));
  }
  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) return validDay(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
  return null;
}

function suggestCategory(text: string, type: CategoryType): string | null {
  const lower = text.toLowerCase();
  for (const [key, words] of CATEGORY_KEYWORDS) {
    if ((key === 'salary') !== (type === 'income')) continue;
    if (words.some((word) => new RegExp(String.raw`\b${word}`).test(lower))) return key;
  }
  return null;
}

/**
 * Reads one transaction out of a bank, card or UPI text message. Returns null for messages
 * that are not a completed transaction (OTPs, reminders, requests, declined payments) or that
 * name no amount or direction.
 */
export function parseBankMessage(text: string, defaultCurrency: string): BankMessage | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '' || NOT_A_TRANSACTION.test(clean)) return null;
  const type = findType(clean);
  const amount = findAmount(clean, defaultCurrency);
  if (!type || !amount) return null;
  const merchant = findMerchant(clean, type);
  return {
    type,
    amount: amount.amount,
    currency: amount.currency,
    merchant,
    day: findDay(clean),
    accountDigits: ACCOUNT_DIGITS.exec(clean)?.[1] ?? null,
    categoryKey: suggestCategory(`${merchant ?? ''} ${clean}`, type),
  };
}

export interface BankMessageDraft {
  type: CategoryType;
  amount: MinorUnits;
  accountId: string | null;
  categoryId: string | null;
  /** ISO timestamp: now for today's messages, otherwise noon on the message's day. */
  date: string;
  note: string;
  /** The message's currency has no active account, so the amount lands in another currency. */
  currencyMismatch: boolean;
}

/** Picks the account, category and time for the transaction editor. */
export function bankMessageDraft(
  message: BankMessage,
  options: {
    accounts: readonly Account[];
    categories: readonly Category[];
    seedCategoryId: (key: string) => string;
    now: Date;
  },
): BankMessageDraft {
  const active = options.accounts.filter((a) => !a.isArchived);
  const sameCurrency = active.filter((a) => a.currency === message.currency);
  const digits = message.accountDigits;
  const account =
    (digits ? sameCurrency.find((a) => a.name.includes(digits)) : undefined) ??
    sameCurrency[0] ??
    active[0] ??
    null;

  const seedId = message.categoryKey ? options.seedCategoryId(message.categoryKey) : null;
  const category = options.categories.find(
    (c) => c.id === seedId && c.type === message.type && !c.isArchived,
  );

  const { now } = options;
  const day = message.day;
  const isToday = day !== null && day.toDateString() === now.toDateString();
  const date =
    day === null || isToday || day > now
      ? now
      : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);

  return {
    type: message.type,
    amount: message.amount,
    accountId: account?.id ?? null,
    categoryId: category?.id ?? null,
    date: date.toISOString(),
    note: message.merchant ?? '',
    currencyMismatch: account !== null && account.currency !== message.currency,
  };
}
