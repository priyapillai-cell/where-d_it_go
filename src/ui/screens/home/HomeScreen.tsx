import { router, useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listInRange } from '@/db/repositories/transactionRepository';
import { aggregateByCategory, sumByType } from '@/domain/aggregation';
import { totalsByCurrency } from '@/domain/balance';
import { periodToIsoRange } from '@/domain/periods';
import type { Category, CategoryType } from '@/domain/types';
import { t } from '@/i18n';
import { formatPercent, money } from '@/i18n/format';
import { categoryMap, useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';
import { ALL_ACCOUNTS, useHomeStore } from '@/state/homeStore';
import { scopeForSelection } from '@/state/selectors';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { DonutChart } from '../../components/DonutChart';
import { Icon } from '../../components/Icon';
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
  const [accountSheet, setAccountSheet] = useState(false);

  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const balances = useAppStore((s) => s.balances);
  const {
    period,
    setKind,
    shift,
    setCustom,
    realign,
    accountId,
    setAccountId,
    chartType,
    toggleChartType,
  } = useHomeStore();
  const periodOptions = useMemo(
    () => ({ firstDayOfWeek: settings.firstDayOfWeek, firstDayOfMonth: settings.firstDayOfMonth }),
    [settings.firstDayOfWeek, settings.firstDayOfMonth],
  );

  useEffect(() => realign(periodOptions), [periodOptions, realign]);
  useEffect(() => {
    if (accountId !== ALL_ACCOUNTS && !accounts.some((a) => a.id === accountId))
      setAccountId(ALL_ACCOUNTS);
  }, [accountId, accounts, setAccountId]);

  const scope = useMemo(
    () => scopeForSelection(accountId, accounts, settings.defaultCurrency),
    [accountId, accounts, settings.defaultCurrency],
  );
  const { from, to } = periodToIsoRange(period);
  const { data: transactions, loading } = useDbQuery(
    `home|${from}|${to}|${scope.accountIds.join(',')}`,
    (db) => listInRange(db, { from, to, accountIds: scope.accountIds }),
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

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const balanceLines = selectedAccount
    ? [
        money(
          balances.get(selectedAccount.id) ?? selectedAccount.initialBalance,
          selectedAccount.currency,
        ),
      ]
    : totalsByCurrency(accounts, balances, settings.defaultCurrency).map((c) =>
        money(c.total, c.currency),
      );

  const openEditor = (type: CategoryType, category?: Category) => {
    router.push({
      pathname: '/transaction',
      params: {
        type,
        ...(category ? { categoryId: category.id } : {}),
        ...(selectedAccount ? { accountId: selectedAccount.id } : {}),
      },
    });
  };

  const openCategoryTransactions = (categoryId: string | null) => {
    useFilterStore.getState().setFilter({
      categoryIds: categoryId ? [categoryId] : [],
      types: [chartType],
      from,
      to,
      accountIds: selectedAccount ? [selectedAccount.id] : [],
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

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon="menu"
          label={t('nav.openMenu')}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${selectedAccount?.name ?? t('home.allAccounts')}. ${t('home.balance')} ${balanceLines.join(', ')}`}
          accessibilityHint={t('home.selectAccount')}
          onPress={() => setAccountSheet(true)}
          style={styles.accountButton}
        >
          <View style={styles.accountRow}>
            <AppText variant="label" color="textSecondary" numberOfLines={1}>
              {selectedAccount?.name ?? t('home.allAccounts')}
            </AppText>
            <Icon name="chevron-down" size={18} color={colors.textSecondary} />
          </View>
          <AppText variant="title" tabular numberOfLines={1} adjustsFontSizeToFit>
            {balanceLines[0] ?? money(0, settings.defaultCurrency)}
          </AppText>
          {balanceLines.length > 1 ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {balanceLines.slice(1).join(' · ')}
            </AppText>
          ) : null}
        </Pressable>
        <IconButton
          icon="format-list-bulleted"
          label={t('nav.transactions')}
          onPress={() => router.push('/transactions')}
        />
      </View>

      <PeriodSelector
        period={period}
        onKindChange={(kind) => setKind(kind, periodOptions)}
        onShift={(direction) => shift(direction, periodOptions)}
        onCustomRange={setCustom}
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
                accessibilityLabel={`${centerLabel} ${money(totalForType, scope.currency)}`}
                accessibilityHint={t('home.toggleHint')}
                onPress={toggleChartType}
                style={[styles.center, { width: donutSize * 0.7, height: donutSize * 0.7 }]}
              >
                <View style={styles.accountRow}>
                  <Icon
                    name={
                      chartType === 'expense'
                        ? 'arrow-up-bold-circle-outline'
                        : 'arrow-down-bold-circle-outline'
                    }
                    size={18}
                    color={typeColor}
                  />
                  <AppText variant="label" color="textSecondary">
                    {centerLabel}
                  </AppText>
                </View>
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
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {chartType === 'expense'
                    ? `${t('home.totalIncome')} ${money(totals.income, scope.currency)}`
                    : `${t('home.totalExpenses')} ${money(totals.expense, scope.currency)}`}
                </AppText>
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

      <AccountSheet
        visible={accountSheet}
        includeAll
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setAccountSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 4 },
  accountButton: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
