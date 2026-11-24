import { makeTransaction } from '@/test/factories';

import {
  aggregateByCategory,
  balanceSeries,
  comparePeriods,
  groupByDay,
  incomeExpenseSeries,
  sumByType,
  suggestGranularity,
} from '../aggregation';

const opts = { firstDayOfWeek: 1 as const, firstDayOfMonth: 1 };

const txs = [
  makeTransaction({
    type: 'expense',
    amount: 3000,
    categoryId: 'food',
    date: '2026-03-01T10:00:00.000Z',
  }),
  makeTransaction({
    type: 'expense',
    amount: 1000,
    categoryId: 'food',
    date: '2026-03-02T10:00:00.000Z',
  }),
  makeTransaction({
    type: 'expense',
    amount: 6000,
    categoryId: 'rent',
    date: '2026-03-02T11:00:00.000Z',
  }),
  makeTransaction({
    type: 'income',
    amount: 50000,
    categoryId: 'salary',
    date: '2026-03-05T10:00:00.000Z',
  }),
  makeTransaction({
    type: 'transfer',
    amount: 2000,
    toAmount: 2000,
    accountId: 'acc',
    toAccountId: 'savings',
    date: '2026-03-05T12:00:00.000Z',
  }),
];

describe('aggregateByCategory', () => {
  it('sums per category with shares, largest first, excluding transfers', () => {
    expect(aggregateByCategory(txs, 'expense')).toEqual([
      { categoryId: 'rent', total: 6000, count: 1, share: 0.6 },
      { categoryId: 'food', total: 4000, count: 2, share: 0.4 },
    ]);
    expect(aggregateByCategory(txs, 'income')).toEqual([
      { categoryId: 'salary', total: 50000, count: 1, share: 1 },
    ]);
  });

  it('handles empty input', () => {
    expect(aggregateByCategory([], 'expense')).toEqual([]);
  });
});

it('sums by type', () => {
  expect(sumByType(txs)).toEqual({ income: 50000, expense: 10000 });
});

describe('incomeExpenseSeries', () => {
  it('buckets by day including empty days', () => {
    const series = incomeExpenseSeries(
      txs,
      new Date(2026, 2, 1),
      new Date(2026, 2, 6),
      'day',
      opts,
    );
    expect(series.map((b) => [b.start.getDate(), b.income, b.expense])).toEqual([
      [1, 0, 3000],
      [2, 0, 7000],
      [3, 0, 0],
      [4, 0, 0],
      [5, 50000, 0],
    ]);
  });

  it('buckets by week and month', () => {
    const weeks = incomeExpenseSeries(
      txs,
      new Date(2026, 2, 1),
      new Date(2026, 3, 1),
      'week',
      opts,
    );
    expect(weeks[0]?.start.toISOString()).toBe('2026-02-23T00:00:00.000Z');
    expect(weeks[0]?.expense).toBe(3000);
    expect(weeks[1]?.expense).toBe(7000);
    expect(weeks[1]?.income).toBe(50000);
    const months = incomeExpenseSeries(
      txs,
      new Date(2026, 0, 1),
      new Date(2026, 3, 1),
      'month',
      opts,
    );
    expect(months.map((m) => m.expense)).toEqual([0, 0, 10000]);
  });
});

it('computes a running balance for selected accounts', () => {
  const series = balanceSeries(
    100000,
    txs,
    new Set(['acc']),
    new Date(2026, 2, 1),
    new Date(2026, 2, 6),
    'day',
    opts,
  );
  expect(series.map((p) => p.balance)).toEqual([97000, 90000, 90000, 90000, 138000]);
});

it('groups by local day with daily totals, preserving order', () => {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const groups = groupByDay(sorted);
  expect(groups.map((g) => [g.key, g.items.length, g.income, g.expense])).toEqual([
    ['2026-03-05', 2, 50000, 0],
    ['2026-03-02', 2, 0, 7000],
    ['2026-03-01', 1, 0, 3000],
  ]);
});

it('compares periods with per-category deltas', () => {
  const previous = [
    makeTransaction({ type: 'expense', amount: 2000, categoryId: 'food' }),
    makeTransaction({ type: 'expense', amount: 500, categoryId: 'fun' }),
  ];
  const result = comparePeriods(txs, previous);
  expect(result.current.expense).toBe(10000);
  expect(result.previous.expense).toBe(2500);
  expect(result.expenseChange).toBeCloseTo(3);
  expect(result.incomeChange).toBeNull();
  expect(result.categories[0]).toEqual({
    categoryId: 'rent',
    current: 6000,
    previous: 0,
    delta: 6000,
    change: null,
  });
  expect(result.categories.find((c) => c.categoryId === 'food')?.change).toBe(1);
});

it('suggests granularity by span', () => {
  expect(suggestGranularity(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe('day');
  expect(suggestGranularity(new Date(2026, 0, 1), new Date(2026, 3, 1))).toBe('week');
  expect(suggestGranularity(new Date(2026, 0, 1), new Date(2027, 0, 1))).toBe('month');
});
