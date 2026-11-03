import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  aggregateByCategory,
  balanceSeries,
  comparePeriods,
  type Granularity,
  GRANULARITIES,
  incomeExpenseSeries,
  suggestGranularity,
  sumByType,
} from '@/domain/aggregation';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, formatPercent, money } from '@/i18n/format';
import { loadReport } from '@/services/reportService';
import { categoryMap, useAppStore } from '@/state/appStore';
import { ALL_ACCOUNTS, useReportsStore } from '@/state/homeStore';
import { scopeForSelection } from '@/state/selectors';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { BarChart } from '../../components/charts/BarChart';
import { LineChart } from '../../components/charts/LineChart';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { DonutChart } from '../../components/DonutChart';
import { Card } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { PeriodSelector } from '../../components/PeriodSelector';
import { ProgressBar } from '../../components/ProgressBar';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';

const MAX_CATEGORY_ROWS = 8;

function bucketLabel(date: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
    case 'week':
      return formatDate(date, 'short');
    case 'month':
      return formatDate(date, 'monthShort');
    default:
      return assertNever(granularity);
  }
}

function changeText(change: number | null): string {
  if (change === null) return t('reports.new');
  const percent = Math.round(Math.abs(change) * 100);
  return change >= 0 ? t('reports.increase', { percent }) : t('reports.decrease', { percent });
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.card}>
      <AppText variant="subtitle" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

