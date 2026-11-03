import type { Frequency } from '@/domain/types';
import { t } from '@/i18n';

export const REMINDER_CHOICES: readonly (number | null)[] = [null, 0, 1, 2, 3, 7];

export function frequencyLabel(frequency: Frequency, interval: number): string {
  return interval === 1
    ? t(`recurring.${frequency}`)
    : t(`recurring.everyN.${frequency}`, { count: interval });
}

export function reminderLabel(days: number | null): string {
  if (days === null) return t('recurring.reminderNone');
  if (days === 0) return t('recurring.reminderSameDay');
  if (days === 1) return t('recurring.reminderDay');
  return t('recurring.reminderDays', { count: days });
}
