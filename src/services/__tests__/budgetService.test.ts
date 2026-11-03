import { insertAccount } from '@/db/repositories/accountRepository';
import { listBudgets } from '@/db/repositories/budgetRepository';
import { insertCategory } from '@/db/repositories/categoryRepository';
import { insertTransaction } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { makeAccount, makeCategory, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { collectBudgetAlerts, loadBudgetOverview, saveBudget } from '../budgetService';

let db: SqlDatabase;
const now = new Date('2026-03-20T12:00:00.000Z');

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, makeAccount({ id: 'usd', currency: 'USD' }));
  await insertAccount(db, makeAccount({ id: 'eur', currency: 'EUR' }));
  await insertCategory(db, makeCategory({ id: 'food' }));
  await insertCategory(db, makeCategory({ id: 'fun' }));
});

afterEach(async () => {
  await db.close();
});

async function spend(amount: number, overrides: Parameters<typeof makeTransaction>[0] = {}) {
  await insertTransaction(
    db,
    makeTransaction({ accountId: 'usd', categoryId: 'food', amount, ...overrides }),
  );
}

it('validates amounts and replaces the budget for the same scope', async () => {
  expect(await saveBudget(db, { categoryId: null, amount: 0, currency: 'USD' })).toEqual({
    ok: false,
    error: { amount: 'amountPositive' },
  });
  await saveBudget(db, { categoryId: null, amount: 1000, currency: 'USD' });
  await saveBudget(db, { categoryId: null, amount: 2000, currency: 'USD' });
  await saveBudget(db, { categoryId: 'food', amount: 500, currency: 'USD' });
  const budgets = await listBudgets(db);
  expect(budgets.map((b) => [b.categoryId, b.amount])).toEqual([
    [null, 2000],
    ['food', 500],
  ]);
});

it('counts only this month, this currency and the budget category', async () => {
  await saveBudget(db, { categoryId: 'food', amount: 10000, currency: 'USD' });
  await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
  await spend(3000, { date: '2026-03-05T10:00:00.000Z' });
  await spend(2000, { date: '2026-03-06T10:00:00.000Z', categoryId: 'fun' });
  await spend(9999, { date: '2026-02-28T10:00:00.000Z' });
  await spend(7777, { date: '2026-03-07T10:00:00.000Z', accountId: 'eur' });
  await spend(500, { date: '2026-03-08T10:00:00.000Z', type: 'income' });

  const overview = await loadBudgetOverview(db, now, 1);
  const byScope = new Map(overview.items.map((i) => [i.budget.categoryId, i.progress]));
  expect(byScope.get('food')?.spent).toBe(3000);
  expect(byScope.get(null)?.spent).toBe(5000);
  expect(overview.periodKey).toBe('2026-03');
});

it('respects a custom first day of the month', async () => {
  await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
  await spend(1000, { date: '2026-03-10T10:00:00.000Z' });
  await spend(2000, { date: '2026-03-16T10:00:00.000Z' });
  const overview = await loadBudgetOverview(db, now, 15);
  expect(overview.items[0]?.progress.spent).toBe(2000);
});

it('alerts once per threshold per month and announces only the highest', async () => {
  const saved = await saveBudget(db, { categoryId: 'food', amount: 10000, currency: 'USD' });
  if (!saved.ok) throw new Error('budget not saved');

  await spend(7900, { date: '2026-03-02T10:00:00.000Z' });
  expect(await collectBudgetAlerts(db, now, 1)).toEqual([]);

  await spend(200, { date: '2026-03-03T10:00:00.000Z' });
  const first = await collectBudgetAlerts(db, now, 1);
  expect(first.map((a) => a.threshold)).toEqual([80]);
  expect(await collectBudgetAlerts(db, now, 1)).toEqual([]);

  await spend(5000, { date: '2026-03-04T10:00:00.000Z' });
  expect((await collectBudgetAlerts(db, now, 1)).map((a) => a.threshold)).toEqual([100]);
  expect(await collectBudgetAlerts(db, now, 1)).toEqual([]);

  await spend(20000, { date: '2026-04-02T10:00:00.000Z' });
  const nextMonth = await collectBudgetAlerts(db, new Date('2026-04-10T12:00:00.000Z'), 1);
  expect(nextMonth.map((a) => a.threshold)).toEqual([100]);
});
