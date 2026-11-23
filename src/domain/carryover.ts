import type { AggregatableTransaction } from './aggregation';
import { monthPeriodKey, type Period, periodContaining, shiftPeriod } from './periods';
import type { FundEntry, MinorUnits } from './types';

/** Budget leftovers roll forward through at most this many months. */
export const MAX_ROLLOVER_MONTHS = 12;

/**
 * Budget months from the one keyed `since` up to the month containing `now`, oldest first and
 * capped at `max`. Without `since`, only the current month.
 */
export function budgetMonthsSince(
  since: string | null,
  now: Date,
  firstDayOfMonth: number,
  max: number = MAX_ROLLOVER_MONTHS,
): Period[] {
  const options = { firstDayOfWeek: 1 as const, firstDayOfMonth };
  let period = periodContaining('month', now, options);
  const months = [period];
  if (!since) return months;
  while (months.length < max) {
    const previous = shiftPeriod(period, -1, options);
    if (!previous.start || monthPeriodKey(previous.start, firstDayOfMonth) < since) break;
    months.unshift(previous);
    period = previous;
  }
  return months;
}

export function leftoverOf(limit: MinorUnits, spent: MinorUnits): MinorUnits {
  return Math.max(0, limit - spent);
}

/**
 * Limits of consecutive months when each month's unspent budget is added to the next one.
 * Overspending never reduces the next month below `base`.
 */
export function rolledLimits(base: MinorUnits, spentPerMonth: readonly MinorUnits[]): MinorUnits[] {
  const limits: MinorUnits[] = [];
  spentPerMonth.forEach((_, i) => {
    const previous = limits[i - 1];
    const spentBefore = spentPerMonth[i - 1] ?? 0;
    limits.push(previous === undefined ? base : base + leftoverOf(previous, spentBefore));
  });
  return limits;
}

/** Fund deposits taken from accounts, shaped as transfers that leave the account. */
export function depositsAsOutflows(entries: readonly FundEntry[]): AggregatableTransaction[] {
  return entries.flatMap((e) =>
    e.type === 'deposit' && e.accountId
      ? [
          {
            type: 'transfer' as const,
            amount: e.amount,
            toAmount: null,
            accountId: e.accountId,
            toAccountId: null,
            categoryId: null,
            date: e.date,
          },
        ]
      : [],
  );
}
