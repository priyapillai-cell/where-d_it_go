import { computeBalances, flowsFromTransactions } from '@/domain/balance';
import { EMPTY_FILTER } from '@/domain/transactionFilter';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { makeAccount, makeCategory, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { migrate, SCHEMA_VERSION } from '../migrations';
import {
  accountFlows,
  insertAccount,
  listAccounts,
  reorderAccounts,
} from '../repositories/accountRepository';
import {
  listBudgets,
  notifiedThresholds,
  recordBudgetAlert,
  upsertBudget,
} from '../repositories/budgetRepository';
import { insertCategory } from '../repositories/categoryRepository';
import { dumpAll, replaceAll } from '../repositories/dataRepository';
import { loadSettings, saveSettings } from '../repositories/settingsRepository';
import {
  getTransaction,
  insertTransaction,
  insertTransactionIfAbsent,
  listTransactions,
} from '../repositories/transactionRepository';
import { needsSeed, seedDefaults } from '../seed';
import type { SqlDatabase } from '../sqlDatabase';

let db: SqlDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(
    db,
    makeAccount({ id: 'cash', name: 'Cash', initialBalance: 10000, sortOrder: 0 }),
  );
  await insertAccount(
    db,
    makeAccount({ id: 'bank', name: 'Bank', initialBalance: 0, sortOrder: 1 }),
  );
  await insertCategory(db, makeCategory({ id: 'food', name: 'Food' }));
  await insertCategory(db, makeCategory({ id: 'salary', name: 'Salary', type: 'income' }));
});

afterEach(async () => {
  await db.close();
});

it('migrations are idempotent', async () => {
  expect(await migrate(db)).toBe(SCHEMA_VERSION);
});

it('SQL account flows agree with the pure balance calculation', async () => {
  const txs = [
    makeTransaction({ type: 'income', amount: 20000, accountId: 'cash', categoryId: 'salary' }),
    makeTransaction({ type: 'expense', amount: 3500, accountId: 'cash', categoryId: 'food' }),
    makeTransaction({
      type: 'transfer',
      amount: 5000,
      toAmount: 4900,
      accountId: 'cash',
      toAccountId: 'bank',
    }),
  ];
  for (const t of txs) await insertTransaction(db, t);
  const accounts = await listAccounts(db);
  const fromSql = computeBalances(accounts, await accountFlows(db));
  const fromDomain = computeBalances(accounts, flowsFromTransactions(txs));
  expect(fromSql).toEqual(fromDomain);
  expect(fromSql.get('cash')).toBe(21500);
  expect(fromSql.get('bank')).toBe(4900);
});

it('enforces transfer integrity in the schema', async () => {
  await expect(
    insertTransaction(
      db,
      makeTransaction({ type: 'transfer', accountId: 'cash', toAccountId: 'cash' }),
    ),
  ).rejects.toThrow();
  await expect(
    insertTransaction(db, makeTransaction({ accountId: 'cash', amount: -5 })),
  ).rejects.toThrow();
});

