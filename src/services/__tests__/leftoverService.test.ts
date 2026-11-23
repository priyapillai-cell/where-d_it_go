import { insertAccount } from '@/db/repositories/accountRepository';
import { insertCategory } from '@/db/repositories/categoryRepository';
import { listFundEntries, upsertFund, upsertFundEntry } from '@/db/repositories/fundRepository';
import { insertTransaction } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';
import {
  makeAccount,
  makeCategory,
  makeFund,
  makeFundEntry,
  makeTransaction,
} from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { saveBudget } from '../budgetService';
import {
  leftoverEntryId,
  loadFundMonthBudget,
  loadMainMonthBudget,
  runBudgetLeftoverTransfers,
} from '../leftoverService';

let db: SqlDatabase;
const NOW = new Date(2026, 2, 20, 12);
const settings: Settings = { ...DEFAULT_SETTINGS, defaultCurrency: 'USD', firstDayOfMonth: 1 };

const day = (month: number, date: number) => new Date(2026, month, date, 12).toISOString();

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, makeAccount({ id: 'usd', currency: 'USD' }));
  await insertAccount(db, makeAccount({ id: 'eur', currency: 'EUR' }));
  await insertCategory(db, makeCategory({ id: 'food' }));
  await upsertFund(db, makeFund({ id: 'gifts', currency: 'USD' }));
  await upsertFund(db, makeFund({ id: 'euro', currency: 'EUR' }));
});

afterEach(async () => {
  await db.close();
});

async function spend(amount: number, date: string, accountId = 'usd') {
  await insertTransaction(db, makeTransaction({ accountId, categoryId: 'food', amount, date }));
}

describe('loadMainMonthBudget', () => {
  it('is null without a budget in the default currency', async () => {
    await saveBudget(db, { categoryId: null, amount: 10000, currency: 'EUR' });
    expect(await loadMainMonthBudget(db, NOW, settings)).toBeNull();
  });

  it('uses the overall budget and only this month spending', async () => {
    await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
    await spend(2500, day(2, 5));
    await spend(9999, day(1, 5));
    await spend(4000, day(2, 6), 'eur');
    const budget = await loadMainMonthBudget(db, NOW, settings);
    expect(budget).toMatchObject({ source: 'overall', base: 10000, carried: 0 });
    expect(budget?.progress).toMatchObject({ limit: 10000, spent: 2500 });
  });

  it('adds up category budgets when there is no overall budget', async () => {
    await saveBudget(db, { categoryId: 'food', amount: 6000, currency: 'USD' });
    const budget = await loadMainMonthBudget(db, NOW, settings);
    expect(budget).toMatchObject({ source: 'categories', base: 6000 });
  });

  it("rolls last month's leftover into this month when that option is on", async () => {
    await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
    await spend(7000, day(1, 10));
    await spend(1000, day(2, 2));
    const off = await loadMainMonthBudget(db, NOW, settings);
    expect(off?.carried).toBe(0);
    const on = await loadMainMonthBudget(db, NOW, {
      ...settings,
      budgetLeftover: 'nextMonth',
      budgetLeftoverSince: '2026-02',
    });
    expect(on).toMatchObject({ base: 10000, carried: 3000 });
    expect(on?.progress).toMatchObject({ limit: 13000, spent: 1000 });
  });

  it('does not carry months from before the option was chosen', async () => {
    await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
    const budget = await loadMainMonthBudget(db, NOW, {
      ...settings,
      budgetLeftover: 'nextMonth',
      budgetLeftoverSince: '2026-03',
    });
    expect(budget?.carried).toBe(0);
  });
});

describe('loadFundMonthBudget', () => {
  it('is null until the sinking fund budget is set', async () => {
    expect(await loadFundMonthBudget(db, NOW, settings)).toBeNull();
  });

  it('counts this month spending from funds in the default currency only', async () => {
    await upsertFundEntry(
      db,
      makeFundEntry({ fundId: 'gifts', type: 'spend', amount: 1500, date: day(2, 4) }),
    );
    await upsertFundEntry(
      db,
      makeFundEntry({ fundId: 'gifts', type: 'deposit', amount: 9000, date: day(2, 4) }),
    );
    await upsertFundEntry(
      db,
      makeFundEntry({ fundId: 'euro', type: 'spend', amount: 800, date: day(2, 4) }),
    );
    const budget = await loadFundMonthBudget(db, NOW, { ...settings, fundBudget: 5000 });
    expect(budget?.progress).toMatchObject({ limit: 5000, spent: 1500 });
  });

  it('carries the unspent fund budget forward when that option is on', async () => {
    await upsertFundEntry(
      db,
      makeFundEntry({ fundId: 'gifts', type: 'spend', amount: 2000, date: day(1, 14) }),
    );
    const budget = await loadFundMonthBudget(db, NOW, {
      ...settings,
      fundBudget: 5000,
      fundLeftover: 'nextMonth',
      fundLeftoverSince: '2026-02',
    });
    expect(budget).toMatchObject({ base: 5000, carried: 3000 });
  });
});

describe('runBudgetLeftoverTransfers', () => {
  const moving: Settings = {
    ...settings,
    budgetLeftover: 'sinkingFund',
    budgetLeftoverFundId: 'gifts',
    budgetLeftoverSince: '2026-01',
  };

  beforeEach(async () => {
    await saveBudget(db, { categoryId: null, amount: 10000, currency: 'USD' });
  });

  it('does nothing unless the leftover goes to the sinking fund', async () => {
    expect(await runBudgetLeftoverTransfers(db, settings, NOW)).toEqual({
      created: 0,
      lastMonth: null,
    });
  });

  it('deposits the leftover of every finished month, once', async () => {
    await spend(4000, day(0, 10));
    await spend(12000, day(1, 10));
    await spend(1000, day(2, 10));
    const result = await runBudgetLeftoverTransfers(db, moving, NOW);
    expect(result).toEqual({ created: 1, lastMonth: '2026-02' });

    const entries = await listFundEntries(db, 'gifts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: leftoverEntryId('2026-01'),
      type: 'deposit',
      amount: 6000,
      accountId: null,
      date: new Date(2026, 1, 1).toISOString(),
    });

    const again = await runBudgetLeftoverTransfers(
      db,
      { ...moving, budgetLeftoverLastMonth: result.lastMonth },
      NOW,
    );
    expect(again.created).toBe(0);
    expect(await listFundEntries(db, 'gifts')).toHaveLength(1);
  });

  it('takes the money from the chosen account only when it uses the same currency', async () => {
    await runBudgetLeftoverTransfers(db, { ...moving, budgetLeftoverAccountId: 'usd' }, NOW);
    expect((await listFundEntries(db, 'gifts'))[0]?.accountId).toBe('usd');

    await db.run('DELETE FROM fund_entries');
    await runBudgetLeftoverTransfers(db, { ...moving, budgetLeftoverAccountId: 'eur' }, NOW);
    expect((await listFundEntries(db, 'gifts'))[0]?.accountId).toBeNull();
  });

  it('skips a fund in another currency', async () => {
    const result = await runBudgetLeftoverTransfers(
      db,
      { ...moving, budgetLeftoverFundId: 'euro' },
      NOW,
    );
    expect(result.created).toBe(0);
  });
});
