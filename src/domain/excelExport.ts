import { computeBalances, flowsFromTransactions } from './balance';
import { currencyFractionDigits } from './money';
import { summarizeFund } from './sinkingFunds';
import type {
  Account,
  Category,
  FundEntry,
  FundEntryType,
  MinorUnits,
  SinkingFund,
  Transaction,
  TransactionType,
} from './types';
import type { XlsxCell, XlsxDecimals, XlsxSheet } from './xlsx';

export interface ExcelExportLabels {
  sheets: {
    transactions: string;
    monthly: string;
    categories: string;
    accounts: string;
    funds: string;
    fundHistory: string;
  };
  columns: {
    date: string;
    type: string;
    category: string;
    amount: string;
    currency: string;
    account: string;
    note: string;
    toAccount: string;
    toAmount: string;
    toCurrency: string;
    month: string;
    income: string;
    expenses: string;
    net: string;
    count: string;
    total: string;
    openingBalance: string;
    balance: string;
    archived: string;
    fund: string;
    target: string;
    targetDate: string;
    deposited: string;
    spent: string;
  };
  types: Record<TransactionType, string>;
  fundEntryTypes: Record<FundEntryType, string>;
  yes: string;
  no: string;
  uncategorized: string;
}

export interface ExcelExportData {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categories: readonly Category[];
  sinkingFunds?: readonly SinkingFund[];
  fundEntries?: readonly FundEntry[];
}

function decimalsFor(currency: string): XlsxDecimals {
  const digits = currencyFractionDigits(currency);
  return digits <= 0 ? 0 : digits >= 4 ? 4 : (digits as XlsxDecimals);
}

/** Minor units → major units as a JS number; exact for any realistic personal-finance amount. */
function major(amount: MinorUnits, currency: string): number {
  return amount / 10 ** currencyFractionDigits(currency);
}

function moneyCell(amount: MinorUnits, currency: string): XlsxCell {
  return {
    value: major(amount, currency),
    style: { kind: 'number', decimals: decimalsFor(currency) },
  };
}

const text = (value: string): XlsxCell => ({ value });
const header = (labels: readonly string[]): XlsxCell[] =>
  labels.map((value) => ({ value, style: { kind: 'header' } }));

function monthKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function byDateAscending(a: Transaction, b: Transaction): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt.localeCompare(b.createdAt);
}

/**
 * Builds the sheets of the Excel export. Amounts are signed from the source account's point
 * of view (expenses and outgoing transfers negative) so a column SUM gives the net change.
 * Totals are grouped per currency and never mixed.
 */
