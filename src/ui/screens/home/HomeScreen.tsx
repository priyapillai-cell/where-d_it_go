import { router, useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listInRange } from '@/db/repositories/transactionRepository';
import { aggregateByCategory, sumByType } from '@/domain/aggregation';
import { periodToIsoRange } from '@/domain/periods';
import type { Category, CategoryType } from '@/domain/types';
import { t } from '@/i18n';
import { formatPercent, money } from '@/i18n/format';
import { loadMainMonthBudget } from '@/services/leftoverService';
import { categoryMap, useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';
import { ALL_ACCOUNTS, useHomeStore } from '@/state/homeStore';
import { scopeForSelection } from '@/state/selectors';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { DonutChart } from '../../components/DonutChart';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { PeriodSelector } from '../../components/PeriodSelector';
import { Skeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import {
  CategoryGrid,
  CategoryRing,
  MAX_RING_ITEMS,
  RING_ICON,
  type RingItem,
} from './CategoryRing';

const MAX_CHART = 420;

export function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [periodMenu, setPeriodMenu] = useState(false);

  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const { period, setKind, shift, setCustom, realign, chartType, toggleChartType } = useHomeStore();
  const periodOptions = useMemo(
    () => ({ firstDayOfWeek: settings.firstDayOfWeek, firstDayOfMonth: settings.firstDayOfMonth }),
    [settings.firstDayOfWeek, settings.firstDayOfMonth],
  );

  useEffect(() => realign(periodOptions), [periodOptions, realign]);
  const scope = useMemo(
    () => scopeForSelection(ALL_ACCOUNTS, accounts, settings.defaultCurrency),
    [accounts, settings.defaultCurrency],
  );
  const { from, to } = periodToIsoRange(period);
  const { data: transactions, loading } = useDbQuery(
    `home|${from}|${to}|${scope.accountIds.join(',')}`,
    (db) => listInRange(db, { from, to, accountIds: scope.accountIds }),
  );

  const budgetMonth = period.kind === 'month' ? period.start : null;
  const { data: monthBudget } = useDbQuery(
    [
      'home-budget',
      scope.currency,
      budgetMonth?.toISOString(),
      settings.firstDayOfMonth,
      settings.budgetLeftover,
      settings.budgetLeftoverSince,
    ].join('|'),
    async (db) =>
      budgetMonth
        ? loadMainMonthBudget(db, budgetMonth, {
            defaultCurrency: scope.currency,
            firstDayOfMonth: settings.firstDayOfMonth,
            budgetLeftover: settings.budgetLeftover,
            budgetLeftoverSince: settings.budgetLeftoverSince,
          })
        : null,
  );

  const byId = useMemo(() => categoryMap(categories), [categories]);
  const totals = useMemo(() => sumByType(transactions ?? []), [transactions]);
  const breakdown = useMemo(
    () => aggregateByCategory(transactions ?? [], chartType),
    [transactions, chartType],
  );
  const totalForType = chartType === 'expense' ? totals.expense : totals.income;

  const ringItems: RingItem[] = useMemo(() => {
    const spent = new Map(breakdown.map((b) => [b.categoryId, b.total]));
    return categories
      .filter((c) => c.type === chartType && !c.isArchived)
      .map((category) => ({ category, total: spent.get(category.id) ?? 0 }));
  }, [categories, breakdown, chartType]);

  const chartSize = Math.min(width - 16, MAX_CHART);
  const donutSize = chartSize - 2 * RING_ICON - 24;
  const ring = ringItems.slice(0, MAX_RING_ITEMS);
  const overflow = ringItems.slice(MAX_RING_ITEMS);

  const openEditor = (type: CategoryType, category?: Category) => {
    router.push({
      pathname: '/transaction',
      params: {
        type,
        ...(category ? { categoryId: category.id } : {}),
      },
    });
  };

  const openCategoryTransactions = (categoryId: string | null) => {
    useFilterStore.getState().setFilter({
      categoryIds: categoryId ? [categoryId] : [],
      types: [chartType],
      from,
      to,
      accountIds: [],
    });
    router.push('/transactions');
  };

  const segments = breakdown.map((b) => ({
    key: b.categoryId ?? 'none',
    value: b.total,
    color: (b.categoryId && byId.get(b.categoryId)?.color) || colors.textSecondary,
  }));
  const typeColor = chartType === 'expense' ? colors.expense : colors.income;
  const centerLabel = chartType === 'expense' ? t('home.totalExpenses') : t('home.totalIncome');
  const budget = chartType === 'expense' && period.kind === 'month' ? monthBudget : null;
  const centerA11y = [
    `${centerLabel} ${money(totalForType, scope.currency)}`,
    budget ? t('home.budgetA11y', { limit: money(budget.progress.limit, scope.currency) }) : null,
    budget
      ? budget.progress.remaining >= 0
        ? t('budgets.remaining', { amount: money(budget.progress.remaining, scope.currency) })
        : t('budgets.over', { amount: money(-budget.progress.remaining, scope.currency) })
      : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon="menu"
          label={t('nav.openMenu')}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        />
        <View style={styles.flex}>
          <Logo height={30} style={styles.logo} />
        </View>
        <IconButton
          icon="message-text-outline"
          label={t('fromMessage.open')}
          onPress={() => router.push('/from-message')}
        />
        <IconButton
          icon="filter-variant"
          label={t('periods.choosePeriodA11y', { period: t(`periods.${period.kind}`) })}
          onPress={() => setPeriodMenu(true)}
        />
      </View>
      <PeriodSelector
        period={period}
        onKindChange={(kind) => setKind(kind, periodOptions)}
        onShift={(direction) => shift(direction, periodOptions)}
        onCustomRange={setCustom}
        kindMenu={{ visible: periodMenu, onClose: () => setPeriodMenu(false) }}
      />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}>
        <View style={[styles.chartArea, { width: chartSize, height: chartSize }]}>
          <View
            style={[
              styles.donut,
              { top: (chartSize - donutSize) / 2, left: (chartSize - donutSize) / 2 },
            ]}
          >
            <DonutChart
              segments={segments}
              size={donutSize}
              thickness={Math.max(18, donutSize * 0.1)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={centerA11y}
                accessibilityHint={t('home.toggleHint')}
                onPress={toggleChartType}
                style={[styles.center, { width: donutSize * 0.7, height: donutSize * 0.7 }]}
              >
                {loading && !transactions ? (
                  <Skeleton width={120} height={28} />
                ) : (
                  <AppText
                    variant="headline"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: typeColor }}
                  >
                    {money(totalForType, scope.currency)}
                  </AppText>
                )}
                {budget ? (
                  <AppText
                    variant="title"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: colors.income }}
                  >
                    {money(budget.progress.limit, scope.currency)}
                  </AppText>
                ) : null}
                <Icon name="swap-horizontal" size={18} color={colors.textSecondary} />
              </Pressable>
            </DonutChart>
          </View>
          <CategoryRing
            items={ring}
            size={chartSize}
            currency={scope.currency}
            onPress={(c) => openEditor(chartType, c)}
          />
        </View>

        {overflow.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="label" color="textSecondary" style={styles.sectionTitle}>
              {t('home.moreCategories')}
            </AppText>
            <CategoryGrid
              items={overflow}
              currency={scope.currency}
              onPress={(c) => openEditor(chartType, c)}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          {breakdown.length === 0 && !loading ? (
            <AppText variant="body" color="textSecondary" align="center" style={styles.emptyHint}>
              {chartType === 'expense' ? t('home.emptyExpenses') : t('home.emptyIncome')}
            </AppText>
          ) : (
            breakdown.map((row) => {
              const category = row.categoryId ? byId.get(row.categoryId) : undefined;
              const name = category?.name ?? t('transactions.uncategorized');
              return (
                <Pressable
                  key={row.categoryId ?? 'none'}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${formatPercent(row.share)}, ${money(row.total, scope.currency)}`}
                  onPress={() => openCategoryTransactions(row.categoryId)}
                  style={({ pressed }) => [
                    styles.breakdownRow,
                    { backgroundColor: pressed ? colors.surfaceVariant : colors.surface },
                  ]}
                >
                  <CategoryIcon
                    icon={category?.icon ?? 'help'}
                    color={category?.color ?? colors.textSecondary}
                    size={36}
                  />
                  <AppText variant="body" style={styles.flex} numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" tabular>
                    {formatPercent(row.share)}
                  </AppText>
                  <AppText variant="subtitle" tabular>
                    {money(row.total, scope.currency)}
                  </AppText>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <Button
          label={`− ${t('home.addExpense')}`}
          accessibilityLabel={t('home.addExpenseA11y')}
          tint={colors.expense}
          size="large"
          style={styles.flex}
          onPress={() => openEditor('expense')}
        />
        <Button
          label={`+ ${t('home.addIncome')}`}
          accessibilityLabel={t('home.addIncomeA11y')}
          tint={colors.income}
          size="large"
          style={styles.flex}
          onPress={() => openEditor('income')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 4 },
  // Pulls the logo toward the menu icon, past the menu button's touch padding.
  logo: { marginLeft: -8 },
  scroll: { alignItems: 'center', paddingTop: 8 },
  chartArea: { position: 'relative' },
  donut: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 999 },
  section: { alignSelf: 'stretch', paddingHorizontal: 16, marginTop: 12, gap: 8 },
  sectionTitle: { textAlign: 'center' },
  emptyHint: { paddingHorizontal: 24, paddingVertical: 8 },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
