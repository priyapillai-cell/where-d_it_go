import { insertAccount, listAccounts } from '@/db/repositories/accountRepository';
import { listCategories } from '@/db/repositories/categoryRepository';
import { loadSettings, saveSettings } from '@/db/repositories/settingsRepository';
import { insertTransaction, listAllTransactions } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { parseBackup } from '@/domain/backup';
import { parseCsv } from '@/domain/csv';
import { guessMapping, validateImport } from '@/domain/csvImport';
import { makeAccount, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import {
  exportBackupJson,
  exportCsv,
  importCandidates,
  resetAllData,
  restoreBackup,
} from '../dataService';

let db: SqlDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, makeAccount({ id: 'cash', name: 'Cash', currency: 'USD' }));
});

afterEach(async () => {
  await db.close();
});

it('imports CSV rows and creates each new category once', async () => {
  const rows = parseCsv(
    'date,amount,category,note\n2026-03-01,-12.50,Coffee,latte\n2026-03-02,-3,coffee,\n2026-03-03,100,Salary,',
  );
  const context = { accounts: await listAccounts(db), categories: await listCategories(db) };
  const validation = validateImport(
    rows,
    guessMapping(rows[0] ?? []),
    { hasHeader: true, dateFormat: 'iso', decimalSeparator: '.', defaultAccountId: 'cash' },
    context,
  );
  expect(validation.errors).toEqual([]);

  expect(await importCandidates(db, validation.candidates)).toBe(3);
  const categories = await listCategories(db);
  expect(categories.map((c) => `${c.type}:${c.name}`).sort()).toEqual([
    'expense:Coffee',
    'income:Salary',
  ]);
  const txs = await listAllTransactions(db);
  expect(txs.map((t) => t.amount)).toEqual([1250, 300, 10000]);
  const coffee = categories.find((c) => c.name === 'Coffee');
  expect(txs.filter((t) => t.categoryId === coffee?.id)).toHaveLength(2);
});

it('round-trips exports: JSON restores everything, CSV keeps a stable header', async () => {
  await insertTransaction(db, makeTransaction({ accountId: 'cash', amount: 4200, note: '=cmd' }));
  const csv = await exportCsv(db);
  expect(csv.split('\n')[0]).toContain('date,type,amount,currency,account');
  expect(csv).toContain("'=cmd");

  const json = await exportBackupJson(db);
  const parsed = parseBackup(json);
  if (!parsed.ok) throw new Error('backup did not parse');

  await resetAllData(db, { currency: 'EUR', accountName: 'Wallet', categoryName: (k) => k });
  expect((await listAccounts(db)).map((a) => a.name)).toEqual(['Wallet']);
  expect((await loadSettings(db)).defaultCurrency).toBe('EUR');
  expect(await listAllTransactions(db)).toEqual([]);

  await restoreBackup(db, parsed.value);
  expect((await listAccounts(db)).map((a) => a.id)).toEqual(['cash']);
  expect((await listAllTransactions(db)).map((t) => t.amount)).toEqual([4200]);
});

it('never changes this device lock settings when restoring', async () => {
  await saveSettings(db, { passcodeEnabled: false });
  const json = await exportBackupJson(db);
  const parsed = parseBackup(json);
  if (!parsed.ok) throw new Error('backup did not parse');
  const tampered = {
    ...parsed.value,
    data: {
      ...parsed.value.data,
      settings: { ...parsed.value.data.settings, passcodeEnabled: true },
    },
  };
  await restoreBackup(db, tampered);
  expect((await loadSettings(db)).passcodeEnabled).toBe(false);
});
