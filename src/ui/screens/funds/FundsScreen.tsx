import { router, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { parseCalendarDay } from '@/domain/sinkingFunds';
import { t } from '@/i18n';
import { formatDate, formatPercent, money } from '@/i18n/format';
import { type FundOverviewItem, loadFundsOverview } from '@/services/fundService';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card, SectionTitle } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { fundStatusPresentation } from './fundStatus';

type Preset = 'gifts' | 'vacation';

function openEditor(preset?: Preset) {
  router.push(preset ? { pathname: '/fund-edit', params: { preset } } : '/fund-edit');
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

export function FundsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { data, loading } = useDbQuery('funds', (db) => loadFundsOverview(db, new Date()));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton icon="plus" label={t('funds.add')} onPress={() => openEditor()} />
      ),
    });
  }, [navigation]);

  if (loading && !data) return <ListSkeleton />;

  const active = data?.active ?? [];
  const archived = data?.archived ?? [];

  if (active.length === 0 && archived.length === 0) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <EmptyState
          icon="piggy-bank-outline"
          title={t('funds.empty')}
          hint={t('funds.emptyHint')}
          actionLabel={t('funds.add')}
          onAction={() => openEditor()}
        />
        <SectionTitle>{t('funds.suggestions')}</SectionTitle>
        <View style={styles.suggestions}>
          <Button
            label={t('funds.suggestGifts')}
            icon="gift-outline"
            variant="tonal"
            onPress={() => openEditor('gifts')}
          />
          <Button
            label={t('funds.suggestVacation')}
            icon="beach"
            variant="tonal"
            onPress={() => openEditor('vacation')}
          />
        </View>
        <AppText variant="caption" color="textSecondary" align="center">
          {t('funds.intro')}
        </AppText>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {data && data.totals.length > 0 ? (
        <Card style={styles.totals}>
          <AppText variant="label" color="textSecondary">
            {t('funds.totalSaved')}
          </AppText>
          {data.totals.map((total) => (
            <AppText key={total.currency} variant="headline" tabular>
              {money(total.balance, total.currency)}
            </AppText>
          ))}
        </Card>
      ) : null}

      {active.map((item) => (
        <FundCard key={item.fund.id} item={item} />
      ))}

      <Button label={t('funds.add')} icon="plus" variant="tonal" onPress={() => openEditor()} />
      <AppText variant="caption" color="textSecondary">
        {t('funds.intro')}
      </AppText>

      {archived.length > 0 ? <SectionTitle>{t('funds.archived')}</SectionTitle> : null}
      {archived.map((item) => (
        <FundCard key={item.fund.id} item={item} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totals: { padding: 16, gap: 2 },
  suggestions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
});
