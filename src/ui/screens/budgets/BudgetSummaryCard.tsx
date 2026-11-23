import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { money } from '@/i18n/format';
import type { MonthBudgetState } from '@/services/leftoverService';

import { AppText } from '../../components/AppText';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { useTheme } from '../../theme/ThemeProvider';
import { statusPresentation } from './budgetStatus';

/** Spent-of-limit card for one month's budget, including any amount carried over. */
export function BudgetSummaryCard({
  title,
  icon,
  budget,
  currency,
  onPress,
  hint,
  inset = true,
}: {
  title: string;
  icon: string;
  budget: MonthBudgetState;
  currency: string;
  onPress: () => void;
  hint: string;
  inset?: boolean;
}) {
  const { colors, radius } = useTheme();
  const { progress, carried } = budget;
  const status = statusPresentation(progress.status);
  const percent = Number.isFinite(progress.ratio) ? Math.round(progress.ratio * 100) : 100;
  const spentOf = t('budgets.spentOf', {
    spent: money(progress.spent, currency),
    limit: money(progress.limit, currency),
  });
  const remaining =
    progress.remaining >= 0
      ? t('budgets.remaining', { amount: money(progress.remaining, currency) })
      : t('budgets.over', { amount: money(-progress.remaining, currency) });
  const carriedLine =
    carried > 0 ? t('funds.budgetCarried', { amount: money(carried, currency) }) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status.label, `${percent}%`, spentOf, remaining, carriedLine]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        inset && styles.inset,
        {
          borderRadius: radius.lg,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon name={icon} size={18} color={colors.textSecondary} />
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
      {carriedLine ? (
        <AppText variant="caption" color="textSecondary">
          {carriedLine}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { alignSelf: 'stretch', padding: 12, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  inset: { marginHorizontal: 16, marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
