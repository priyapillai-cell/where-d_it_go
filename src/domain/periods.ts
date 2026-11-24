import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  startOfDay,
  startOfWeek,
  startOfYear,
} from 'date-fns';

import type { WeekStart } from './types';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';
export const PERIOD_KINDS: readonly PeriodKind[] = [
  'day',
  'week',
  'month',
  'year',
  'all',
  'custom',
];

/** Half-open local-time interval [start, end). `null` bounds mean unbounded ("All time"). */
export interface Period {
  kind: PeriodKind;
  start: Date | null;
  end: Date | null;
}

export interface PeriodOptions {
  firstDayOfWeek: WeekStart;
  firstDayOfMonth: number;
}

export const DEFAULT_PERIOD_OPTIONS: PeriodOptions = { firstDayOfWeek: 1, firstDayOfMonth: 1 };

function clampMonthStartDay(day: number): number {
  if (!Number.isInteger(day)) return 1;
  return Math.min(28, Math.max(1, day));
}

/** Start of the (possibly offset) month containing `date`, e.g. 15th..14th budgeting months. */
export function startOfCustomMonth(date: Date, firstDayOfMonth: number): Date {
  const day = clampMonthStartDay(firstDayOfMonth);
  const candidate = new Date(date.getFullYear(), date.getMonth(), day);
  return date.getDate() >= day ? candidate : addMonths(candidate, -1);
}

export function periodContaining(
  kind: Exclude<PeriodKind, 'custom'>,
  anchor: Date,
  options: PeriodOptions,
): Period {
  switch (kind) {
    case 'day': {
      const start = startOfDay(anchor);
      return { kind, start, end: addDays(start, 1) };
    }
    case 'week': {
      const start = startOfWeek(anchor, { weekStartsOn: options.firstDayOfWeek });
      return { kind, start, end: addWeeks(start, 1) };
    }
    case 'month': {
      const start = startOfCustomMonth(anchor, options.firstDayOfMonth);
      return { kind, start, end: addMonths(start, 1) };
    }
    case 'year': {
      const start = startOfYear(anchor);
      return { kind, start, end: addYears(start, 1) };
    }
    case 'all':
      return { kind, start: null, end: null };
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown period ${String(unreachable)}`);
    }
  }
}

/** Custom range covering whole local days from `from` through `to` inclusive. */
export function customPeriod(from: Date, to: Date): Period {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { kind: 'custom', start: startOfDay(a), end: addDays(startOfDay(b), 1) };
}

/** Moves a period one step back (-1) or forward (+1). Custom ranges move by their length. */
export function shiftPeriod(period: Period, direction: 1 | -1, options: PeriodOptions): Period {
  if (!period.start || !period.end) return period;
  switch (period.kind) {
    case 'day':
    case 'week':
    case 'month':
    case 'year': {
      const anchor =
        period.kind === 'day'
          ? addDays(period.start, direction)
          : period.kind === 'week'
            ? addWeeks(period.start, direction)
            : period.kind === 'month'
              ? addMonths(period.start, direction)
              : addYears(period.start, direction);
      return periodContaining(period.kind, anchor, options);
    }
    case 'custom': {
      const days = differenceInCalendarDays(period.end, period.start);
      return {
        kind: 'custom',
        start: addDays(period.start, days * direction),
        end: addDays(period.end, days * direction),
      };
    }
    case 'all':
      return period;
    default: {
      const unreachable: never = period.kind;
      throw new Error(`Unknown period ${String(unreachable)}`);
    }
  }
}

export function isInPeriod(date: Date, period: Period): boolean {
  if (period.start && date < period.start) return false;
  if (period.end && date >= period.end) return false;
  return true;
}

/** ISO bounds for SQL range queries; null means unbounded. */
export function periodToIsoRange(period: Period): { from: string | null; to: string | null } {
  return { from: period.start?.toISOString() ?? null, to: period.end?.toISOString() ?? null };
}

/** Stable identifier such as "2026-11" for a custom month; used for budget alert de-duplication. */
export function monthPeriodKey(date: Date, firstDayOfMonth: number): string {
  const start = startOfCustomMonth(date, firstDayOfMonth);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}

/** Local calendar day key "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