export function ReportsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(200, width - 64);
  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const { period, setKind, shift, setCustom, realign, accountId, setAccountId } = useReportsStore();
  const [accountSheet, setAccountSheet] = useState(false);
  const [granularityOverride, setGranularity] = useState<Granularity | null>(null);

  const options = useMemo(
    () => ({ firstDayOfWeek: settings.firstDayOfWeek, firstDayOfMonth: settings.firstDayOfMonth }),
    [settings.firstDayOfWeek, settings.firstDayOfMonth],
  );
  useEffect(() => realign(options), [options, realign]);

  const scope = useMemo(
    () => scopeForSelection(accountId, accounts, settings.defaultCurrency),
    [accountId, accounts, settings.defaultCurrency],
  );
  const { data, loading } = useDbQuery(
    `reports|${period.kind}|${period.start?.toISOString()}|${period.end?.toISOString()}|${scope.accountIds.join(',')}|${options.firstDayOfMonth}|${options.firstDayOfWeek}`,
    (db) => loadReport(db, period, scope.accountIds, options),
  );

  const byCategory = categoryMap(categories);
  const currency = scope.currency;
  const accountLabel =
    accountId === ALL_ACCOUNTS
      ? `${t('home.allAccounts')} (${currency})`
      : (accounts.find((a) => a.id === accountId)?.name ?? t('home.allAccounts'));

  const header = (
    <>
      <View style={styles.row}>
        <Chip
          label={accountLabel}
          icon="wallet-outline"
          trailingIcon="chevron-down"
          onPress={() => setAccountSheet(true)}
        />
      </View>
      <PeriodSelector
        period={period}
        onKindChange={(kind) => setKind(kind, options)}
        onShift={(direction) => shift(direction, options)}
        onCustomRange={setCustom}
      />
    </>
  );

  const sheet = (
    <AccountSheet
      visible={accountSheet}
      includeAll
      selected={accountId}
      onSelect={setAccountId}
      onClose={() => setAccountSheet(false)}
    />
  );

  if (!data) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{header}</View>
        {loading ? <ListSkeleton /> : null}
        {sheet}
      </View>
    );
  }

  const granularity = granularityOverride ?? suggestGranularity(data.start, data.end);
  const totals = sumByType(data.transactions);
  const expenseByCategory = aggregateByCategory(data.transactions, 'expense');
  const bars = incomeExpenseSeries(data.transactions, data.start, data.end, granularity, options);
  const balance = balanceSeries(
    data.openingBalance,
    data.transactions,
    new Set(scope.accountIds),
    data.start,
    data.end,
    granularity,
    options,
  );
  const comparison = comparePeriods(data.thisMonth, data.lastMonth);
  const balanceValues = balance.map((p) => p.balance);
  const lastDay = new Date(data.end.getTime() - 1);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {data.transactions.length === 0 ? (
          <EmptyState icon="chart-box-outline" title={t('reports.empty')} />
        ) : (
          <>
            <SectionCard title={t('reports.byCategory')}>
              {expenseByCategory.length === 0 ? (
                <AppText color="textSecondary">{t('reports.empty')}</AppText>
              ) : (
                <>
                  <View style={styles.donut}>
                    <DonutChart
                      size={180}
                      thickness={20}
                      segments={expenseByCategory.map((c) => ({
                        key: c.categoryId ?? 'none',
                        value: c.total,
                        color:
                          (c.categoryId && byCategory.get(c.categoryId)?.color) ||
                          colors.textSecondary,
                      }))}
                    >
                      <AppText variant="caption" color="textSecondary">
                        {t('types.expense')}
                      </AppText>
                      <AppText variant="subtitle" tabular>
                        {money(totals.expense, currency)}
                      </AppText>
                    </DonutChart>
                  </View>
                  {expenseByCategory.slice(0, MAX_CATEGORY_ROWS).map((c) => {
                    const category = c.categoryId ? byCategory.get(c.categoryId) : undefined;
                    const name = category?.name ?? t('transactions.uncategorized');
                    const amount = money(c.total, currency);
                    const share = formatPercent(c.share);
                    return (
                      <View
                        key={c.categoryId ?? 'none'}
                        style={styles.categoryRow}
                        accessible
                        accessibilityLabel={`${name}, ${amount}, ${share}`}
                      >
                        <CategoryIcon
                          icon={category?.icon ?? 'shape-outline'}
                          color={category?.color ?? colors.textSecondary}
                          size={32}
                        />
                        <View style={styles.flex}>
                          <View style={styles.row}>
                            <AppText variant="body" style={styles.flex} numberOfLines={1}>
                              {name}
                            </AppText>
                            <AppText variant="label" tabular>
                              {amount}
                            </AppText>
                          </View>
                          <View style={styles.row}>
                            <View style={styles.flex}>
                              <ProgressBar
                                ratio={c.share}
                                color={category?.color ?? colors.textSecondary}
                              />
                            </View>
                            <AppText
                              variant="caption"
                              color="textSecondary"
                              tabular
                              style={styles.share}
                            >
                              {share}
                            </AppText>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </SectionCard>

            <SectionCard title={t('reports.incomeVsExpense')}>
              <SegmentedControl
                segments={GRANULARITIES.map((g) => ({ value: g, label: t(`reports.${g}`) }))}
                value={granularity}
                onChange={setGranularity}
                accessibilityLabel={t('reports.granularity')}
              />
              <BarChart
                width={chartWidth}
                groups={bars.map((b) => ({
                  key: b.start.toISOString(),
                  label: bucketLabel(b.start, granularity),
                  income: b.income,
                  expense: b.expense,
                }))}
                accessibilityLabel={t('reports.chartA11y', {
                  title: t('reports.incomeVsExpense'),
                  summary: t('reports.barSummary', {
                    count: bars.length,
                    income: money(totals.income, currency),
                    expense: money(totals.expense, currency),
                  }),
                })}
              />
              <View style={styles.legend}>
                <LegendItem
                  color={colors.income}
                  label={`${t('types.income')} ${money(totals.income, currency)}`}
                />
                <LegendItem
                  color={colors.expense}
                  label={`${t('types.expense')} ${money(totals.expense, currency)}`}
                />
              </View>
            </SectionCard>

            <SectionCard title={t('reports.balanceOverTime')}>
              <LineChart
                width={chartWidth}
                values={balanceValues}
                maxLabel={money(Math.max(...balanceValues), currency)}
                minLabel={money(Math.min(...balanceValues), currency)}
                startLabel={formatDate(data.start, 'medium')}
                endLabel={formatDate(lastDay, 'medium')}
                accessibilityLabel={t('reports.chartA11y', {
                  title: t('reports.balanceOverTime'),
                  summary: t('reports.lineSummary', {
                    start: money(data.openingBalance, currency),
                    end: money(balanceValues.at(-1) ?? data.openingBalance, currency),
                  }),
                })}
              />
            </SectionCard>
          </>
        )}

        <SectionCard title={t('reports.comparison')}>
          <View style={styles.compareRow}>
            <View style={styles.flex}>
              <AppText variant="caption" color="textSecondary">
                {t('reports.thisMonth')}
              </AppText>
              <AppText variant="title" tabular color="expense">
                {money(comparison.current.expense, currency)}
              </AppText>
              <AppText variant="caption" tabular color="income">
                +{money(comparison.current.income, currency)}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="caption" color="textSecondary">
                {t('reports.lastMonth')}
              </AppText>
              <AppText variant="title" tabular>
                {money(comparison.previous.expense, currency)}
              </AppText>
              <AppText variant="caption" tabular color="textSecondary">
                +{money(comparison.previous.income, currency)}
              </AppText>
            </View>
          </View>
          <AppText variant="label" color="textSecondary">
            {comparison.expenseChange === null
              ? t('reports.noChange')
              : `${t('reports.change')}: ${changeText(comparison.expenseChange)}`}
          </AppText>
          {comparison.categories.length > 0 ? (
            <AppText variant="label">{t('reports.topChanges')}</AppText>
          ) : null}
          {comparison.categories.slice(0, 5).map((c) => {
            const category = c.categoryId ? byCategory.get(c.categoryId) : undefined;
            const up = c.delta > 0;
            return (
              <View key={c.categoryId ?? 'none'} style={styles.row}>
                <Icon
                  name={up ? 'arrow-up-bold' : 'arrow-down-bold'}
                  size={18}
                  color={up ? colors.expense : colors.income}
                />
                <AppText variant="body" style={styles.flex} numberOfLines={1}>
                  {category?.name ?? t('transactions.uncategorized')}
                </AppText>
                <AppText variant="caption" color="textSecondary" tabular>
                  {money(c.delta, currency, 'always')} · {changeText(c.change)}
                </AppText>
              </View>
            );
          })}
        </SectionCard>
      </ScrollView>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { padding: 16, gap: 12 },
  donut: { alignItems: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  share: { minWidth: 44, textAlign: 'right' },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  compareRow: { flexDirection: 'row', gap: 12 },
});
