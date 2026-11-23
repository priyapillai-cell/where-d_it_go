import { addMonths, startOfMonth } from 'date-fns';

import type { FundEntry, FundEntryType, MinorUnits, SinkingFund } from './types';

export type FundStatus = 'noTarget' | 'reached' | 'inProgress' | 'onTrack' | 'behind' | 'overdue';

export interface FundSummary {
  deposited: MinorUnits;
  spent: MinorUnits;
  /** deposited − spent; can go negative if more was spent than set aside. */
  balance: MinorUnits;
  depositedThisMonth: MinorUnits;
  /** balance / target, clamped to 0..1; `null` without a target. */
  progress: number | null;
  /** Amount still missing to reach the target; `null` without a target. */
  remaining: MinorUnits | null;
  /** Calendar months left until the target month, at least 1; `null` without a target date. */
  monthsLeft: number | null;
  /** Monthly amount that reaches the target on time; `null` without a target and date. */
  neededPerMonth: MinorUnits | null;
  status: FundStatus;
}

/** Parses a YYYY-MM-DD calendar day as local midnight; `null` if malformed. */
export function parseCalendarDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(year, month - 1, date);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== date) {
    return null;
  }
  return value;
}

export function toCalendarDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Months from `now`'s month to the target's month, counting the current month (min 1). */
export function monthsUntil(now: Date, target: Date): number {
  const diff =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(1, diff + 1);
}

export function summarizeFund(
  fund: Pick<SinkingFund, 'targetAmount' | 'targetDate' | 'monthlyContribution'>,
  entries: readonly Pick<FundEntry, 'type' | 'amount' | 'date'>[],
  now: Date,
): FundSummary {
  let deposited = 0;
  let spent = 0;
  let depositedThisMonth = 0;
  for (const entry of entries) {
    if (entry.type === 'deposit') {
      deposited += entry.amount;
      const date = new Date(entry.date);
      if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
        depositedThisMonth += entry.amount;
      }
    } else {
      spent += entry.amount;
    }
  }
  const balance = deposited - spent;
  const base = { deposited, spent, balance, depositedThisMonth };

  const target = fund.targetAmount;
  if (target === null || target <= 0) {
    return {
      ...base,
      progress: null,
      remaining: null,
      monthsLeft: null,
      neededPerMonth: null,
      status: 'noTarget',
    };
  }

  const remaining = Math.max(0, target - balance);
  const progress = Math.min(1, Math.max(0, balance / target));
  const targetDay = fund.targetDate ? parseCalendarDay(fund.targetDate) : null;

  if (remaining === 0) {
    return {
      ...base,
      progress,
      remaining,
      monthsLeft: targetDay ? monthsUntil(now, targetDay) : null,
      neededPerMonth: 0,
      status: 'reached',
    };
  }
  if (!targetDay) {
    return {
      ...base,
      progress,
      remaining,
      monthsLeft: null,
      neededPerMonth: null,
      status: 'inProgress',
    };
  }
  if (targetDay < startOfDay(now)) {
    return {
      ...base,
      progress,
      remaining,
      monthsLeft: 0,
      neededPerMonth: remaining,
      status: 'overdue',
    };
  }

  const monthsLeft = monthsUntil(now, targetDay);
  const neededPerMonth = Math.ceil(remaining / monthsLeft);
  const planned = fund.monthlyContribution;
  const status: FundStatus =
    planned === null ? 'inProgress' : planned >= neededPerMonth ? 'onTrack' : 'behind';
  return { ...base, progress, remaining, monthsLeft, neededPerMonth, status };
}

/** Sum of fund balances per currency (funds in different currencies are never added). */
export function fundTotalsByCurrency(
  funds: readonly Pick<SinkingFund, 'id' | 'currency' | 'isArchived'>[],
  balances: ReadonlyMap<string, MinorUnits>,
): { currency: string; balance: MinorUnits }[] {
  const totals = new Map<string, MinorUnits>();
  for (const fund of funds) {
    if (fund.isArchived) continue;
    totals.set(fund.currency, (totals.get(fund.currency) ?? 0) + (balances.get(fund.id) ?? 0));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, balance]) => ({ currency, balance }));
}

export interface FundMonth {
  start: Date;
  added: MinorUnits;
  spent: MinorUnits;
  /** Balance at the end of the month, counting everything before it. */
  balance: MinorUnits;
}

/** The last `months` calendar months of the given entries, oldest first, for charts. */
export function fundMonthlyHistory(
  entries: readonly Pick<FundEntry, 'type' | 'amount' | 'date'>[],
  now: Date,
  months = 6,
): FundMonth[] {
  const first = addMonths(startOfMonth(now), -(months - 1));
  const history: FundMonth[] = Array.from({ length: months }, (_, i) => ({
    start: addMonths(first, i),
    added: 0,
    spent: 0,
    balance: 0,
  }));
  let opening = 0;
  for (const entry of entries) {
    const date = new Date(entry.date);
    const signed = entry.type === 'deposit' ? entry.amount : -entry.amount;
    if (date < first) {
      opening += signed;
      continue;
    }
    const index =
      (date.getFullYear() - first.getFullYear()) * 12 + date.getMonth() - first.getMonth();
    const month = history[index];
    if (!month) continue;
    if (entry.type === 'deposit') month.added += entry.amount;
    else month.spent += entry.amount;
  }
  let running = opening;
  for (const month of history) {
    running += month.added - month.spent;
    month.balance = running;
  }
  return history;
}

/** Totals of one entry type per fund within a date range (`from <= date < to`). */
export function totalsByFund(
  entries: readonly Pick<FundEntry, 'fundId' | 'type' | 'amount' | 'date'>[],
  type: FundEntryType,
  from: Date,
  to: Date,
): Map<string, MinorUnits> {
  const totals = new Map<string, MinorUnits>();
  for (const entry of entries) {
    if (entry.type !== type) continue;
    const date = new Date(entry.date);
    if (date < from || date >= to) continue;
    totals.set(entry.fundId, (totals.get(entry.fundId) ?? 0) + entry.amount);
  }
  return totals;
}
