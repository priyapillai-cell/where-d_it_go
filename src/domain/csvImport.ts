import { parseAmount } from './money';
import type { Account, Category, CategoryType, MinorUnits, TransactionType } from './types';

export const IMPORT_FIELDS = [
  'date',
  'amount',
  'type',
  'category',
  'account',
  'note',
  'toAccount',
  'toAmount',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['date', 'amount'];

/** Maps each target field to a zero-based source column index. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'ymd';
export const DATE_FORMATS: readonly DateFormat[] = ['iso', 'dmy', 'mdy', 'ymd'];

export interface ImportOptions {
  hasHeader: boolean;
  dateFormat: DateFormat;
  decimalSeparator: '.' | ',';
  /** Used when the account column is unmapped, empty, or names an unknown account. */
  defaultAccountId: string;
}

export interface ImportContext {
  accounts: readonly Account[];
  categories: readonly Category[];
}

export interface ImportCandidate {
  rowNumber: number;
  type: TransactionType;
  amount: MinorUnits;
  toAmount: MinorUnits | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  /** Set when the category name is unknown and should be created during import. */
  newCategory: { name: string; type: CategoryType } | null;
  note: string;
  date: string;
}

export type ImportErrorCode =
  | 'missingDate'
  | 'invalidDate'
  | 'missingAmount'
  | 'invalidAmount'
  | 'invalidType'
  | 'noAccount'
  | 'unknownToAccount'
  | 'sameAccount';

export interface ImportRowError {
  rowNumber: number;
  code: ImportErrorCode;
  value: string;
}

export interface ImportValidation {
  candidates: ImportCandidate[];
  errors: ImportRowError[];
  totalRows: number;
}

export const MAX_IMPORT_ROWS = 50_000;
const MAX_NOTE_LENGTH = 500;
const MAX_NAME_LENGTH = 60;

