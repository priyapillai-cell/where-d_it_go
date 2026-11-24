import { format } from 'date-fns';

import { neutralizeFormula, serializeCsv } from './csv';
import { toMajorString } from './money';
import type {
  Account,
  Category,
  FundEntry,
  FundEntryType,
  SinkingFund,
  Transaction,
} from './types';

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

/** `type` values for sinking fund entries; the category column holds the fund category. */
export const FUND_CSV_TYPES: Readonly<Record<FundEntryType, string>> = {
  deposit: 'fund_add',
  spend: 'fund_spend',
};

export interface CsvFundData {
  funds: readonly SinkingFund[];
  entries: readonly FundEntry[];
}

/** Tells Excel the file is UTF-8, so ₹, € and non-Latin names are not garbled. */
const UTF8_BOM = '\uFEFF';

export function transactionsToCsv(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
  fundData: CsvFundData = { funds: [], entries: [] },
): string {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const fundById = new Map(fundData.funds.map((f) => [f.id, f]));
  const dated: { date: string; row: string[] }[] = [];
  for (const tx of transactions) {
    const account = accountById.get(tx.accountId);
    const currency = account?.currency ?? '';
    const toAccount = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
    dated.push({
      date: tx.date,
      row: [
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
      ],
    });
  }
  for (const entry of fundData.entries) {
    const fund = fundById.get(entry.fundId);
    if (!fund) continue;
    const account = entry.accountId ? accountById.get(entry.accountId) : undefined;
    dated.push({
      date: entry.date,
      row: [
        csvDateTime(entry.date),
        FUND_CSV_TYPES[entry.type],
        toMajorString(entry.amount, fund.currency),
        fund.currency,
        neutralizeFormula(account?.name ?? ''),
        neutralizeFormula(fund.name),
        neutralizeFormula(entry.note),
        '',
        '',
        '',
      ],
    });
  }
  // A stable sort keeps same-time rows in their source order.
  dated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return UTF8_BOM + serializeCsv([[...EXPORT_HEADER], ...dated.map((d) => d.row)]);
}
