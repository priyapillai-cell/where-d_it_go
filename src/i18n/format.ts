import { differenceInCalendarDays } from 'date-fns';

import { formatMoney, type SignDisplay } from '@/domain/money';
import type { Period } from '@/domain/periods';
import { assertNever, type MinorUnits } from '@/domain/types';

import { getFormattingLocale, t } from './index';

export function money(
  amount: MinorUnits,
  currency: string,
  signDisplay: SignDisplay = 'auto',
): string {
  return formatMoney(amount, currency, { locale: getFormattingLocale(), signDisplay });
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${getFormattingLocale()}|${JSON.stringify(options)}`;
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(getFormattingLocale(), options);
    dateFormatters.set(key, f);
  }
  return f;
}

export type DateStyle =
  | 'short'
  | 'medium'
  | 'long'
  | 'monthYear'
  | 'monthShort'
  | 'year'
  | 'time'
  | 'dayMonth'
  | 'weekday';

const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  monthShort: { month: 'short', year: '2-digit' },
  year: { year: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  dayMonth: { day: 'numeric', month: 'long' },
  weekday: { weekday: 'long' },
};

export function formatDate(date: Date, style: DateStyle = 'medium'): string {
  if (Number.isNaN(date.getTime())) return '';
  return formatter(STYLES[style]).format(date);
}

/** "Today", "Yesterday" or a full date, used for list section headers. */
export function formatRelativeDay(date: Date, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(now, date);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yesterday');
  return formatDate(date, 'long');
}

/** Compact chip label: "Today", "Yesterday" or "4 Nov 2026". */
export function formatShortRelative(date: Date, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(now, date);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yesterday');
  return formatDate(date, 'medium');
}

export function formatPeriod(period: Period): string {
  const { start, end } = period;
  switch (period.kind) {
    case 'all':
      return t('periods.allTime');
    case 'day':
      return start ? formatRelativeDay(start) : '';
    case 'month':
      if (start && start.getDate() === 1) return formatDate(start, 'monthYear');
      return start && end ? formatRange(start, end) : '';
    case 'year':
      return start ? formatDate(start, 'year') : '';
    case 'week':
    case 'custom':
      return start && end ? formatRange(start, end) : '';
    default:
      return assertNever(period.kind);
  }
}

function formatRange(start: Date, endExclusive: Date): string {
  const last = new Date(endExclusive.getTime() - 1);
  const sameYear = start.getFullYear() === last.getFullYear();
  const style: DateStyle = sameYear ? 'short' : 'medium';
  return `${formatDate(start, style)} – ${formatDate(last, 'medium')}`;
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞';
  return new Intl.NumberFormat(getFormattingLocale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}