const FIELD_SYNONYMS: Readonly<Record<ImportField, readonly string[]>> = {
  date: ['date', 'datetime', 'time', 'transaction date', 'booking date', 'posted'],
  amount: ['amount', 'sum', 'value', 'total', 'price'],
  type: ['type', 'kind', 'direction', 'transaction type'],
  category: ['category', 'categories', 'group'],
  account: ['account', 'wallet', 'from account', 'source'],
  note: ['note', 'notes', 'description', 'memo', 'comment', 'details', 'payee'],
  toAccount: ['to_account', 'to account', 'destination', 'target account'],
  toAmount: ['to_amount', 'to amount', 'received amount'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

/** Suggests a mapping from header names; each column is used at most once. */
export function guessMapping(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalized = header.map(normalizeHeader);
  for (const field of IMPORT_FIELDS) {
    const synonyms = FIELD_SYNONYMS[field].map(normalizeHeader);
    const index = normalized.findIndex((h, i) => !used.has(i) && synonyms.includes(h));
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }
  return mapping;
}

export function missingRequiredFields(mapping: ColumnMapping): ImportField[] {
  return REQUIRED_IMPORT_FIELDS.filter((f) => mapping[f] === undefined);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDate(y: number, m: number, d: number, hh = 12, mm = 0, ss = 0): Date | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return new Date(y, m - 1, d, hh, mm, ss);
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const PARTS_RE = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parses a date cell. Date-only values are placed at local noon so they never shift to an
 * adjacent day when rendered in another timezone.
 */
export function parseDateCell(raw: string, format: DateFormat): Date | null {
  const value = raw.trim();
  if (value === '') return null;
  if (ISO_DATETIME_RE.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = PARTS_RE.exec(value);
  if (!match) return null;
  const [, a = '', b = '', c = '', h, min, s] = match;
  const n1 = Number(a);
  const n2 = Number(b);
  const n3 = Number(c);
  const hh = h !== undefined ? Number(h) : 12;
  const mm = h !== undefined ? Number(min) : 0;
  const ss = h !== undefined ? Number(s ?? 0) : 0;
  const yearFirst = a.length === 4;
  const expandYear = (y: number, digits: number) => (digits <= 2 ? 2000 + y : y);
  if (format === 'iso' || format === 'ymd' || yearFirst) {
    if (!yearFirst) return null;
    return buildDate(n1, n2, n3, hh, mm, ss);
  }
  if (format === 'dmy') return buildDate(expandYear(n3, c.length), n2, n1, hh, mm, ss);
  return buildDate(expandYear(n3, c.length), n1, n2, hh, mm, ss);
}

function parseType(raw: string): TransactionType | 'invalid' | null {
  const value = raw.trim().toLowerCase();
  if (value === '') return null;
  if (['expense', 'expenses', 'e', 'debit', 'out', 'spending', '-'].includes(value))
    return 'expense';
  if (['income', 'i', 'credit', 'in', 'earning', '+'].includes(value)) return 'income';
  if (['transfer', 't', 'move'].includes(value)) return 'transfer';
  return 'invalid';
}

/** Reverses the export-time formula guard (leading apostrophe before = + - @). */
function cleanText(raw: string, max: number): string {
  const value = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  const unguarded = /^'[=+\-@]/.test(value) ? value.slice(1) : value;
  return unguarded.slice(0, max);
}

function findByName<T extends { name: string }>(items: readonly T[], name: string): T | undefined {
  const needle = name.trim().toLocaleLowerCase();
  return items.find((i) => i.name.trim().toLocaleLowerCase() === needle);
}

/**
 * Validates every data row against the mapping. Never throws: malformed rows are reported
 * as errors and skipped, valid rows become insert-ready candidates.
 */
export function validateImport(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  options: ImportOptions,
  context: ImportContext,
): ImportValidation {
  const dataRows = (options.hasHeader ? rows.slice(1) : rows).slice(0, MAX_IMPORT_ROWS);
  const candidates: ImportCandidate[] = [];
  const errors: ImportRowError[] = [];
  const defaultAccount =
    context.accounts.find((a) => a.id === options.defaultAccountId) ?? context.accounts[0];
  const pendingCategories = new Map<string, { name: string; type: CategoryType }>();
  const cell = (row: readonly string[], field: ImportField): string => {
    const index = mapping[field];
    return index === undefined ? '' : (row[index] ?? '');
  };

  dataRows.forEach((row, i) => {
    const rowNumber = i + 1 + (options.hasHeader ? 1 : 0);
    const fail = (code: ImportErrorCode, value: string): void => {
      errors.push({ rowNumber, code, value });
    };

    const rawDate = cell(row, 'date');
    if (rawDate.trim() === '') return fail('missingDate', rawDate);
    const date = parseDateCell(rawDate, options.dateFormat);
    if (!date) return fail('invalidDate', rawDate);

    const accountName = cell(row, 'account');
    const account =
      (accountName.trim() !== '' && findByName(context.accounts, accountName)) || defaultAccount;
    if (!account) return fail('noAccount', accountName);

    const rawAmount = cell(row, 'amount');
    if (rawAmount.trim() === '') return fail('missingAmount', rawAmount);
    const signed = parseAmount(rawAmount, account.currency, {
      decimalSeparator: options.decimalSeparator,
    });
    if (signed === null || signed === 0) return fail('invalidAmount', rawAmount);

    const rawType = cell(row, 'type');
    const parsedType = parseType(rawType);
    if (parsedType === 'invalid') return fail('invalidType', rawType);
    const type: TransactionType = parsedType ?? (signed < 0 ? 'expense' : 'income');
    const amount = Math.abs(signed);

    let toAccountId: string | null = null;
    let toAmount: MinorUnits | null = null;
    let categoryId: string | null = null;
    let newCategory: ImportCandidate['newCategory'] = null;

    if (type === 'transfer') {
      const toName = cell(row, 'toAccount');
      const toAccount = toName.trim() !== '' ? findByName(context.accounts, toName) : undefined;
      if (!toAccount) return fail('unknownToAccount', toName);
      if (toAccount.id === account.id) return fail('sameAccount', toName);
      toAccountId = toAccount.id;
      const rawTo = cell(row, 'toAmount');
      const parsedTo =
        rawTo.trim() === ''
          ? toAccount.currency === account.currency
            ? amount
            : null
          : parseAmount(rawTo, toAccount.currency, { decimalSeparator: options.decimalSeparator });
      if (parsedTo === null || parsedTo === 0) return fail('invalidAmount', rawTo);
      toAmount = Math.abs(parsedTo);
    } else {
      const categoryName = cleanText(cell(row, 'category'), MAX_NAME_LENGTH);
      if (categoryName !== '') {
        const existing = findByName(
          context.categories.filter((c) => c.type === type),
          categoryName,
        );
        if (existing) {
          categoryId = existing.id;
        } else {
          const key = `${type}:${categoryName.toLocaleLowerCase()}`;
          const pending = pendingCategories.get(key) ?? { name: categoryName, type };
          pendingCategories.set(key, pending);
          newCategory = pending;
        }
      }
    }

    candidates.push({
      rowNumber,
      type,
      amount,
      toAmount,
      accountId: account.id,
      toAccountId,
      categoryId,
      newCategory,
      note: cleanText(cell(row, 'note'), MAX_NOTE_LENGTH),
      date: date.toISOString(),
    });
  });

  return { candidates, errors, totalRows: dataRows.length };
}
