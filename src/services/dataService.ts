import { listAccounts } from '@/db/repositories/accountRepository';
import {
  insertCategory,
  listCategories,
  nextCategorySortOrder,
} from '@/db/repositories/categoryRepository';
import { dumpAll, replaceAll, wipeAll } from '@/db/repositories/dataRepository';
import { loadSettings, saveSettings } from '@/db/repositories/settingsRepository';
import { insertTransaction, listAllTransactions } from '@/db/repositories/transactionRepository';
import { type SeedOptions, seedDefaults } from '@/db/seed';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { type BackupFile, createBackup } from '@/domain/backup';
import { transactionsToCsv } from '@/domain/csvExport';
import type { ImportCandidate } from '@/domain/csvImport';
import { PALETTE } from '@/domain/palette';
import { newId } from '@/utils/id';

/**
 * Inserts validated import rows in one transaction, creating any new categories first.
 * Either every row is imported or none is.
 */
export async function importCandidates(
  db: SqlDatabase,
  candidates: readonly ImportCandidate[],
  now: Date = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const created = new Map<string, string>();
    const existing = await listCategories(tx);
    for (const candidate of candidates) {
      const pending = candidate.newCategory;
      if (!pending) continue;
      const key = `${pending.type}:${pending.name.toLocaleLowerCase()}`;
      if (created.has(key)) continue;
      const match = existing.find(
        (c) =>
          c.type === pending.type &&
          c.name.toLocaleLowerCase() === pending.name.toLocaleLowerCase(),
      );
      if (match) {
        created.set(key, match.id);
        continue;
      }
      const id = newId();
      await insertCategory(tx, {
        id,
        name: pending.name,
        type: pending.type,
        icon: 'shape-outline',
        color: PALETTE[created.size % PALETTE.length] ?? '#757575',
        sortOrder: await nextCategorySortOrder(tx, pending.type),
        isArchived: false,
      });
      created.set(key, id);
    }

    const nowIso = now.toISOString();
    for (const candidate of candidates) {
      const pending = candidate.newCategory;
      const categoryId = pending
        ? (created.get(`${pending.type}:${pending.name.toLocaleLowerCase()}`) ?? null)
        : candidate.categoryId;
      await insertTransaction(tx, {
        id: newId(),
        type: candidate.type,
        amount: candidate.amount,
        toAmount: candidate.toAmount,
        accountId: candidate.accountId,
        toAccountId: candidate.toAccountId,
        categoryId: candidate.type === 'transfer' ? null : categoryId,
        note: candidate.note,
        date: candidate.date,
        createdAt: nowIso,
        updatedAt: nowIso,
        recurringRuleId: null,
        occurrenceKey: null,
      });
    }
    return candidates.length;
  });
}

/**
 * Replaces all data with a parsed backup. Lock settings stay as they are on this device:
 * the passcode lives in this device's secure store, so a backup must never enable or
 * disable it.
 */
export async function restoreBackup(db: SqlDatabase, backup: BackupFile): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await loadSettings(tx);
    await replaceAll(tx, backup.data);
    await saveSettings(tx, {
      passcodeEnabled: current.passcodeEnabled,
      biometricsEnabled: current.biometricsEnabled,
    });
  });
}

/** Wipes every table and re-creates the first-run defaults in one transaction. */
export async function resetAllData(db: SqlDatabase, seed: SeedOptions): Promise<void> {
  await db.transaction(async (tx) => {
    await wipeAll(tx);
    await seedDefaults(tx, seed);
    await saveSettings(tx, { defaultCurrency: seed.currency });
  });
}

export async function exportCsv(db: SqlDatabase): Promise<string> {
  const [transactions, accounts, categories] = await Promise.all([
    listAllTransactions(db),
    listAccounts(db),
    listCategories(db),
  ]);
  return transactionsToCsv(transactions, accounts, categories);
}

export async function exportBackupJson(db: SqlDatabase, now: Date = new Date()): Promise<string> {
  return JSON.stringify(createBackup(await dumpAll(db), now), null, 2);
}
