import { loadSettings, saveSettings } from '@/db/repositories/settingsRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { logger } from '@/utils/logger';

import { runBudgetAlerts } from './budgetAlertService';
import { runBudgetLeftoverTransfers } from './leftoverService';
import { generateDueTransactions } from './recurringService';
import { syncReminders } from './reminderService';

export interface MaintenanceOptions {
  source: 'launch' | 'foreground' | 'background';
  now?: Date;
}

/** Work that must happen on app open and periodically in the background. */
export async function runMaintenance(
  db: SqlDatabase,
  { source, now = new Date() }: MaintenanceOptions,
): Promise<number> {
  const { created, failedRules } = await generateDueTransactions(db, now);
  if (created > 0 || failedRules > 0)
    logger.info(`Recurring (${source}): ${created} created, ${failedRules} failed`);
  const carried = await moveBudgetLeftover(db, now).catch((error: unknown) => {
    logger.warn('Moving the budget leftover failed', error);
    return 0;
  });
  if (carried > 0) logger.info(`Budget leftover (${source}): ${carried} deposits`);
  await runBudgetAlerts(db);
  await syncReminders(db, now);
  return created + carried;
}

async function moveBudgetLeftover(db: SqlDatabase, now: Date): Promise<number> {
  const settings = await loadSettings(db);
  const { created, lastMonth } = await runBudgetLeftoverTransfers(db, settings, now);
  if (lastMonth !== settings.budgetLeftoverLastMonth) {
    await saveSettings(db, { budgetLeftoverLastMonth: lastMonth });
  }
  return created;
}
