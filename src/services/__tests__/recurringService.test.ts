import { insertAccount } from '@/db/repositories/accountRepository';
import { getRecurringRule, insertRecurringRule } from '@/db/repositories/recurringRepository';
import { listAllTransactions } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { makeAccount, makeRule } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

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
