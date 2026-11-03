import { listCategories } from '@/db/repositories/categoryRepository';
import { loadSettings } from '@/db/repositories/settingsRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';
import { money } from '@/i18n/format';
import { logger } from '@/utils/logger';

import { type BudgetAlert, collectBudgetAlerts } from './budgetService';
import { notifyNow } from './notificationService';

function alertText(alert: BudgetAlert, name: string): { title: string; body: string } {
  const { budget, progress, threshold } = alert;
  const limit = money(budget.amount, budget.currency);
  switch (threshold) {
    case 80:
      return {
        title: t('budgets.alertTitle80'),
        body: t('budgets.alertBody80', {
          name,
          percent: Math.round(progress.ratio * 100),
          limit,
        }),
      };
    case 100:
      return {
        title: t('budgets.alertTitle100'),
        body: t('budgets.alertBody100', {
          name,
          spent: money(progress.spent, budget.currency),
          limit,
        }),
      };
    default:
      return assertNever(threshold);
  }
}

let running: Promise<void> | null = null;
let rerun = false;

async function check(db: SqlDatabase, now: Date): Promise<void> {
  const settings = await loadSettings(db);
  const alerts = await collectBudgetAlerts(db, now, settings.firstDayOfMonth);
  if (alerts.length === 0) return;
  const categories = new Map((await listCategories(db)).map((c) => [c.id, c.name]));
  for (const alert of alerts) {
    const name =
      alert.budget.categoryId === null
        ? t('budgets.allExpenses')
        : (categories.get(alert.budget.categoryId) ?? t('budgets.allExpenses'));
    const { title, body } = alertText(alert, name);
    await notifyNow(title, body);
  }
}

/**
 * Sends local notifications for budgets that just crossed 80% or 100% this month. Calls made
 * while a check is running coalesce into one follow-up check so no write is missed.
 */
export function runBudgetAlerts(db: SqlDatabase): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        await check(db, new Date());
      } while (rerun);
    } catch (error) {
      logger.warn('Budget alert check failed', error);
    } finally {
      running = null;
    }
  })();
  return running;
}
