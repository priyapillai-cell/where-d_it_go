import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  setHours,
  setMinutes,
  startOfMinute,
} from 'date-fns';

import type { RecurringRule, Transaction } from './types';

type ScheduleFields = Pick<RecurringRule, 'frequency' | 'interval' | 'startDate' | 'endDate'>;

/** Safety cap so a misconfigured rule (e.g. daily since 1970) can never stall the app. */
export const MAX_OCCURRENCES_PER_RUN = 1000;
const MAX_ITERATIONS = 100_000;

function safeInterval(interval: number): number {
  return Number.isInteger(interval) && interval >= 1 ? Math.min(interval, 1000) : 1;
}

/**
 * The n-th occurrence (n = 0 is the start). Always computed from the anchor date, so a
 * monthly rule starting on Jan 31 yields Feb 28/29, Mar 31, Apr 30 – no cumulative drift.
 */
export function occurrenceAt(rule: ScheduleFields, n: number): Date {
  const start = new Date(rule.startDate);
  const step = n * safeInterval(rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return addDays(start, step);
    case 'weekly':
      return addWeeks(start, step);
    case 'monthly':
      return addMonths(start, step);
    case 'yearly':
      return addYears(start, step);
    default: {
      const unreachable: never = rule.frequency;
      throw new Error(`Unknown frequency ${String(unreachable)}`);
    }
  }
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** Occurrence key used for idempotent inserts: the ISO timestamp of the scheduled date. */
export function occurrenceKey(date: Date): string {
  return date.toISOString();
}

/**
 * Occurrences that are due (<= now), after the rule's watermark and within its end date,
 * oldest first. Pure: calling it twice with the same inputs yields the same dates, and once
 * `lastGeneratedAt` has advanced, already-generated dates are never returned again.
 */
export function dueOccurrences(
  rule: ScheduleFields & Pick<RecurringRule, 'lastGeneratedAt' | 'isActive'>,
  now: Date,
  limit: number = MAX_OCCURRENCES_PER_RUN,
): Date[] {
  if (!rule.isActive) return [];
  const start = new Date(rule.startDate);
  if (!isValidDate(start) || start > now) return [];
  const end = rule.endDate ? new Date(rule.endDate) : null;
  const watermark = rule.lastGeneratedAt ? new Date(rule.lastGeneratedAt) : null;

  const due: Date[] = [];
  for (let n = 0; n < MAX_ITERATIONS && due.length < limit; n += 1) {
    const date = occurrenceAt(rule, n);
    if (date > now) break;
    if (end && isValidDate(end) && date > end) break;
    if (watermark && isValidDate(watermark) && date <= watermark) continue;
    due.push(date);
  }
  return due;
}

/** First occurrence strictly after `after`, or null if the rule has ended. */
export function nextOccurrence(rule: ScheduleFields, after: Date): Date | null {
  const start = new Date(rule.startDate);
  if (!isValidDate(start)) return null;
  const end = rule.endDate ? new Date(rule.endDate) : null;
  for (let n = 0; n < MAX_ITERATIONS; n += 1) {
    const date = occurrenceAt(rule, n);
    if (end && isValidDate(end) && date > end) return null;
    if (date > after) return date;
  }
  return null;
}

/** When to fire a reminder for an occurrence: N days earlier at 09:00 local time. */
export function reminderTime(occurrence: Date, daysBefore: number): Date {
  return startOfMinute(setMinutes(setHours(addDays(occurrence, -Math.max(0, daysBefore)), 9), 0));
}

export function transactionFromRule(
  rule: RecurringRule,
  occurrence: Date,
  id: string,
  nowIso: string,
): Transaction {
  return {
    id,
    type: rule.type,
    amount: rule.amount,
    toAmount: rule.type === 'transfer' ? rule.toAmount : null,
    accountId: rule.accountId,
    toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
    categoryId: rule.type === 'transfer' ? null : rule.categoryId,
    note: rule.note,
    date: occurrence.toISOString(),
    createdAt: nowIso,
    updatedAt: nowIso,
    recurringRuleId: rule.id,
    occurrenceKey: occurrenceKey(occurrence),
  };
}
