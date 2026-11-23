import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { FundEntry, FundEntryType, SinkingFund } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, formatPercent, money } from '@/i18n/format';
import { loadFundDetail } from '@/services/fundService';

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
import { fundHint } from './FundsScreen';

function openEntry(fundId: string, type: FundEntryType, id?: string) {
  router.push({ pathname: '/fund-entry', params: id ? { fundId, type, id } : { fundId, type } });
}

function EntryRow({ entry, fund }: { entry: FundEntry; fund: SinkingFund }) {
  const { colors } = useTheme();
  const isDeposit = entry.type === 'deposit';
  const label = isDeposit ? t('funds.entryDeposit') : t('funds.entrySpend');
  const amount = money(isDeposit ? entry.amount : -entry.amount, fund.currency, 'always');
  const date = formatDate(new Date(entry.date), 'medium');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, amount, date, entry.note].filter(Boolean).join(', ')}
      accessibilityHint={t('funds.editEntry')}
      onPress={() => openEntry(fund.id, entry.type, entry.id)}
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
      ]}
    >
      <Icon
        name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'}
        size={28}
        color={isDeposit ? colors.income : colors.expense}
      />
      <View style={styles.flex}>
        <AppText variant="body" numberOfLines={1}>
          {entry.note || label}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {entry.note ? `${label} · ${date}` : date}
        </AppText>
      </View>
      <AppText variant="subtitle" tabular color={isDeposit ? 'income' : 'expense'}>
        {amount}
      </AppText>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="subtitle" tabular>
        {value}
      </AppText>
    </View>
  );
}

export function FundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { data, loading } = useDbQuery(`fund|${id}`, (db) => loadFundDetail(db, id, new Date()));
  const fundName = data?.fund.name;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: fundName ?? '',
      headerRight: () =>
        fundName !== undefined ? (
          <IconButton
            icon="pencil-outline"
            label={t('funds.edit')}
            onPress={() => router.push({ pathname: '/fund-edit', params: { id } })}
          />
        ) : null,
    });
  }, [navigation, fundName, id]);

  if (loading && !data) return <ListSkeleton />;
  if (!data) {
    return (
      <EmptyState
        icon="piggy-bank-outline"
        title={t('funds.notFound')}
        actionLabel={t('common.back')}
        onAction={() => router.back()}
      />
    );
  }

  const { fund, summary, entries } = data;
  const status = fundStatusPresentation(summary.status);
  const hint = fundHint(data);
  const currency = fund.currency;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Card style={styles.summary}>
        <View style={styles.row}>
          <CategoryIcon icon={fund.icon} color={fund.color} size={48} />
          <View style={styles.flex}>
            <AppText variant="label" color="textSecondary">
              {t('funds.balance')}
            </AppText>
            <AppText variant="headline" tabular color={summary.balance < 0 ? 'danger' : 'text'}>
              {money(summary.balance, currency)}
            </AppText>
          </View>
          {summary.progress !== null ? (
            <AppText
              variant="title"
              tabular
              color={status.color}
              accessibilityLabel={t('funds.progressA11y', {
                percent: formatPercent(summary.progress),
              })}
            >
              {formatPercent(summary.progress)}
            </AppText>
          ) : null}
        </View>

        {summary.progress !== null && fund.targetAmount !== null ? (
          <>
            <ProgressBar ratio={summary.progress} color={colors[status.color]} />
            <AppText variant="caption" color="textSecondary" tabular>
              {t('funds.savedOf', {
                saved: money(summary.balance, currency),
                target: money(fund.targetAmount, currency),
              })}
            </AppText>
          </>
        ) : null}

        <View style={styles.row}>
          <Icon name={status.icon} size={16} color={colors[status.color]} />
          <AppText variant="caption" color={status.color}>
            {status.label}
          </AppText>
        </View>
        {hint ? (
          <AppText variant="body" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
        {fund.monthlyContribution !== null ? (
          <AppText variant="caption" color="textSecondary">
            {t('funds.planned', { amount: money(fund.monthlyContribution, currency) })}
          </AppText>
        ) : null}
        {summary.balance < 0 ? (
          <AppText variant="caption" color="danger">
            {t('funds.overspent', { amount: money(-summary.balance, currency) })}
          </AppText>
        ) : null}

        <View style={styles.stats}>
          <Stat label={t('funds.deposited')} value={money(summary.deposited, currency)} />
          <Stat label={t('funds.spentLabel')} value={money(summary.spent, currency)} />
          <Stat label={t('funds.thisMonth')} value={money(summary.depositedThisMonth, currency)} />
        </View>
      </Card>

      <View style={styles.actions}>
        <Button
          label={t('funds.deposit')}
          icon="plus"
          tint={colors.income}
          style={styles.flex}
          onPress={() => openEntry(fund.id, 'deposit')}
        />
        <Button
          label={t('funds.spend')}
          icon="minus"
          tint={colors.expense}
          style={styles.flex}
          onPress={() => openEntry(fund.id, 'spend')}
        />
      </View>

      <SectionTitle>{t('funds.entries')}</SectionTitle>
      {entries.length === 0 ? (
        <AppText variant="body" color="textSecondary">
          {t('funds.noEntries')}
        </AppText>
      ) : (
        <Card>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} fund={fund} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  summary: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stats: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  stat: { flexGrow: 1, flexBasis: 90, gap: 2 },
  actions: { flexDirection: 'row', gap: 12 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
  },
});
