import { addMonths, format, startOfMonth } from 'date-fns';

import type { AggregatableTransaction } from './aggregation';
import { assertNever, type FundAutoMode, type FundEntry, type MinorUnits } from './types';

/** A device that was off for longer catches up this many months at most. */
export const MAX_CATCH_UP_MONTHS = 24;

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

/** Local midnight on the 1st of a `YYYY-MM` month. */
export function monthStart(key: string): Date {
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, 1);
}

/**
 * Months after `lastMonth` whose 1st has arrived, oldest first. Carryover for month M happens
 * on the 1st of M; with the `leftover` mode it moves what was left from month M − 1.
 */
export function dueCarryoverMonths(
  lastMonth: string | null,
  now: Date,
  max: number = MAX_CATCH_UP_MONTHS,
): string[] {
  if (!lastMonth) return [];
  const current = startOfMonth(now);
  const months: string[] = [];
  for (let cursor = addMonths(monthStart(lastMonth), 1); cursor <= current;) {
    months.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months.slice(-max);
}

/**
 * Amount to move for one month. `leftover` takes the account's net gain of the previous month,
 * minus what other funds already took from it this month, and never goes below zero.
 */
export function carryoverAmount(
  mode: FundAutoMode,
  monthlyContribution: MinorUnits | null,
  previousMonthNet: MinorUnits,
  alreadyTaken: MinorUnits,
): MinorUnits {
  switch (mode) {
    case 'fixed':
      return monthlyContribution ?? 0;
    case 'leftover':
      return Math.max(0, previousMonthNet - alreadyTaken);
    default:
      return assertNever(mode);
  }
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
