import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseCalendarDay } from '@/domain/sinkingFunds';
import type { FundEntryType, SinkingFund } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, formatPercent, money } from '@/i18n/format';
import { type FundOverviewItem, loadFundsDashboard } from '@/services/fundService';
import { useAppStore } from '@/state/appStore';
import { useFundsStore } from '@/state/homeStore';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { DonutChart } from '../../components/DonutChart';
import { Card, SectionTitle } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { PeriodSelector } from '../../components/PeriodSelector';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { CategoryGrid, CategoryRing, MAX_RING_ITEMS, RING_ICON } from '../home/CategoryRing';
import { FUND_PRESETS, type FundPreset, presetName } from './fundPresets';
import { fundStatusPresentation } from './fundStatus';

const MAX_CHART = 420;

function openEditor(preset?: FundPreset) {
  router.push(preset ? { pathname: '/fund-edit', params: { preset } } : '/fund-edit');
}

function openEntry(type: FundEntryType, fund?: SinkingFund) {
  router.push({ pathname: '/fund-entry', params: { type, ...(fund ? { fundId: fund.id } : {}) } });
}

export function fundHint({ fund, summary }: FundOverviewItem): string | null {
  const day = fund.targetDate ? parseCalendarDay(fund.targetDate) : null;
  if (summary.status === 'reached' || summary.status === 'noTarget') return null;
  if (day && summary.neededPerMonth !== null && summary.status !== 'overdue') {
    return t('funds.needed', {
      amount: money(summary.neededPerMonth, fund.currency),
      date: formatDate(day, 'monthYear'),
    });
  }
  return summary.remaining !== null
    ? t('funds.remaining', { amount: money(summary.remaining, fund.currency) })
    : null;
}

