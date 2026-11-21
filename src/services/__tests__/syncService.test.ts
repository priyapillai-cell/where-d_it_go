import { getAccount, insertAccount } from '@/db/repositories/accountRepository';
import {
  insertCategory,
  listCategories,
  updateCategory,
} from '@/db/repositories/categoryRepository';
import {
  upsertFund as insertFund,
  upsertFundEntry as insertFundEntry,
} from '@/db/repositories/fundRepository';
import { insertRecurringRule } from '@/db/repositories/recurringRepository';
import {
  deleteTransaction,
  getTransaction,
  insertTransaction,
  listAllTransactions,
  updateTransaction,
} from '@/db/repositories/transactionRepository';
import { seedDefaults } from '@/db/seed';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { parseSnapshot, SEED_CHANGED_AT } from '@/domain/sync';
import {
  makeAccount,
  makeCategory,
  makeFund,
  makeFundEntry,
  makeRule,
  makeTransaction,
} from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { generateDueTransactions } from '../recurringService';
import { hasUserData, type SnapshotStore, syncDatabase } from '../syncService';

class MemoryStore implements SnapshotStore {
  text: string | null = null;
  version = 0;
  writes = 0;
  /** Simulates another device writing between our read and write. */
  interfere: (() => void) | null = null;

  async read() {
    return this.text === null ? null : { text: this.text, version: String(this.version) };
  }

  async write(text: string, expectedVersion: string | null) {
    if (this.interfere) {
      const run = this.interfere;
      this.interfere = null;
      run();
    }
    const current = this.text === null ? null : String(this.version);
    if (current !== expectedVersion) return 'conflict' as const;
    this.text = text;
    this.version += 1;
    this.writes += 1;
    return 'written' as const;
  }
}

const NOW = new Date('2026-06-01T12:00:00.000Z');
const now = () => NOW;

async function device(): Promise<SqlDatabase> {
  const db = await createTestDatabase();
  await seedDefaults(db, {
    currency: 'USD',
    categoryName: (key) => key,
    accountName: 'Cash',
    now: NOW,
  });
  return db;
}

/** Pins a row's change stamp so last-writer-wins tests do not depend on the wall clock. */
async function stampAt(db: SqlDatabase, table: string, id: string, iso: string) {
  await db.run('UPDATE sync_changes SET changed_at = ? WHERE table_name = ? AND row_id = ?', [
    iso,
    table,
    id,
  ]);
}

const sync = (db: SqlDatabase, store: SnapshotStore, deviceId: string) =>
  syncDatabase(db, store, { deviceId, now });

let a: SqlDatabase;
let b: SqlDatabase;
let store: MemoryStore;

beforeEach(async () => {
  a = await device();
  b = await device();
  store = new MemoryStore();
});

afterEach(async () => {
  await a.close();
  await b.close();
});

it('uploads on first sync and then stays quiet when nothing changed', async () => {
  expect(await sync(a, store, 'A')).toEqual({ kind: 'synced', pulled: 0, pushed: true });
  expect(await sync(a, store, 'A')).toEqual({ kind: 'synced', pulled: 0, pushed: false });
  expect(store.writes).toBe(1);
});

it('stamps seed rows as oldest so real edits elsewhere always win', async () => {
  const row = await a.first<{ changed_at: string }>(
    "SELECT changed_at FROM sync_changes WHERE table_name = 'accounts'",
  );
  expect(row?.changed_at).toBe(SEED_CHANGED_AT);
});

it('converges two devices that start from the same defaults without duplicates', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  await insertTransaction(a, makeTransaction({ id: 'tx-a', accountId: cash, categoryId: food.id }));
  await insertTransaction(b, makeTransaction({ id: 'tx-b', accountId: cash, categoryId: food.id }));

  await sync(a, store, 'A');
  const fromB = await sync(b, store, 'B');
  expect(fromB).toMatchObject({ kind: 'synced', pulled: 1, pushed: true });
  expect(await sync(a, store, 'A')).toMatchObject({ pulled: 1, pushed: false });

  for (const db of [a, b]) {
    expect((await listAllTransactions(db)).map((t) => t.id).sort()).toEqual(['tx-a', 'tx-b']);
    expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM accounts'))?.n).toBe(1);
  }
});

