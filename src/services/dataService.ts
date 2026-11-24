import { clearSyncLog } from '@/db/repositories/syncRepository';
import { listAccounts } from '@/db/repositories/accountRepository';
import {
  insertCategory,
  listCategories,
  nextCategorySortOrder,
} from '@/db/repositories/categoryRepository';
import { dumpAll, replaceAll, wipeAll } from '@/db/repositories/dataRepository';
import {
  listAllFundEntries,
  listFunds,
  nextFundSortOrder,
  upsertFund,
  upsertFundEntry,
} from '@/db/repositories/fundRepository';
import { loadSettings, saveSettings } from '@/db/repositories/settingsRepository';
import { insertTransaction, listAllTransactions } from '@/db/repositories/transactionRepository';
import { type SeedOptions, seedDefaults } from '@/db/seed';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { type BackupFile, createBackup } from '@/domain/backup';
import { transactionsToCsv } from '@/domain/csvExport';
import type { FundImportCandidate, ImportCandidate } from '@/domain/csvImport';
import { buildExcelSheets, type ExcelExportLabels } from '@/domain/excelExport';
import { PALETTE } from '@/domain/palette';
import { buildXlsx } from '@/domain/xlsx';
import { newId } from '@/utils/id';

/**
 * Inserts validated import rows in one transaction, creating any new categories and sinking
 * fund categories first. Either every row is imported or none is.
 */
export async function importCandidates(
  db: SqlDatabase,
  candidates: readonly ImportCandidate[],
  now: Date = new Date(),
  fundCandidates: readonly FundImportCandidate[] = [],
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

    const funds = new Map(
      (await listFunds(tx)).map((f) => [f.name.toLocaleLowerCase(), f.id] as const),
    );
    for (const entry of fundCandidates) {
      let fundId = entry.fundId;
      if (!fundId && entry.newFundName) {
        const key = entry.newFundName.toLocaleLowerCase();
        fundId = funds.get(key) ?? null;
        if (!fundId) {
          fundId = newId();
          await upsertFund(tx, {
            id: fundId,
            name: entry.newFundName,
            icon: 'piggy-bank-outline',
            color: PALETTE[funds.size % PALETTE.length] ?? '#757575',
            currency: entry.currency,
            targetAmount: null,
            targetDate: null,
            monthlyContribution: null,
            isArchived: false,
            sortOrder: await nextFundSortOrder(tx),
            createdAt: nowIso,
          });
          funds.set(key, fundId);
        }
      }
      if (!fundId) continue;
      await upsertFundEntry(tx, {
        id: newId(),
        fundId,
        type: entry.type,
        amount: entry.amount,
        note: entry.note,
        date: entry.date,
        accountId: entry.accountId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return candidates.length + fundCandidates.length;
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

/**
 * Wipes every table and re-creates the first-run defaults in one transaction. The sync change
 * log is cleared too, so a later Google Drive connection does not delete the Drive copy.
 */
export async function resetAllData(db: SqlDatabase, seed: SeedOptions): Promise<void> {
  await db.transaction(async (tx) => {
    await wipeAll(tx);
    await clearSyncLog(tx);
    await seedDefaults(tx, seed);
    await saveSettings(tx, { defaultCurrency: seed.currency });
  });
}

export async function exportCsv(db: SqlDatabase): Promise<string> {
  const [transactions, accounts, categories, funds, entries] = await Promise.all([
    listAllTransactions(db),
    listAccounts(db),
    listCategories(db),
    listFunds(db),
    listAllFundEntries(db),
  ]);
  return transactionsToCsv(transactions, accounts, categories, { funds, entries });
}

export async function exportExcel(
  db: SqlDatabase,
  labels: ExcelExportLabels,
  now: Date = new Date(),
): Promise<Uint8Array> {
  const [transactions, accounts, categories, sinkingFunds, fundEntries] = await Promise.all([
    listAllTransactions(db),
    listAccounts(db),
    listCategories(db),
    listFunds(db),
    listAllFundEntries(db),
  ]);
  return buildXlsx(
    buildExcelSheets(
      { transactions, accounts, categories, sinkingFunds, fundEntries },
      labels,
      now,
    ),
    now,
  );
}

export async function exportBackupJson(db: SqlDatabase, now: Date = new Date()): Promise<string> {
  return JSON.stringify(createBackup(await dumpAll(db), now), null, 2);
}