function FundCard({ item }: { item: FundOverviewItem }) {
  const { colors, radius } = useTheme();
  const { fund, summary } = item;
  const status = fundStatusPresentation(summary.status);
  const hint = fundHint(item);
  const amountLine =
    fund.targetAmount !== null
      ? t('funds.savedOf', {
          saved: money(summary.balance, fund.currency),
          target: money(fund.targetAmount, fund.currency),
        })
      : t('funds.saved', { amount: money(summary.balance, fund.currency) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        t('funds.rowA11y', {
          name: fund.name,
          balance: money(summary.balance, fund.currency),
          status: status.label,
        }),
        amountLine,
        hint,
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={() => router.push({ pathname: '/fund', params: { id: fund.id } })}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: radius.lg,
          backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <CategoryIcon icon={fund.icon} color={fund.color} size={40} />
        <View style={styles.flex}>
          <AppText variant="subtitle" numberOfLines={1}>
            {fund.name}
          </AppText>
          <AppText variant="caption" color="textSecondary" tabular numberOfLines={1}>
            {amountLine}
          </AppText>
        </View>
        {summary.progress !== null ? (
          <AppText variant="subtitle" tabular color={status.color}>
            {formatPercent(summary.progress)}
          </AppText>
        ) : (
          <AppText variant="subtitle" tabular>
            {money(summary.balance, fund.currency)}
          </AppText>
        )}
      </View>
      {summary.progress !== null ? (
        <ProgressBar ratio={summary.progress} color={colors[status.color]} />
      ) : null}
      <View style={styles.row}>
        <Icon name={status.icon} size={16} color={colors[status.color]} />
        <AppText variant="caption" color={status.color}>
          {status.label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary" style={styles.flex} align="right">
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function PresetChips({ existing }: { existing: readonly SinkingFund[] }) {
  const taken = new Set(existing.map((f) => f.name.trim().toLowerCase()));
  const presets = FUND_PRESETS.filter((p) => !taken.has(presetName(p.id).toLowerCase()));
  if (presets.length === 0) return null;
  return (
    <>
      <SectionTitle>{t('funds.suggestions')}</SectionTitle>
      <View style={styles.suggestions}>
        {presets.map((p) => (
          <Button
            key={p.id}
            label={presetName(p.id)}
            icon={p.icon}
            variant="tonal"
            onPress={() => openEditor(p.id)}
          />
        ))}
      </View>
    </>
  );
}

function BudgetRequired() {
  const { colors } = useTheme();
  return (
    <Card style={styles.required}>
      <Icon name="piggy-bank-outline" size={48} color={colors.primary} />
      <AppText variant="title" align="center" accessibilityRole="header">
        {t('funds.budgetRequiredTitle')}
      </AppText>
      <AppText color="textSecondary" align="center">
        {t('funds.budgetRequiredBody')}
      </AppText>
      <Button
        label={t('funds.budgetSave')}
        icon="wallet-outline"
        onPress={() => router.push('/fund-budget')}
      />
    </Card>
  );
}

export function FundsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [periodMenu, setPeriodMenu] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const { period, setKind, shift, setCustom, realign, entryType, toggleEntryType } =
    useFundsStore();
  const periodOptions = useMemo(
    () => ({ firstDayOfWeek: settings.firstDayOfWeek, firstDayOfMonth: settings.firstDayOfMonth }),
    [settings.firstDayOfWeek, settings.firstDayOfMonth],
  );
  useEffect(() => realign(periodOptions), [periodOptions, realign]);

  const [now] = useState(() => new Date());
  const { data, loading } = useDbQuery(
    [
      'funds',
      period.start?.toISOString(),
      period.end?.toISOString(),
      settings.defaultCurrency,
      settings.firstDayOfMonth,
      settings.fundBudget,
      settings.fundLeftover,
      settings.fundLeftoverSince,
      now.toDateString(),
    ].join('|'),
    (db) => loadFundsDashboard(db, period, settings, now),
  );
  const hasBudget = settings.fundBudget !== null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasBudget ? (
          <View style={styles.headerActions}>
            <IconButton
              icon="filter-variant"
              label={t('periods.choosePeriodA11y', { period: t(`periods.${period.kind}`) })}
              onPress={() => setPeriodMenu(true)}
            />
            <IconButton icon="plus" label={t('funds.add')} onPress={() => openEditor()} />
          </View>
        ) : null,
    });
  }, [navigation, hasBudget, period.kind]);

  if (!hasBudget) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <BudgetRequired />
        <AppText variant="caption" color="textSecondary" align="center">
          {t('funds.intro')}
        </AppText>
      </ScrollView>
    );
  }

  if (loading && !data) return <ListSkeleton />;

  const currency = settings.defaultCurrency;
  const active = data?.active ?? [];
  const archived = data?.archived ?? [];
  const totals = entryType === 'spend' ? data?.spentInPeriod : data?.addedInPeriod;
  const ringItems = active.map(({ fund }) => ({
    category: fund,
    total: totals?.get(fund.id) ?? 0,
  }));
  const inCurrency = ringItems.filter((i) => i.category.currency === currency && i.total > 0);
  const periodTotal = inCurrency.reduce((sum, i) => sum + i.total, 0);
  const typeColor = entryType === 'spend' ? colors.expense : colors.income;
  const centerLabel = entryType === 'spend' ? t('funds.spentInPeriod') : t('funds.addedInPeriod');
  const budget = data?.budget ?? null;
  const centerA11y = [
    `${centerLabel} ${money(periodTotal, currency)}`,
    budget ? t('home.budgetA11y', { limit: money(budget.progress.limit, currency) }) : null,
    budget
      ? budget.progress.remaining >= 0
        ? t('budgets.remaining', { amount: money(budget.progress.remaining, currency) })
        : t('budgets.over', { amount: money(-budget.progress.remaining, currency) })
      : null,
  ]
    .filter(Boolean)
    .join('. ');

  const chartSize = Math.min(width - 16, MAX_CHART);
  const donutSize = chartSize - 2 * RING_ICON - 24;
  const ring = ringItems.slice(0, MAX_RING_ITEMS);
  const overflow = ringItems.slice(MAX_RING_ITEMS);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PeriodSelector
        period={period}
        onKindChange={(kind) => setKind(kind, periodOptions)}
        onShift={(direction) => shift(direction, periodOptions)}
        onCustomRange={setCustom}
        kindMenu={{ visible: periodMenu, onClose: () => setPeriodMenu(false) }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        <View style={[styles.chartArea, { width: chartSize, height: chartSize }]}>
          <View
            style={[
              styles.donut,
              { top: (chartSize - donutSize) / 2, left: (chartSize - donutSize) / 2 },
            ]}
          >
            <DonutChart
              segments={inCurrency.map((i) => ({
                key: i.category.id,
                value: i.total,
                color: i.category.color,
              }))}
              size={donutSize}
              thickness={Math.max(18, donutSize * 0.1)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={centerA11y}
                accessibilityHint={t('funds.toggleHint')}
                onPress={toggleEntryType}
                style={[styles.center, { width: donutSize * 0.7, height: donutSize * 0.7 }]}
              >
                <AppText
                  variant="headline"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: typeColor }}
                >
                  {money(periodTotal, currency)}
                </AppText>
                {budget ? (
                  <AppText
                    variant="title"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: colors.income }}
                  >
                    {money(budget.progress.limit, currency)}
                  </AppText>
                ) : null}
                <Icon name="swap-horizontal" size={18} color={colors.textSecondary} />
              </Pressable>
            </DonutChart>
          </View>
          <CategoryRing
            items={ring}
            size={chartSize}
            currency={currency}
            onPress={(fund) => openEntry(entryType, fund)}
          />
        </View>
        {overflow.length > 0 ? (
          <CategoryGrid
            items={overflow}
            currency={currency}
            onPress={(fund) => openEntry(entryType, fund)}
          />
        ) : null}
        {active.length === 0 ? (
          <EmptyState
            icon="piggy-bank-outline"
            title={t('funds.empty')}
            hint={t('funds.emptyHint')}
            actionLabel={t('funds.add')}
            onAction={() => openEditor()}
          />
        ) : (
          <>
            {periodTotal === 0 ? (
              <AppText color="textSecondary" align="center">
                {entryType === 'spend' ? t('funds.emptyPeriodSpent') : t('funds.emptyPeriodAdded')}
              </AppText>
            ) : null}

            <SectionTitle>{t('funds.categories')}</SectionTitle>
            {active.map((item) => (
              <FundCard key={item.fund.id} item={item} />
            ))}
          </>
        )}

        <PresetChips existing={[...active, ...archived].map((i) => i.fund)} />
        <AppText variant="caption" color="textSecondary">
          {t('funds.intro')}
        </AppText>

        {archived.length > 0 ? <SectionTitle>{t('funds.archived')}</SectionTitle> : null}
        {archived.map((item) => (
          <FundCard key={item.fund.id} item={item} />
        ))}
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
          label={`− ${t('funds.addExpense')}`}
          accessibilityLabel={t('funds.addExpenseA11y')}
          tint={colors.expense}
          size="large"
          style={styles.flex}
          onPress={() => openEntry('spend')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  required: { padding: 20, gap: 12, alignItems: 'center' },
  chartArea: { position: 'relative', alignSelf: 'center' },
  donut: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 999 },
  headerActions: { flexDirection: 'row' },
  suggestions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
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