it('keeps the most recent edit of the same record', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  const tx = makeTransaction({ id: 'tx', accountId: cash, categoryId: food.id, amount: 10 });
  await insertTransaction(a, tx);
  await sync(a, store, 'A');
  await sync(b, store, 'B');

  await updateTransaction(a, { ...tx, amount: 20 });
  await stampAt(a, 'transactions', 'tx', '2100-01-01T10:00:00.000Z');
  await updateTransaction(b, { ...tx, amount: 30 });
  await stampAt(b, 'transactions', 'tx', '2100-01-01T11:00:00.000Z');

  await sync(a, store, 'A');
  await sync(b, store, 'B');
  await sync(a, store, 'A');
  expect((await getTransaction(a, 'tx'))?.amount).toBe(30);
  expect((await getTransaction(b, 'tx'))?.amount).toBe(30);
});

it('propagates deletions through tombstones', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  await insertTransaction(a, makeTransaction({ id: 'tx', accountId: cash, categoryId: food.id }));
  await sync(a, store, 'A');
  await sync(b, store, 'B');
  expect(await getTransaction(b, 'tx')).not.toBeNull();

  await deleteTransaction(b, 'tx');
  await sync(b, store, 'B');
  await sync(a, store, 'A');
  expect(await getTransaction(a, 'tx')).toBeNull();

  const snapshot = parseSnapshot(store.text!, 99);
  expect(snapshot.ok && snapshot.value.tables.transactions[0]).toMatchObject({
    id: 'tx',
    deleted: true,
  });
});

it('keeps a tombstone it never had a row for, so it is not lost on the next upload', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  await insertTransaction(a, makeTransaction({ id: 'tx', accountId: cash, categoryId: food.id }));
  await deleteTransaction(a, 'tx');
  await sync(a, store, 'A');
  await sync(b, store, 'B');
  const row = await b.first<{ deleted: number }>(
    "SELECT deleted FROM sync_changes WHERE table_name = 'transactions' AND row_id = 'tx'",
  );
  expect(row?.deleted).toBe(1);
});

