import type { SqlDatabase } from '@/db/sqlDatabase';
import { logger } from '@/utils/logger';

import { runBudgetAlerts } from './budgetAlertService';
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
  await runBudgetAlerts(db);
  await syncReminders(db, now);
  return created;
}
