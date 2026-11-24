import { format } from 'date-fns';

import { neutralizeFormula, serializeCsv } from './csv';
import { toMajorString } from './money';
import type { Account, Category, Transaction } from './types';

/** Stable, machine-oriented header (not localised) so exports re-import cleanly. */
export const EXPORT_HEADER = [
  'date',
  'type',
  'amount',
  'currency',
  'account',
  'category',
  'note',
  'to_account',
  'to_amount',
  'to_currency',
] as const;

/**
 * Local wall-clock time, which Excel and Sheets read as a date and the importer reads back
 * exactly; UTC timestamps would show entries made after local midnight on the previous day.
 */
export function csvDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : format(date, 'yyyy-MM-dd HH:mm:ss');
}

/** Tells Excel the file is UTF-8, so ₹, € and non-Latin names are not garbled. */
const UTF8_BOM = '\uFEFF';

export function transactionsToCsv(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
): string {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const rows: string[][] = [[...EXPORT_HEADER]];
  for (const tx of transactions) {
    const account = accountById.get(tx.accountId);
    const currency = account?.currency ?? '';
    const toAccount = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
    rows.push([
      csvDateTime(tx.date),
      tx.type,
      currency ? toMajorString(tx.amount, currency) : String(tx.amount),
      currency,
      neutralizeFormula(account?.name ?? ''),
      neutralizeFormula(category?.name ?? ''),
      neutralizeFormula(tx.note),
      neutralizeFormula(toAccount?.name ?? ''),
      tx.type === 'transfer' && toAccount
        ? toMajorString(tx.toAmount ?? tx.amount, toAccount.currency)
        : '',
      tx.type === 'transfer' && toAccount ? toAccount.currency : '',
    ]);
  }
  return UTF8_BOM + serializeCsv(rows);
}
