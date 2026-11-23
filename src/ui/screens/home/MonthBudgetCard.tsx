import { router } from 'expo-router';
import { useState } from 'react';

import { t } from '@/i18n';
import { formatPeriod } from '@/i18n/format';
import { loadMainMonthBudget } from '@/services/leftoverService';
import { useAppStore } from '@/state/appStore';

import { useDbQuery } from '../../hooks/useDbQuery';
import { BudgetSummaryCard } from '../budgets/BudgetSummaryCard';

/** This month's budget in the overview's currency; renders nothing when no budget is set. */
export function MonthBudgetCard({ currency }: { currency: string }) {
  const settings = useAppStore((s) => s.settings);
  const [now] = useState(() => new Date());
  const { firstDayOfMonth, budgetLeftover, budgetLeftoverSince } = settings;
  const { data } = useDbQuery(
    `home-budget|${currency}|${firstDayOfMonth}|${budgetLeftover}|${budgetLeftoverSince}|${now.toDateString()}`,
    (db) =>
      loadMainMonthBudget(db, now, {
        defaultCurrency: currency,
        firstDayOfMonth,
        budgetLeftover,
        budgetLeftoverSince,
      }),
  );
  if (!data) return null;

  const month = formatPeriod(data.period);
  return (
    <BudgetSummaryCard
      title={
        data.source === 'overall'
          ? t('home.monthBudget', { month })
          : t('home.monthBudgetCategories', { month })
      }
      icon="wallet-outline"
      budget={data}
      currency={currency}
      hint={t('home.monthBudgetHint')}
      onPress={() => router.push('/budgets')}
    />
  );
}
