import type { BackupData } from '@/domain/backup';

import type { SqlExecutor } from '../sqlDatabase';
import { insertAccount, listAccounts } from './accountRepository';
import { listBudgets, upsertBudget } from './budgetRepository';
import { insertCategory, listCategories } from './categoryRepository';
import { insertRecurringRule, listRecurringRules } from './recurringRepository';
import { loadSettings, saveSettings } from './settingsRepository';
import { insertTransaction, listAllTransactions } from './transactionRepository';

export async function dumpAll(db: SqlExecutor): Promise<BackupData> {
  return {
    accounts: await listAccounts(db),
    categories: await listCategories(db),
    transactions: await listAllTransactions(db),
    recurringRules: await listRecurringRules(db),
    budgets: await listBudgets(db),
    settings: await loadSettings(db),
  };
}

/** Deletes every row in dependency order. Must be called inside a transaction. */
export async function wipeAll(db: SqlExecutor): Promise<void> {
  await db.exec(`
    DELETE FROM budget_alerts;
    DELETE FROM budgets;
    DELETE FROM transactions;
    DELETE FROM recurring_rules;
    DELETE FROM categories;
    DELETE FROM accounts;
    DELETE FROM settings;
  `);
}

/** Replaces all data with a validated backup. Must be called inside a transaction. */
export async function replaceAll(db: SqlExecutor, data: BackupData): Promise<void> {
  await wipeAll(db);
  for (const a of data.accounts) await insertAccount(db, a);
  for (const c of data.categories) await insertCategory(db, c);
  for (const r of data.recurringRules) await insertRecurringRule(db, r);
  for (const t of data.transactions) await insertTransaction(db, t);
  for (const b of data.budgets) await upsertBudget(db, b);
  await saveSettings(db, data.settings);
}
