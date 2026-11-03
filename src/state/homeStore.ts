import { create } from 'zustand';

import {
  customPeriod,
  type Period,
  type PeriodKind,
  type PeriodOptions,
  periodContaining,
  shiftPeriod,
} from '@/domain/periods';
import type { CategoryType } from '@/domain/types';

export const ALL_ACCOUNTS = 'all';

interface PeriodState {
  period: Period;
  setKind: (kind: Exclude<PeriodKind, 'custom'>, options: PeriodOptions) => void;
  setCustom: (from: Date, to: Date) => void;
  shift: (direction: 1 | -1, options: PeriodOptions) => void;
  /** Recomputes bounds after first-day-of-week/month settings change. */
  realign: (options: PeriodOptions) => void;
}

function periodSlice(set: (fn: (s: PeriodState) => Partial<PeriodState>) => void): PeriodState {
  return {
    period: periodContaining('month', new Date(), { firstDayOfWeek: 1, firstDayOfMonth: 1 }),
    setKind: (kind, options) =>
      set(() => ({ period: periodContaining(kind, new Date(), options) })),
    setCustom: (from, to) => set(() => ({ period: customPeriod(from, to) })),
    shift: (direction, options) =>
      set((s) => ({ period: shiftPeriod(s.period, direction, options) })),
    realign: (options) =>
      set((s) =>
        s.period.kind === 'custom' || s.period.kind === 'all'
          ? {}
          : { period: periodContaining(s.period.kind, s.period.start ?? new Date(), options) },
      ),
  };
}

interface HomeState extends PeriodState {
  accountId: string;
  chartType: CategoryType;
  setAccountId: (id: string) => void;
  toggleChartType: () => void;
}

export const useHomeStore = create<HomeState>((set) => ({
  ...periodSlice(set),
  accountId: ALL_ACCOUNTS,
  chartType: 'expense',
  setAccountId: (accountId) => set({ accountId }),
  toggleChartType: () =>
    set((s) => ({ chartType: s.chartType === 'expense' ? 'income' : 'expense' })),
}));

interface ReportsState extends PeriodState {
  accountId: string;
  setAccountId: (id: string) => void;
}

export const useReportsStore = create<ReportsState>((set) => ({
  ...periodSlice(set),
  accountId: ALL_ACCOUNTS,
  setAccountId: (accountId) => set({ accountId }),
}));