it('rolls back every write when a transaction fails', async () => {
  await expect(
    db.transaction(async (tx) => {
      await insertTransaction(tx, makeTransaction({ id: 'keep?', accountId: 'cash' }));
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await getTransaction(db, 'keep?')).toBeNull();
});

it('filters by search, type, account, category, date and amount', async () => {
  await insertTransaction(
    db,
    makeTransaction({
      id: 'a',
      accountId: 'cash',
      categoryId: 'food',
      note: 'Pizza 100%',
      amount: 1500,
      date: '2026-03-01T10:00:00.000Z',
    }),
  );
  await insertTransaction(
    db,
    makeTransaction({
      id: 'b',
      accountId: 'bank',
      categoryId: 'food',
      note: 'Groceries',
      amount: 8000,
      date: '2026-03-05T10:00:00.000Z',
    }),
  );
  await insertTransaction(
    db,
    makeTransaction({
      id: 'c',
      type: 'income',
      accountId: 'bank',
      categoryId: 'salary',
      amount: 300000,
      date: '2026-03-10T10:00:00.000Z',
    }),
  );
  await insertTransaction(
    db,
    makeTransaction({
      id: 'd',
      type: 'transfer',
      accountId: 'cash',
      toAccountId: 'bank',
      amount: 100,
      date: '2026-03-11T10:00:00.000Z',
    }),
  );

  const ids = async (patch: Partial<typeof EMPTY_FILTER>) =>
    (await listTransactions(db, { ...EMPTY_FILTER, ...patch })).map((t) => t.id);

  expect(await ids({})).toEqual(['d', 'c', 'b', 'a']);
  expect(await ids({ search: 'pizza' })).toEqual(['a']);
  expect(await ids({ search: '100%' })).toEqual(['a']);
  expect(await ids({ search: '%' })).toEqual(['a']);
  expect(await ids({ search: 'salary' })).toEqual(['c']);
  expect(await ids({ types: ['income'] })).toEqual(['c']);
  expect(await ids({ accountIds: ['cash'] })).toEqual(['d', 'a']);
  expect(await ids({ accountIds: ['bank'] })).toEqual(['d', 'c', 'b']);
  expect(await ids({ categoryIds: ['food'] })).toEqual(['b', 'a']);
  expect(await ids({ from: '2026-03-05T00:00:00.000Z', to: '2026-03-10T00:00:00.000Z' })).toEqual([
    'b',
  ]);
  expect(await ids({ minAmount: 1000, maxAmount: 10000 })).toEqual(['b', 'a']);
});

it('lists 10,000 transactions quickly', async () => {
  await db.transaction(async (tx) => {
    for (let i = 0; i < 10_000; i += 1) {
      await insertTransaction(
        tx,
        makeTransaction({
          accountId: 'cash',
          categoryId: 'food',
          amount: 100 + i,
          date: new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString(),
        }),
      );
    }
  });
  const started = Date.now();
  const rows = await listTransactions(db, EMPTY_FILTER);
  expect(rows).toHaveLength(10_000);
  expect(Date.now() - started).toBeLessThan(2000);
});

it('ignores duplicate recurring occurrences', async () => {
  await db.run(
    `INSERT INTO recurring_rules (id, type, amount, account_id, note, frequency, interval, start_date, is_active, created_at)
     VALUES ('r1', 'expense', 100, 'cash', '', 'monthly', 1, '2026-01-01T00:00:00.000Z', 1, '2026-01-01T00:00:00.000Z')`,
  );
  const base = {
    accountId: 'cash',
    recurringRuleId: 'r1',
    occurrenceKey: '2026-01-01T00:00:00.000Z',
  };
  expect(await insertTransactionIfAbsent(db, makeTransaction(base))).toBe(true);
  expect(await insertTransactionIfAbsent(db, makeTransaction(base))).toBe(false);
});

it('reorders accounts', async () => {
  await db.transaction((tx) => reorderAccounts(tx, ['bank', 'cash']));
  expect((await listAccounts(db)).map((a) => a.id)).toEqual(['bank', 'cash']);
});

it('stores settings and ignores corrupt values', async () => {
  await saveSettings(db, { defaultCurrency: 'EUR', firstDayOfMonth: 15 });
  await db.run(`INSERT INTO settings (key, value) VALUES ('theme', '"neon"')`);
  await db.run(`INSERT INTO settings (key, value) VALUES ('language', '{broken')`);
  const settings = await loadSettings(db);
  expect(settings).toEqual({ ...DEFAULT_SETTINGS, defaultCurrency: 'EUR', firstDayOfMonth: 15 });
});

it('keeps one budget per scope and records alerts once', async () => {
  await upsertBudget(db, {
    id: 'b1',
    categoryId: null,
    period: 'monthly',
    amount: 1000,
    currency: 'USD',
  });
  await upsertBudget(db, {
    id: 'b2',
    categoryId: null,
    period: 'monthly',
    amount: 2000,
    currency: 'USD',
  });
  await upsertBudget(db, {
    id: 'b3',
    categoryId: 'food',
    period: 'monthly',
    amount: 500,
    currency: 'USD',
  });
  expect((await listBudgets(db)).map((b) => [b.id, b.amount])).toEqual([
    ['b2', 2000],
    ['b3', 500],
  ]);
  expect(await recordBudgetAlert(db, 'b2', '2026-03', 80, 'now')).toBe(true);
  expect(await recordBudgetAlert(db, 'b2', '2026-03', 80, 'now')).toBe(false);
  expect(await notifiedThresholds(db, 'b2', '2026-03')).toEqual([80]);
});

it('dumps and restores all data atomically', async () => {
  await insertTransaction(db, makeTransaction({ id: 't1', accountId: 'cash', categoryId: 'food' }));
  const snapshot = await dumpAll(db);
  await db.transaction((tx) => replaceAll(tx, { ...snapshot, transactions: [] }));
  expect(await listTransactions(db, EMPTY_FILTER)).toEqual([]);
  await db.transaction((tx) => replaceAll(tx, snapshot));
  expect(await dumpAll(db)).toEqual(snapshot);
});

it('seeds defaults only into an empty database', async () => {
  const fresh = await createTestDatabase();
  expect(await needsSeed(fresh)).toBe(true);
  await fresh.transaction((tx) =>
    seedDefaults(tx, { currency: 'INR', accountName: 'Cash', categoryName: (k) => k }),
  );
  expect(await needsSeed(fresh)).toBe(false);
  const data = await dumpAll(fresh);
  expect(data.accounts).toHaveLength(1);
  expect(data.categories.length).toBeGreaterThanOrEqual(10);
  expect(data.settings.defaultCurrency).toBe('INR');
  await fresh.close();
});