export function buildExcelSheets(
  data: ExcelExportData,
  labels: ExcelExportLabels,
  now: Date = new Date(),
): XlsxSheet[] {
  const accountById = new Map(data.accounts.map((a) => [a.id, a]));
  const categoryById = new Map(data.categories.map((c) => [c.id, c]));
  const sorted = [...data.transactions].sort(byDateAscending);
  const col = labels.columns;

  const transactionRows: XlsxCell[][] = [
    header([
      col.date,
      col.type,
      col.category,
      col.amount,
      col.currency,
      col.account,
      col.note,
      col.toAccount,
      col.toAmount,
      col.toCurrency,
    ]),
  ];

  const monthly = new Map<
    string,
    { month: string; currency: string; income: number; expense: number }
  >();
  const byCategory = new Map<
    string,
    { name: string; type: TransactionType; currency: string; count: number; total: number }
  >();

  for (const tx of sorted) {
    const account = accountById.get(tx.accountId);
    const currency = account?.currency ?? '';
    const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
    const toAccount = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    const date = new Date(tx.date);
    const signed = tx.type === 'income' ? tx.amount : -tx.amount;
    const isTransfer = tx.type === 'transfer';

    transactionRows.push([
      { value: Number.isNaN(date.getTime()) ? tx.date : date, style: { kind: 'dateTime' } },
      text(labels.types[tx.type]),
      text(isTransfer ? '' : (category?.name ?? labels.uncategorized)),
      currency ? moneyCell(signed, currency) : { value: signed },
      text(currency),
      text(account?.name ?? ''),
      text(tx.note),
      text(toAccount?.name ?? ''),
      isTransfer && toAccount ? moneyCell(tx.toAmount ?? tx.amount, toAccount.currency) : text(''),
      text(isTransfer && toAccount ? toAccount.currency : ''),
    ]);

    if (isTransfer || !currency) continue;
    const month = monthKey(tx.date);
    if (month) {
      const key = `${month}|${currency}`;
      const entry = monthly.get(key) ?? { month, currency, income: 0, expense: 0 };
      if (tx.type === 'income') entry.income += tx.amount;
      else entry.expense += tx.amount;
      monthly.set(key, entry);
    }
    const name = category?.name ?? labels.uncategorized;
    const categoryKey = `${tx.categoryId ?? ''}|${tx.type}|${currency}`;
    const totals = byCategory.get(categoryKey) ?? {
      name,
      type: tx.type,
      currency,
      count: 0,
      total: 0,
    };
    totals.count += 1;
    totals.total += tx.amount;
    byCategory.set(categoryKey, totals);
  }

  const monthlyRows: XlsxCell[][] = [
    header([col.month, col.currency, col.income, col.expenses, col.net]),
    ...[...monthly.values()]
      .sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
      .map((m) => [
        text(m.month),
        text(m.currency),
        moneyCell(m.income, m.currency),
        moneyCell(m.expense, m.currency),
        moneyCell(m.income - m.expense, m.currency),
      ]),
  ];

  const categoryRows: XlsxCell[][] = [
    header([col.category, col.type, col.currency, col.count, col.total]),
    ...[...byCategory.values()]
      .sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.currency.localeCompare(b.currency) || b.total - a.total,
      )
      .map((c) => [
        text(c.name),
        text(labels.types[c.type]),
        text(c.currency),
        { value: c.count },
        moneyCell(c.total, c.currency),
      ]),
  ];

  const balances = computeBalances(data.accounts, flowsFromTransactions(data.transactions));
  const accountRows: XlsxCell[][] = [
    header([col.account, col.currency, col.openingBalance, col.balance, col.archived]),
    ...[...data.accounts]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => [
        text(a.name),
        text(a.currency),
        moneyCell(a.initialBalance, a.currency),
        moneyCell(balances.get(a.id) ?? a.initialBalance, a.currency),
        text(a.isArchived ? labels.yes : labels.no),
      ]),
  ];

  const sheets: XlsxSheet[] = [
    {
      name: labels.sheets.transactions,
      headerRow: true,
      columnWidths: [18, 12, 20, 14, 10, 18, 32, 18, 14, 12],
      rows: transactionRows,
    },
    {
      name: labels.sheets.monthly,
      headerRow: true,
      columnWidths: [12, 10, 14, 14, 14],
      rows: monthlyRows,
    },
    {
      name: labels.sheets.categories,
      headerRow: true,
      columnWidths: [22, 12, 10, 14, 14],
      rows: categoryRows,
    },
    {
      name: labels.sheets.accounts,
      headerRow: true,
      columnWidths: [22, 10, 16, 16, 10],
      rows: accountRows,
    },
  ];
  const funds = data.sinkingFunds ?? [];
  if (funds.length > 0) {
    const { summary, history } = fundSheets(funds, data.fundEntries ?? [], labels, now);
    sheets.splice(1, 0, history);
    sheets.push(summary);
  }
  return sheets;
}

function fundSheets(
  funds: readonly SinkingFund[],
  entries: readonly FundEntry[],
  labels: ExcelExportLabels,
  now: Date,
): { summary: XlsxSheet; history: XlsxSheet } {
  const col = labels.columns;
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const byFund = new Map<string, FundEntry[]>();
  for (const entry of entries) {
    const list = byFund.get(entry.fundId) ?? [];
    list.push(entry);
    byFund.set(entry.fundId, list);
  }

  const summaryRows: XlsxCell[][] = [
    header([
      col.fund,
      col.currency,
      col.target,
      col.targetDate,
      col.deposited,
      col.spent,
      col.balance,
      col.archived,
    ]),
    ...[...funds]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((fund) => {
        const summary = summarizeFund(fund, byFund.get(fund.id) ?? [], now);
        return [
          text(fund.name),
          text(fund.currency),
          fund.targetAmount !== null ? moneyCell(fund.targetAmount, fund.currency) : text(''),
          text(fund.targetDate ?? ''),
          moneyCell(summary.deposited, fund.currency),
          moneyCell(summary.spent, fund.currency),
          moneyCell(summary.balance, fund.currency),
          text(fund.isArchived ? labels.yes : labels.no),
        ];
      }),
  ];

  const historyRows: XlsxCell[][] = [
    header([col.date, col.fund, col.type, col.amount, col.currency, col.note]),
    ...[...entries]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .flatMap((entry) => {
        const fund = fundById.get(entry.fundId);
        if (!fund) return [];
        const date = new Date(entry.date);
        return [
          [
            {
              value: Number.isNaN(date.getTime()) ? entry.date : date,
              style: { kind: 'dateTime' as const },
            },
            text(fund.name),
            text(labels.fundEntryTypes[entry.type]),
            moneyCell(entry.type === 'deposit' ? entry.amount : -entry.amount, fund.currency),
            text(fund.currency),
            text(entry.note),
          ],
        ];
      }),
  ];

  return {
    summary: {
      name: labels.sheets.funds,
      headerRow: true,
      columnWidths: [22, 10, 14, 12, 14, 14, 14, 10],
      rows: summaryRows,
    },
    history: {
      name: labels.sheets.fundHistory,
      headerRow: true,
      columnWidths: [18, 22, 12, 14, 10, 32],
      rows: historyRows,
    },
  };
}
