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
      tx.date,
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
  return serializeCsv(rows);
}
