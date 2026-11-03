import { insertAccount } from '@/db/repositories/accountRepository';
import { insertTransaction } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { balanceSeries } from '@/domain/aggregation';
import { DEFAULT_PERIOD_OPTIONS, periodContaining } from '@/domain/periods';
import { makeAccount, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { loadReport } from '../reportService';

let db: SqlDatabase;
const now = new Date('2026-03-20T12:00:00.000Z');

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, makeAccount({ id: 'a', initialBalance: 10000 }));
  await insertAccount(db, makeAccount({ id: 'b', initialBalance: 500 }));
  await insertAccount(db, makeAccount({ id: 'other', initialBalance: 99999 }));
  await insertTransaction(
    db,
    makeTransaction({
      accountId: 'a',
      type: 'expense',
      amount: 2000,
      date: '2026-02-10T10:00:00.000Z',
    }),
  );
  await insertTransaction(
    db,
    makeTransaction({
      accountId: 'a',
      type: 'transfer',
      amount: 1000,
      toAccountId: 'other',
      toAmount: 1000,
      date: '2026-02-11T10:00:00.000Z',
    }),
  );
  await insertTransaction(
    db,
    makeTransaction({
      accountId: 'b',
      type: 'income',
      amount: 3000,
      date: '2026-03-05T10:00:00.000Z',
    }),
  );
});

afterEach(async () => {
  await db.close();
});

it('computes the opening balance from initial balances and earlier activity', async () => {
  const march = periodContaining('month', now, DEFAULT_PERIOD_OPTIONS);
  const report = await loadReport(db, march, ['a', 'b'], DEFAULT_PERIOD_OPTIONS, now);
  expect(report.openingBalance).toBe(10000 - 2000 - 1000 + 500);
  expect(report.transactions).toHaveLength(1);
  expect(report.thisMonth).toHaveLength(1);
  expect(report.lastMonth).toHaveLength(2);

  const series = balanceSeries(
    report.openingBalance,
    report.transactions,
    new Set(['a', 'b']),
    report.start,
    report.end,
    'month',
    DEFAULT_PERIOD_OPTIONS,
  );
  expect(series.at(-1)?.balance).toBe(10500);
});

it('starts an all-time report at the first transaction', async () => {
  const report = await loadReport(
    db,
    { kind: 'all', start: null, end: null },
    ['a', 'b'],
    DEFAULT_PERIOD_OPTIONS,
    now,
  );
  expect(report.start.toISOString()).toBe('2026-02-10T00:00:00.000Z');
  expect(report.openingBalance).toBe(10500);
  expect(report.transactions).toHaveLength(3);
});
