import { router, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { listRecurringRules } from '@/db/repositories/recurringRepository';
import { nextOccurrence } from '@/domain/recurrence';
import type { RecurringRule } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, money } from '@/i18n/format';
import { accountMap, categoryMap, useAppStore } from '@/state/appStore';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card } from '../../components/FormField';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { frequencyLabel, reminderLabel } from './labels';

function statusText(rule: RecurringRule, now: Date): string {
  if (!rule.isActive) return t('recurring.paused');
  const next = nextOccurrence(rule, now);
  return next ? t('recurring.next', { date: formatDate(next, 'medium') }) : t('recurring.ended');
}

export function RecurringScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const { data: rules, loading } = useDbQuery('recurring', listRecurringRules);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="plus"
          label={t('recurring.add')}
          onPress={() => router.push('/recurring-edit')}
        />
      ),
    });
  }, [navigation]);

  if (loading && !rules) return <ListSkeleton />;
  if (!rules || rules.length === 0) {
    return (
      <EmptyState
        icon="calendar-sync"
        title={t('recurring.empty')}
        hint={t('recurring.emptyHint')}
        actionLabel={t('recurring.add')}
        onAction={() => router.push('/recurring-edit')}
      />
    );
  }

  const accountsById = accountMap(accounts);
  const categoriesById = categoryMap(categories);
  const now = new Date();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Card>
        {rules.map((rule) => {
          const category = rule.categoryId ? categoriesById.get(rule.categoryId) : undefined;
          const currency = accountsById.get(rule.accountId)?.currency ?? 'USD';
          const title = rule.note || category?.name || t('transactions.uncategorized');
          const amount = money(
            rule.type === 'expense' ? -rule.amount : rule.amount,
            currency,
            'always',
          );
          const details = [
            frequencyLabel(rule.frequency, rule.interval),
            statusText(rule, now),
            rule.reminderDaysBefore !== null ? reminderLabel(rule.reminderDaysBefore) : null,
          ].filter((d): d is string => d !== null);
          return (
            <Pressable
              key={rule.id}
              accessibilityRole="button"
              accessibilityLabel={[title, amount, ...details].join(', ')}
              accessibilityHint={t('recurring.edit')}
              onPress={() => router.push({ pathname: '/recurring-edit', params: { id: rule.id } })}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.surfaceVariant : 'transparent',
                  opacity: rule.isActive ? 1 : 0.6,
                },
              ]}
            >
              <CategoryIcon
                icon={category?.icon ?? 'calendar-sync'}
                color={category?.color ?? colors.textSecondary}
                size={40}
              />
              <View style={styles.flex}>
                <AppText variant="body" numberOfLines={1}>
                  {title}
                </AppText>
                <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                  {details.join(' · ')}
                </AppText>
              </View>
              <AppText
                variant="subtitle"
                tabular
                color={rule.type === 'expense' ? 'expense' : 'income'}
              >
                {amount}
              </AppText>
            </Pressable>
          );
        })}
      </Card>
      <Button
        label={t('recurring.add')}
        icon="plus"
        variant="tonal"
        onPress={() => router.push('/recurring-edit')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 64,
  },
});
