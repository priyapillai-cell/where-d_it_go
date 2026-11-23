import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { periodContaining } from '@/domain/periods';
import { t } from '@/i18n';
import { money } from '@/i18n/format';
import { loadFundsDashboard } from '@/services/fundService';
import { useAppStore } from '@/state/appStore';

import { AppText } from '../../components/AppText';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { statusPresentation } from '../budgets/budgetStatus';
import { FundHistoryChart } from '../funds/FundHistoryChart';

const MAX_WIDTH = 420;

/** All sinking fund categories as one six-month chart; shown when enabled in Settings. */
export function FundsOverviewCard() {
  const { colors, radius } = useTheme();
  const { width } = useWindowDimensions();
  const settings = useAppStore((s) => s.settings);
  const [now] = useState(() => new Date());
  const { data } = useDbQuery(
    [
      'home-funds',
      settings.defaultCurrency,
      settings.firstDayOfMonth,
      settings.fundBudget,
      settings.fundLeftover,
      settings.fundLeftoverSince,
      now.toDateString(),
    ].join('|'),
    (db) =>
      loadFundsDashboard(
        db,
        periodContaining('month', now, {
          firstDayOfWeek: settings.firstDayOfWeek,
          firstDayOfMonth: settings.firstDayOfMonth,
        }),
        settings,
        now,
      ),
  );
  if (!data) return null;

  const currency = settings.defaultCurrency;
  const balance = data.totals.find((total) => total.currency === currency)?.balance ?? 0;
  const budget = data.budget;
  const status = budget ? statusPresentation(budget.progress.status) : null;
  const cardWidth = Math.min(width, MAX_WIDTH) - 32;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('funds.overviewTitle')}, ${t('funds.balance')} ${money(balance, currency)}`}
      accessibilityHint={t('funds.overviewHint')}
      onPress={() => router.push('/funds')}
      style={({ pressed }) => [
        styles.card,
        {
          width: cardWidth,
          borderRadius: radius.lg,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon name="piggy-bank-outline" size={18} color={colors.textSecondary} />
        <AppText variant="label" color="textSecondary" style={styles.flex}>
          {t('funds.overviewTitle')}
        </AppText>
        <AppText variant="subtitle" tabular>
          {money(balance, currency)}
        </AppText>
      </View>
      {budget && status ? (
        <>
          <ProgressBar ratio={budget.progress.ratio} color={colors[status.color]} />
          <AppText variant="caption" color="textSecondary" tabular>
            {`${t('funds.budget')}: ${t('budgets.spentOf', {
              spent: money(budget.progress.spent, currency),
              limit: money(budget.progress.limit, currency),
            })}`}
          </AppText>
        </>
      ) : null}
      <AppText variant="caption" color="textSecondary">
        {t('funds.chartTitle')}
      </AppText>
      <FundHistoryChart
        history={data.history}
        currency={currency}
        width={cardWidth - 24}
        height={130}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
