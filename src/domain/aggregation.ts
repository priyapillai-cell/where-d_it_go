import { addDays, addMonths, addWeeks, startOfDay, startOfWeek } from 'date-fns';

import { netChangeForAccounts } from './balance';
import { dayKey, type PeriodOptions, startOfCustomMonth } from './periods';
import type { CategoryType, MinorUnits, Transaction } from './types';

type AggregatableTransaction = Pick<
  Transaction,
  'type' | 'amount' | 'toAmount' | 'accountId' | 'toAccountId' | 'categoryId' | 'date'
>;

export interface CategoryTotal {
  categoryId: string | null;
  total: MinorUnits;
  count: number;
  /** Fraction of the grand total in [0, 1]. */
  share: number;
}

/** Totals per category for one side (expense or income); transfers are excluded. */
export function aggregateByCategory(
  transactions: readonly AggregatableTransaction[],
  type: CategoryType,
): CategoryTotal[] {
  const totals = new Map<string | null, { total: number; count: number }>();
  let grand = 0;
  for (const tx of transactions) {
    if (tx.type !== type) continue;
    const entry = totals.get(tx.categoryId) ?? { total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count += 1;
    totals.set(tx.categoryId, entry);
    grand += tx.amount;
  }
  return [...totals.entries()]
    .map(([categoryId, { total, count }]) => ({
      categoryId,
      total,
      count,
      share: grand === 0 ? 0 : total / grand,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface TypeTotals {
  income: MinorUnits;
  expense: MinorUnits;
}

export function sumByType(
  transactions: readonly Pick<Transaction, 'type' | 'amount'>[],
): TypeTotals {
  const totals: TypeTotals = { income: 0, expense: 0 };
  for (const tx of transactions) {
    if (tx.type === 'income') totals.income += tx.amount;
    else if (tx.type === 'expense') totals.expense += tx.amount;
  }
  return totals;
}

export type Granularity = 'day' | 'week' | 'month';
export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month'];
const MAX_BUCKETS = 1000;

export function bucketStart(date: Date, granularity: Granularity, options: PeriodOptions): Date {
  switch (granularity) {
    case 'day':
      return startOfDay(date);
    case 'week':
      return startOfWeek(date, { weekStartsOn: options.firstDayOfWeek });
    case 'month':
      return startOfCustomMonth(date, options.firstDayOfMonth);
    default: {
      const unreachable: never = granularity;
      throw new Error(`Unknown granularity ${String(unreachable)}`);
    }
  }
}

function nextBucket(date: Date, granularity: Granularity): Date {
  switch (granularity) {
    case 'day':
      return addDays(date, 1);
    case 'week':
      return addWeeks(date, 1);
    case 'month':
      return addMonths(date, 1);
    default: {
      const unreachable: never = granularity;
      throw new Error(`Unknown granularity ${String(unreachable)}`);
    }
  }
}

/** Ordered bucket start dates covering [start, end). Capped to keep charts responsive. */
export function bucketStarts(
  start: Date,
  end: Date,
  granularity: Granularity,
  options: PeriodOptions,
): Date[] {
  const starts: Date[] = [];
  let cursor = bucketStart(start, granularity, options);
  while (cursor < end && starts.length < MAX_BUCKETS) {
    starts.push(cursor);
    cursor = nextBucket(cursor, granularity);
  }
  return starts;
}

export interface IncomeExpenseBucket {
  start: Date;
  income: MinorUnits;
  expense: MinorUnits;
}

/** Income and expense per time bucket, including empty buckets so charts have a stable x-axis. */
export function incomeExpenseSeries(
  transactions: readonly AggregatableTransaction[],
  start: Date,
  end: Date,
  granularity: Granularity,
  options: PeriodOptions,
): IncomeExpenseBucket[] {
  const buckets = bucketStarts(start, end, granularity, options).map((s) => ({
    start: s,
    income: 0,
    expense: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.start.getTime(), i]));
  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime()) || date < start || date >= end) continue;
    const i = index.get(bucketStart(date, granularity, options).getTime());
    if (i === undefined) continue;
    const bucket = buckets[i];
    if (!bucket) continue;
    if (tx.type === 'income') bucket.income += tx.amount;
    else bucket.expense += tx.amount;
  }
  return buckets;
}

export interface BalancePoint {
  date: Date;
  balance: MinorUnits;
}

/**
 * Running balance at the end of each bucket for a set of accounts.
 * `openingBalance` is the combined balance at `start` (initial balances + earlier activity).
 */
export function balanceSeries(
  openingBalance: MinorUnits,
  transactions: readonly AggregatableTransaction[],
  accountIds: ReadonlySet<string>,
  start: Date,
  end: Date,
  granularity: Granularity,
  options: PeriodOptions,
): BalancePoint[] {
  const starts = bucketStarts(start, end, granularity, options);
  const deltas = new Array<number>(starts.length).fill(0);
  const index = new Map(starts.map((s, i) => [s.getTime(), i]));
  for (const tx of transactions) {
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime()) || date < start || date >= end) continue;
    const i = index.get(bucketStart(date, granularity, options).getTime());
    if (i === undefined) continue;
    deltas[i] = (deltas[i] ?? 0) + netChangeForAccounts(tx, accountIds);
  }
  let running = openingBalance;
  return starts.map((s, i) => {
    running += deltas[i] ?? 0;
    return { date: s, balance: running };
  });
}

export interface DayGroup<T> {
  key: string;
  date: Date;
  income: MinorUnits;
  expense: MinorUnits;
  items: T[];
}

/** Groups transactions (already sorted newest first) by local calendar day. */
export function groupByDay<T extends Pick<Transaction, 'type' | 'amount' | 'date'>>(
  transactions: readonly T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();
  for (const tx of transactions) {
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    let group = byKey.get(key);
    if (!group) {
      group = { key, date: startOfDay(date), income: 0, expense: 0, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(tx);
    if (tx.type === 'income') group.income += tx.amount;
    else if (tx.type === 'expense') group.expense += tx.amount;
  }
  return groups;
}

export interface CategoryComparison {
  categoryId: string | null;
  current: MinorUnits;
  previous: MinorUnits;
  delta: MinorUnits;
  /** Relative change; null when the previous period had no spending in this category. */
  change: number | null;
}

export interface PeriodComparison {
  current: TypeTotals;
  previous: TypeTotals;
  expenseChange: number | null;
  incomeChange: number | null;
  categories: CategoryComparison[];
}

function relativeChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

export function comparePeriods(
  currentTransactions: readonly AggregatableTransaction[],
  previousTransactions: readonly AggregatableTransaction[],
): PeriodComparison {
  const current = sumByType(currentTransactions);
  const previous = sumByType(previousTransactions);
  const cur = new Map(
    aggregateByCategory(currentTransactions, 'expense').map((c) => [c.categoryId, c.total]),
  );
  const prev = new Map(
    aggregateByCategory(previousTransactions, 'expense').map((c) => [c.categoryId, c.total]),
  );
  const ids = new Set([...cur.keys(), ...prev.keys()]);
  const categories = [...ids]
    .map((categoryId) => {
      const c = cur.get(categoryId) ?? 0;
      const p = prev.get(categoryId) ?? 0;
      return { categoryId, current: c, previous: p, delta: c - p, change: relativeChange(c, p) };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    current,
    previous,
    expenseChange: relativeChange(current.expense, previous.expense),
    incomeChange: relativeChange(current.income, previous.income),
    categories,
  };
}

/** Picks a readable granularity for a span so charts stay within a sensible bar count. */
export function suggestGranularity(start: Date, end: Date): Granularity {
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}
