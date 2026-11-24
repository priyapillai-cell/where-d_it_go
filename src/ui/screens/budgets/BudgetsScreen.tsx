import { router, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { formatPeriod, money } from '@/i18n/format';
import { type BudgetOverviewItem, loadBudgetOverview } from '@/services/budgetService';
import { categoryMap, useAppStore } from '@/state/appStore';

import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { SectionTitle } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { statusPresentation } from './budgetStatus';

function BudgetCard({
  item,
  name,
  icon,
  iconColor,
}: {
  item: BudgetOverviewItem;
  name: string;
  icon: string;
  iconColor: string;
}) {
  const { colors, radius } = useTheme();
  const { budget, progress } = item;
  const status = statusPresentation(progress.status);
  const percent = Number.isFinite(progress.ratio) ? Math.round(progress.ratio * 100) : 100;
  const spentOf = t('budgets.spentOf', {
    spent: money(progress.spent, budget.currency),
    limit: money(budget.amount, budget.currency),
  });
  const remaining =
    progress.remaining >= 0
      ? t('budgets.remaining', { amount: money(progress.remaining, budget.currency) })
      : t('budgets.over', { amount: money(-progress.remaining, budget.currency) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, status.label, `${percent}%`, spentOf, remaining].join(', ')}
      accessibilityHint={t('budgets.edit')}
      onPress={() => router.push({ pathname: '/budget-edit', params: { id: budget.id } })}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: radius.lg,
          backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <CategoryIcon icon={icon} color={iconColor} size={36} />
        <AppText variant="subtitle" style={styles.flex} numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="subtitle" tabular color={status.color}>
          {t('budgets.percent', { percent })}
        </AppText>
      </View>
      <ProgressBar ratio={progress.ratio} color={colors[status.color]} />
      <View style={styles.cardFooter}>
        <Icon name={status.icon} size={16} color={colors[status.color]} />
        <AppText variant="caption" color={status.color}>
          {status.label}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.flex} align="right" tabular>
          {spentOf} · {remaining}
        </AppText>
      </View>
    </Pressable>
  );
}

export function BudgetsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const { data, loading } = useDbQuery(`budgets|${settings.firstDayOfMonth}`, (db) =>
    loadBudgetOverview(db, new Date(), settings.firstDayOfMonth),
  );

  const hasBudget = (data?.items.length ?? 0) > 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        data && !hasBudget ? (
          <IconButton
            icon="plus"
            label={t('budgets.add')}
            onPress={() => router.push('/budget-edit')}
          />
        ) : null,
    });
  }, [navigation, data, hasBudget]);

  if (loading && !data) return <ListSkeleton />;

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon="target"
        title={t('budgets.empty')}
        hint={t('budgets.emptyHint')}
        actionLabel={t('budgets.add')}
        onAction={() => router.push('/budget-edit')}
      />
    );
  }

  const byId = categoryMap(categories);
  const overall = items.filter((i) => i.budget.categoryId === null);
  const perCategory = items.filter((i) => i.budget.categoryId !== null);
  const currencies = new Set(accounts.filter((a) => !a.isArchived).map((a) => a.currency));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {data ? (
        <View style={styles.repeats}>
          <Icon name="calendar-sync" size={18} color={colors.income} />
          <AppText variant="label" color="textSecondary">
            {`${t('budgets.repeatsMonthly')} · ${t('budgets.periodLabel', { range: formatPeriod(data.period) })}`}
          </AppText>
        </View>
      ) : null}

      {overall.map((item) => (
        <BudgetCard
          key={item.budget.id}
          item={item}
          name={`${t('budgets.allExpenses')}${currencies.size > 1 ? ` (${item.budget.currency})` : ''}`}
          icon="wallet-outline"
          iconColor={colors.primary}
        />
      ))}

      {perCategory.length > 0 && overall.length > 0 ? (
        <SectionTitle>{t('budgets.perCategory')}</SectionTitle>
      ) : null}
      {perCategory.map((item) => {
        const category = item.budget.categoryId ? byId.get(item.budget.categoryId) : undefined;
        return (
          <BudgetCard
            key={item.budget.id}
            item={item}
            name={category?.name ?? t('transactions.uncategorized')}
            icon={category?.icon ?? 'shape-outline'}
            iconColor={category?.color ?? colors.textSecondary}
          />
        );
      })}

      <AppText variant="caption" color="textSecondary">
        {t('budgets.singleHint')}
      </AppText>
      {currencies.size > 1 ? (
        <AppText variant="caption" color="textSecondary">
          {t('budgets.currencyNote')}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  repeats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
