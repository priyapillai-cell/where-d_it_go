import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { monthBudgetSummary } from '@/domain/budgets';
import { t } from '@/i18n';
import { formatPeriod, money } from '@/i18n/format';
import { loadBudgetOverview } from '@/services/budgetService';

import { AppText } from '../../components/AppText';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { statusPresentation } from '../budgets/budgetStatus';

/** This month's budget in the overview's currency; renders nothing when no budget is set. */
export function MonthBudgetCard({
  currency,
  firstDayOfMonth,
}: {
  currency: string;
  firstDayOfMonth: number;
}) {
  const { colors, radius } = useTheme();
  const [now] = useState(() => new Date());
  const { data } = useDbQuery(`home-budget|${firstDayOfMonth}|${now.toDateString()}`, (db) =>
    loadBudgetOverview(db, now, firstDayOfMonth),
  );
  const summary = data ? monthBudgetSummary(data.items, currency) : null;
  if (!data || !summary) return null;

  const { progress } = summary;
  const status = statusPresentation(progress.status);
  const percent = Number.isFinite(progress.ratio) ? Math.round(progress.ratio * 100) : 100;
  const month = formatPeriod(data.period);
  const title =
    summary.source === 'overall'
      ? t('home.monthBudget', { month })
      : t('home.monthBudgetCategories', { month });
  const spentOf = t('budgets.spentOf', {
    spent: money(progress.spent, currency),
    limit: money(progress.limit, currency),
  });
  const remaining =
    progress.remaining >= 0
      ? t('budgets.remaining', { amount: money(progress.remaining, currency) })
      : t('budgets.over', { amount: money(-progress.remaining, currency) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status.label, `${percent}%`, spentOf, remaining].join(', ')}
      accessibilityHint={t('home.monthBudgetHint')}
      onPress={() => router.push('/budgets')}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: radius.lg,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon name="wallet-outline" size={18} color={colors.textSecondary} />
        <AppText variant="label" color="textSecondary" style={styles.flex} numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="label" tabular color={status.color}>
          {t('budgets.percent', { percent })}
        </AppText>
      </View>
      <ProgressBar ratio={progress.ratio} color={colors[status.color]} />
      <View style={styles.row}>
        <AppText variant="caption" color="textSecondary" tabular style={styles.flex}>
          {spentOf}
        </AppText>
        <AppText variant="caption" tabular color={progress.remaining >= 0 ? 'text' : 'danger'}>
          {remaining}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    alignSelf: 'stretch',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