it('restores a deleted parent that another device still uses', async () => {
  await insertCategory(a, makeCategory({ id: 'trip' }));
  await sync(a, store, 'A');
  await sync(b, store, 'B');

  await a.run("DELETE FROM categories WHERE id = 'trip'");
  await stampAt(a, 'categories', 'trip', '2100-01-01T11:00:00.000Z');
  const cash = (await b.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  await insertTransaction(b, makeTransaction({ id: 'tx', accountId: cash, categoryId: 'trip' }));
  await stampAt(b, 'transactions', 'tx', '2100-01-01T10:00:00.000Z');

  await sync(a, store, 'A');
  await sync(b, store, 'B');
  await sync(a, store, 'A');
  for (const db of [a, b]) {
    expect((await listCategories(db)).some((c) => c.id === 'trip')).toBe(true);
    expect(await getTransaction(db, 'tx')).not.toBeNull();
  }
});

it('does not duplicate recurring occurrences generated on both devices', async () => {
  await insertAccount(a, makeAccount({ id: 'acc' }));
  await insertCategory(a, makeCategory({ id: 'cat' }));
  await insertRecurringRule(
    a,
    makeRule({
      id: 'rent',
      accountId: 'acc',
      categoryId: 'cat',
      startDate: '2026-01-31T09:00:00.000Z',
    }),
  );
  await sync(a, store, 'A');
  await sync(b, store, 'B');

  await generateDueTransactions(a, NOW);
  await generateDueTransactions(b, NOW);
  await sync(a, store, 'A');
  await sync(b, store, 'B');
  await sync(a, store, 'A');

  const ids = (await listAllTransactions(a)).map((t) => t.id);
  expect(ids).toHaveLength(5);
  expect((await listAllTransactions(b)).map((t) => t.id).sort()).toEqual([...ids].sort());
});

it('syncs sinking funds and their entries', async () => {
  await insertFund(a, makeFund({ id: 'gifts' }));
  await insertFundEntry(a, makeFundEntry({ id: 'e1', fundId: 'gifts', amount: 50 }));
  await sync(a, store, 'A');
  await sync(b, store, 'B');
  expect(await b.first('SELECT id FROM fund_entries WHERE fund_id = ?', ['gifts'])).toEqual({
    id: 'e1',
  });
});

it('retries when another device writes between read and write', async () => {
  await sync(a, store, 'A');
  await updateCategory(b, { ...(await listCategories(b))[0]!, name: 'Groceries' });
  store.interfere = () => {
    store.version += 1;
  };
  const result = await sync(b, store, 'B');
  expect(result).toMatchObject({ kind: 'synced', pushed: true });
  expect(store.writes).toBe(2);
});

it('gives up after repeated conflicts', async () => {
  await sync(a, store, 'A');
  await updateCategory(b, { ...(await listCategories(b))[0]!, name: 'Groceries' });
  const busy: SnapshotStore = {
    read: () => store.read(),
    write: async () => 'conflict',
  };
  expect(await syncDatabase(b, busy, { deviceId: 'B', now, maxAttempts: 2 })).toEqual({
    kind: 'conflict',
  });
});

it('refuses a corrupt shared copy unless asked to overwrite it', async () => {
  store.text = 'not json';
  expect(await sync(a, store, 'A')).toEqual({ kind: 'remoteInvalid' });
  const repaired = await syncDatabase(a, store, { deviceId: 'A', now, mode: 'overwriteRemote' });
  expect(repaired).toMatchObject({ kind: 'synced', pushed: true });
  expect(parseSnapshot(store.text, 99).ok).toBe(true);
});

it('refuses a copy written by a newer version of the app', async () => {
  await sync(a, store, 'A');
  store.text = store.text!.replace(/"schemaVersion":\d+/, '"schemaVersion":999');
  expect(await sync(b, store, 'B')).toEqual({ kind: 'remoteNewerApp' });
});

it('replaces local data with the shared copy when adopting it', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  await insertTransaction(a, makeTransaction({ id: 'tx-a', accountId: cash, categoryId: food.id }));
  await sync(a, store, 'A');
  await insertTransaction(b, makeTransaction({ id: 'tx-b', accountId: cash, categoryId: food.id }));

  const result = await syncDatabase(b, store, { deviceId: 'B', now, mode: 'adoptRemote' });
  expect(result).toMatchObject({ kind: 'synced', pushed: false });
  expect((await listAllTransactions(b)).map((t) => t.id)).toEqual(['tx-a']);
  expect(await getAccount(b, cash)).not.toBeNull();
});

it('drops tombstones older than the retention window', async () => {
  const cash = (await a.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const food = (await listCategories(a))[0]!;
  await insertTransaction(a, makeTransaction({ id: 'old', accountId: cash, categoryId: food.id }));
  await deleteTransaction(a, 'old');
  await stampAt(a, 'transactions', 'old', '2025-01-01T00:00:00.000Z');
  await sync(a, store, 'A');
  expect(
    await a.first(
      "SELECT 1 FROM sync_changes WHERE table_name = 'transactions' AND row_id = 'old'",
    ),
  ).toBeNull();
});

it('reports whether a device holds user-created data', async () => {
  expect(await hasUserData(a)).toBe(false);
  await insertFund(a, makeFund({ id: 'gifts' }));
  expect(await hasUserData(a)).toBe(true);
});
