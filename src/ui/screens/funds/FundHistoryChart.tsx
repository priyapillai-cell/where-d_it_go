import { StyleSheet, View } from 'react-native';

import type { FundMonth } from '@/domain/sinkingFunds';
import { t } from '@/i18n';
import { formatDate, money } from '@/i18n/format';

import { AppText } from '../../components/AppText';
import { BarChart } from '../../components/charts/BarChart';
import { LineChart } from '../../components/charts/LineChart';
import { useTheme } from '../../theme/ThemeProvider';

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

/** Added (income colour) and spent (expense colour) per month, plus an optional balance line. */
export function FundHistoryChart({
  history,
  currency,
  width,
  showBalance = false,
  height = 160,
}: {
  history: readonly FundMonth[];
  currency: string;
  width: number;
  showBalance?: boolean;
  height?: number;
}) {
  const { colors } = useTheme();
  const added = history.reduce((sum, m) => sum + m.added, 0);
  const spent = history.reduce((sum, m) => sum + m.spent, 0);
  const balances = history.map((m) => m.balance);
  const first = history[0];
  const last = history.at(-1);

  return (
    <View style={styles.wrap}>
      <BarChart
        width={width}
        height={height}
        groups={history.map((m) => ({
          key: m.start.toISOString(),
          label: formatDate(m.start, 'monthShort'),
          income: m.added,
          expense: m.spent,
        }))}
        accessibilityLabel={`${t('funds.chartA11y')}: ${t('funds.addedInPeriod')} ${money(
          added,
          currency,
        )}, ${t('funds.spentInPeriod')} ${money(spent, currency)}`}
      />
      <View style={styles.legend}>
        <LegendItem color={colors.income} label={t('funds.addedInPeriod')} />
        <LegendItem color={colors.expense} label={t('funds.spentInPeriod')} />
      </View>
      {showBalance && first && last ? (
        <>
          <AppText variant="label" color="textSecondary">
            {t('funds.balanceTrend')}
          </AppText>
          <LineChart
            width={width}
            height={height - 20}
            values={balances}
            maxLabel={money(Math.max(...balances), currency)}
            minLabel={money(Math.min(...balances), currency)}
            startLabel={formatDate(first.start, 'monthShort')}
            endLabel={formatDate(last.start, 'monthShort')}
            accessibilityLabel={`${t('funds.balanceTrend')}: ${money(
              first.balance,
              currency,
            )} – ${money(last.balance, currency)}`}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});
