import { listAccounts } from '@/db/repositories/accountRepository';
import { listCategories } from '@/db/repositories/categoryRepository';
import { listRecurringRules } from '@/db/repositories/recurringRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { nextReminder } from '@/domain/recurrence';
import { t } from '@/i18n';
import { formatDate, money } from '@/i18n/format';
import { logger } from '@/utils/logger';

import { cancelScheduled, scheduleAt, scheduledIdentifiers } from './notificationService';

const PREFIX = 'recurring-';

export function reminderIdentifier(ruleId: string): string {
  return `${PREFIX}${ruleId}`;
}

/**
 * Keeps exactly one scheduled reminder per rule that has one, for its next occurrence.
 * Idempotent: identifiers are stable, so re-running replaces rather than duplicates.
 */
export async function syncReminders(db: SqlDatabase, now: Date = new Date()): Promise<void> {
  try {
    const [rules, accounts, categories] = await Promise.all([
      listRecurringRules(db),
      listAccounts(db),
      listCategories(db),
    ]);
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const wanted = new Set<string>();

    for (const rule of rules) {
      const identifier = reminderIdentifier(rule.id);
      const next = nextReminder(rule, now);
      if (!next) {
        await cancelScheduled(identifier);
        continue;
      }
      wanted.add(identifier);
      const name =
        rule.note || (rule.categoryId ? categoryName.get(rule.categoryId) : undefined) || '';
      await scheduleAt(
        identifier,
        next.at,
        t('recurring.reminderTitle'),
        t('recurring.reminderBody', {
          name,
          amount: money(rule.amount, currencyOf.get(rule.accountId) ?? 'USD'),
          date: formatDate(next.occurrence, 'long'),
        }),
      );
    }

    for (const identifier of await scheduledIdentifiers()) {
      if (identifier.startsWith(PREFIX) && !wanted.has(identifier)) {
        await cancelScheduled(identifier);
      }
    }
  } catch (error) {
    logger.warn('Syncing reminders failed', error);
  }
}
