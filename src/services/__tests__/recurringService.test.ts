import { insertAccount } from '@/db/repositories/accountRepository';
import { insertCategory } from '@/db/repositories/categoryRepository';
import { getRecurringRule, insertRecurringRule } from '@/db/repositories/recurringRepository';
import { listAllTransactions } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { makeAccount, makeCategory, makeRule } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import {
  deleteRecurringRule,
  type RecurringRuleInput,
  saveRecurringRule,
} from '../recurringRuleService';
import { generateDueTransactions } from '../recurringService';

let db: SqlDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, makeAccount({ id: 'acc' }));
});

afterEach(async () => {
  await db.close();
});

it('generates every due occurrence and advances the watermark', async () => {
  await insertRecurringRule(db, makeRule({ id: 'rent', startDate: '2026-01-31T09:00:00.000Z' }));
  const result = await generateDueTransactions(db, new Date('2026-04-15T00:00:00.000Z'));
  expect(result).toEqual({ created: 3, failedRules: 0 });
  const txs = await listAllTransactions(db);
  expect(txs.map((t) => t.date)).toEqual([
    '2026-01-31T09:00:00.000Z',
    '2026-02-28T09:00:00.000Z',
    '2026-03-31T09:00:00.000Z',
  ]);
  expect((await getRecurringRule(db, 'rent'))?.lastGeneratedAt).toBe('2026-03-31T09:00:00.000Z');
});

it('never creates the same occurrence twice, even when runs overlap', async () => {
  await insertRecurringRule(
    db,
    makeRule({ id: 'sub', frequency: 'weekly', startDate: '2026-03-01T08:00:00.000Z' }),
  );
  const now = new Date('2026-04-01T00:00:00.000Z');
  await Promise.all([generateDueTransactions(db, now), generateDueTransactions(db, now)]);
  await generateDueTransactions(db, now);
  expect(await listAllTransactions(db)).toHaveLength(5);

  const later = new Date('2026-04-09T00:00:00.000Z');
  expect((await generateDueTransactions(db, later)).created).toBe(1);
  expect((await generateDueTransactions(db, later)).created).toBe(0);
});

it('does not regenerate an occurrence the user deleted', async () => {
  await insertRecurringRule(db, makeRule({ id: 'gym', startDate: '2026-03-01T08:00:00.000Z' }));
  const now = new Date('2026-03-10T00:00:00.000Z');
  await generateDueTransactions(db, now);
  const [tx] = await listAllTransactions(db);
  await db.run('DELETE FROM transactions WHERE id = ?', [tx!.id]);
  await generateDueTransactions(db, now);
  expect(await listAllTransactions(db)).toHaveLength(0);
});

it('isolates failures to the broken rule', async () => {
  await db.exec('PRAGMA foreign_keys = OFF');
  await insertRecurringRule(
    db,
    makeRule({ id: 'broken', accountId: 'ghost', startDate: '2026-03-01T08:00:00.000Z' }),
  );
  await db.exec('PRAGMA foreign_keys = ON');
  await insertRecurringRule(db, makeRule({ id: 'fine', startDate: '2026-03-01T08:00:00.000Z' }));
  const result = await generateDueTransactions(db, new Date('2026-03-10T00:00:00.000Z'));
  expect(result).toEqual({ created: 1, failedRules: 1 });
  expect((await getRecurringRule(db, 'broken'))?.lastGeneratedAt).toBeNull();
});

describe('saveRecurringRule', () => {
  const input: RecurringRuleInput = {
    type: 'expense',
    amount: 5000,
    accountId: 'acc',
    categoryId: 'cat',
    note: ' Gym ',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-10T09:00:00.000Z',
    endDate: null,
    reminderDaysBefore: 2,
    isActive: true,
  };

  beforeEach(async () => {
    await insertCategory(db, makeCategory({ id: 'cat' }));
  });

  it('validates the schedule, category and account', async () => {
    const result = await saveRecurringRule(db, {
      ...input,
      amount: 0,
      categoryId: null,
      interval: 0,
      endDate: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toEqual({
      ok: false,
      error: {
        amount: 'amountPositive',
        categoryId: 'required',
        interval: 'invalidInterval',
        endDate: 'endBeforeStart',
      },
    });
    expect(await saveRecurringRule(db, { ...input, accountId: 'nope' })).toEqual({
      ok: false,
      error: { accountId: 'missingAccount' },
    });
  });

  it('keeps the watermark on edit so nothing is generated twice', async () => {
    const created = await saveRecurringRule(db, input);
    if (!created.ok) throw new Error('not saved');
    expect(created.value.note).toBe('Gym');
    await generateDueTransactions(db, new Date('2026-03-15T00:00:00.000Z'));
    const edited = await saveRecurringRule(db, { ...input, amount: 6000 }, created.value.id);
    expect(edited.ok && edited.value.lastGeneratedAt).toBe('2026-03-10T09:00:00.000Z');
    await generateDueTransactions(db, new Date('2026-03-20T00:00:00.000Z'));
    expect(await listAllTransactions(db)).toHaveLength(3);
  });

  it('deleting a rule keeps its transactions', async () => {
    const created = await saveRecurringRule(db, input);
    if (!created.ok) throw new Error('not saved');
    await generateDueTransactions(db, new Date('2026-02-15T00:00:00.000Z'));
    await deleteRecurringRule(db, created.value.id);
    expect(await getRecurringRule(db, created.value.id)).toBeNull();
    const txs = await listAllTransactions(db);
    expect(txs).toHaveLength(2);
    expect(txs.every((tx) => tx.recurringRuleId === null)).toBe(true);
  });
});
