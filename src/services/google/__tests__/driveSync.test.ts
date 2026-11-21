import { listCategories } from '@/db/repositories/categoryRepository';
import { getSyncMeta } from '@/db/repositories/syncRepository';
import { insertTransaction, listAllTransactions } from '@/db/repositories/transactionRepository';
import { seedDefaults } from '@/db/seed';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { INITIAL_DRIVE_STATE, useSyncStore } from '@/state/syncStore';
import { FakeDrive } from '@/test/fakeDrive';
import { makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { exportBackupJson } from '../../dataService';
import { DriveClient } from '../driveClient';
import { SHEET_FILE_NAME, SYNC_FILE_NAME } from '../driveFiles';
import { createDriveSync, type DriveSyncDeps, META } from '../driveSync';
import { GoogleAuthExpiredError } from '../googleAuth';

const NOW = new Date('2026-06-01T12:00:00.000Z');

let fake: FakeDrive;
const databases: SqlDatabase[] = [];

async function newDevice(overrides: Partial<DriveSyncDeps> = {}) {
  const db = await createTestDatabase();
  databases.push(db);
  await seedDefaults(db, {
    currency: 'USD',
    categoryName: (k) => k,
    accountName: 'Cash',
    now: NOW,
  });
  let signedIn = false;
  const pulls: number[] = [];
  const deps: DriveSyncDeps = {
    getDatabase: async () => db,
    createDrive: () => new DriveClient(fake.fetch, async () => fake.validToken),
    availability: () => ({ kind: 'available', clientId: 'x.apps.googleusercontent.com' }),
    signIn: async () => {
      signedIn = true;
      return { kind: 'signedIn', email: 'me@example.com' };
    },
    signOut: async () => {
      signedIn = false;
    },
    hasAccount: async () => signedIn,
    afterPull: async () => {
      pulls.push(1);
    },
    backupJson: (d, now) => exportBackupJson(d, now),
    spreadsheet: async () => new Uint8Array([80, 75]),
    newDeviceId: () => `device-${databases.length}`,
    now: () => NOW,
    ...overrides,
  };
  return { db, sync: createDriveSync(deps), pulls };
}

async function addTransaction(db: SqlDatabase, id: string) {
  const account = (await db.first<{ id: string }>('SELECT id FROM accounts'))!.id;
  const category = (await listCategories(db))[0]!.id;
  await insertTransaction(db, makeTransaction({ id, accountId: account, categoryId: category }));
}

beforeEach(() => {
  fake = new FakeDrive();
  useSyncStore.setState(INITIAL_DRIVE_STATE);
});

afterEach(async () => {
  while (databases.length > 0) await databases.pop()!.close();
});

it('connects to an empty Drive: uploads data, a daily backup and the spreadsheet', async () => {
  const phone = await newDevice();
  await addTransaction(phone.db, 'tx-1');
  expect(await phone.sync.connect()).toBe('synced');

  expect(fake.byName(SYNC_FILE_NAME)).toBeDefined();
  expect(fake.byName('pocket-ledger-backup-2026-06-01.json')).toBeDefined();
  expect(fake.byName(SHEET_FILE_NAME)).toBeDefined();
  expect(useSyncStore.getState()).toMatchObject({
    status: 'idle',
    email: 'me@example.com',
    lastSyncedAt: NOW.toISOString(),
  });
  expect(useSyncStore.getState().sheetFolderId).toBeTruthy();
});

it('adopts Drive data on a device without its own data', async () => {
  const phone = await newDevice();
  await addTransaction(phone.db, 'tx-1');
  await phone.sync.connect();

  useSyncStore.setState(INITIAL_DRIVE_STATE);
  const tablet = await newDevice();
  expect(await tablet.sync.connect()).toBe('synced');
  expect((await listAllTransactions(tablet.db)).map((t) => t.id)).toEqual(['tx-1']);
  expect(tablet.pulls).toHaveLength(1);
});

it('asks before combining when both sides hold data, then merges', async () => {
  const phone = await newDevice();
  await addTransaction(phone.db, 'tx-phone');
  await phone.sync.connect();

  useSyncStore.setState(INITIAL_DRIVE_STATE);
  const tablet = await newDevice();
  await addTransaction(tablet.db, 'tx-tablet');
  expect(await tablet.sync.connect()).toBe('needsChoice');
  expect(useSyncStore.getState().status).toBe('needsChoice');
  expect(await tablet.sync.sync()).toBeNull();

  expect(await tablet.sync.resolveFirstSync('merge')).toMatchObject({ kind: 'synced' });
  expect((await listAllTransactions(tablet.db)).map((t) => t.id).sort()).toEqual([
    'tx-phone',
    'tx-tablet',
  ]);
});

it('does nothing when Drive is not connected', async () => {
  const phone = await newDevice();
  expect(await phone.sync.sync()).toBeNull();
  expect(fake.requests).toEqual([]);
});

it('turns sync off when Google access was revoked', async () => {
  const phone = await newDevice();
  await phone.sync.connect();
  const revoked = await newDevice({
    createDrive: () =>
      new DriveClient(fake.fetch, async () => {
        throw new GoogleAuthExpiredError();
      }),
  });
  await revoked.db.run("INSERT INTO sync_meta (key, value) VALUES ('drive.enabled', '1')");
  expect(await revoked.sync.sync()).toBeNull();
  expect(useSyncStore.getState()).toMatchObject({ status: 'off', problem: 'signedOut' });
  expect(await getSyncMeta(revoked.db, META.enabled)).toBeNull();
});

it('reports network problems without disconnecting', async () => {
  const phone = await newDevice();
  await phone.sync.connect();
  fake.failNext = 503;
  expect(await phone.sync.sync()).toBeNull();
  expect(useSyncStore.getState()).toMatchObject({ status: 'error', problem: 'network' });
  expect(await getSyncMeta(phone.db, META.enabled)).toBe('1');
});

it('shares a running sync and queues one follow-up round', async () => {
  const phone = await newDevice();
  await phone.sync.connect();
  const before = fake.requests.length;
  const [a, b, c] = [phone.sync.sync(), phone.sync.sync(), phone.sync.sync()];
  expect(a).toBe(b);
  expect(b).toBe(c);
  await a;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await phone.sync.sync();
  expect(fake.requests.length).toBeGreaterThan(before);
});

it('respects the backup and spreadsheet switches', async () => {
  const phone = await newDevice();
  await phone.sync.setAutoBackup(false);
  await phone.sync.setSheetEnabled(false);
  await phone.sync.connect();
  expect(fake.byName('pocket-ledger-backup-2026-06-01.json')).toBeUndefined();
  expect(fake.byName(SHEET_FILE_NAME)).toBeUndefined();
  await phone.sync.backupNow();
  expect((await phone.sync.listBackups()).map((f) => f.name)).toEqual([
    'pocket-ledger-backup-2026-06-01.json',
  ]);
});

it('downloads and validates a Drive backup', async () => {
  const phone = await newDevice();
  await phone.sync.connect();
  const [backup] = await phone.sync.listBackups();
  const result = await phone.sync.downloadBackup(backup!.id);
  expect(result.ok).toBe(true);
  fake.touch(backup!.name, 'not a backup');
  expect(await phone.sync.downloadBackup(backup!.id)).toEqual({ ok: false, error: 'invalid' });
});

it('disconnects: signs out and forgets the account details', async () => {
  const phone = await newDevice();
  await phone.sync.connect();
  await phone.sync.disconnect();
  expect(useSyncStore.getState()).toMatchObject({ status: 'off', email: null });
  expect(await getSyncMeta(phone.db, META.enabled)).toBeNull();
  expect(await getSyncMeta(phone.db, META.deviceId)).toBe('device-1');
  await phone.sync.refreshState();
  expect(useSyncStore.getState().status).toBe('off');
});
