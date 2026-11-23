import { addDays, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

import type { WeekStart } from './types';

export interface CalendarDay {
  date: Date;
  inMonth: boolean;
  disabled: boolean;
}

/**
 * The weeks shown for `month`: always six rows so the grid keeps its height while navigating,
 * padded with days from the neighbouring months.
 */
export function calendarWeeks(
  month: Date,
  weekStartsOn: WeekStart,
  minimumDate?: Date,
  maximumDate?: Date,
): CalendarDay[][] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn });
  const min = minimumDate ? startOfDay(minimumDate) : null;
  const max = maximumDate ? startOfDay(maximumDate) : null;
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(first, w * 7 + d);
      week.push({
        date,
        inMonth: isSameMonth(date, month),
        disabled: (min !== null && date < min) || (max !== null && date > max),
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekday indexes (0 = Sunday) in display order. */
export function weekdayOrder(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
}
