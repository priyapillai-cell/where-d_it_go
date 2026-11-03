import { FlashList } from '@shopify/flash-list';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { listTransactions } from '@/db/repositories/transactionRepository';
import { groupByDay } from '@/domain/aggregation';
import { activeFilterCount } from '@/domain/transactionFilter';
import type { Transaction } from '@/domain/types';
import { t } from '@/i18n';
import { formatRelativeDay, money } from '@/i18n/format';
import { accountMap, categoryMap, useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';
import { showToast } from '@/state/toastStore';
import { deleteTransaction, restoreTransaction } from '@/services/transactionService';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Icon } from '../../components/Icon';
import { EmptyState, ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { type RowLookups, TransactionRow } from './TransactionRow';

type ListItem =
  | { kind: 'header'; key: string; date: Date; totals: string }
  | { kind: 'row'; key: string; tx: Transaction };

/** Net per currency for a day, e.g. "−$45.00 · +€10.00" (currencies are never mixed). */
function dayTotals(items: readonly Transaction[], lookups: RowLookups): string {
  const net = new Map<string, number>();
  for (const tx of items) {
    if (tx.type === 'transfer') continue;
    const currency = lookups.accounts.get(tx.accountId)?.currency ?? 'USD';
    net.set(currency, (net.get(currency) ?? 0) + (tx.type === 'expense' ? -tx.amount : tx.amount));
  }
  return [...net.entries()]
    .map(([currency, amount]) => money(amount, currency, 'exceptZero'))
    .join(' · ');
}

export function TransactionsScreen() {
  const { colors, radius } = useTheme();
  const navigation = useNavigation();
  const filter = useFilterStore((s) => s.filter);
  const setFilter = useFilterStore((s) => s.setFilter);
  const resetFilters = useFilterStore((s) => s.resetFilters);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const [search, setSearch] = useState(filter.search);

  useEffect(() => {
    const handle = setTimeout(() => setFilter({ search }), 200);
    return () => clearTimeout(handle);
  }, [search, setFilter]);

  const lookups = useMemo<RowLookups>(
    () => ({ accounts: accountMap(accounts), categories: categoryMap(categories) }),
    [accounts, categories],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="plus"
          label={t('home.addExpenseA11y')}
          onPress={() => router.push({ pathname: '/transaction', params: { type: 'expense' } })}
        />
      ),
    });
  }, [navigation]);

  const { data, loading } = useDbQuery(`transactions|${JSON.stringify(filter)}`, (db) =>
    listTransactions(db, filter),
  );

  const { items, stickyIndices } = useMemo(() => {
    const list: ListItem[] = [];
    const sticky: number[] = [];
    for (const group of groupByDay(data ?? [])) {
      sticky.push(list.length);
      list.push({
        kind: 'header',
        key: `h-${group.key}`,
        date: group.date,
        totals: dayTotals(group.items, lookups),
      });
      for (const tx of group.items) list.push({ kind: 'row', key: tx.id, tx });
    }
    return { items: list, stickyIndices: sticky };
  }, [data, lookups]);

  const onPress = useCallback((tx: Transaction) => {
    router.push({
      pathname: tx.type === 'transfer' ? '/transfer' : '/transaction',
      params: { id: tx.id },
    });
  }, []);

  const onDelete = useCallback((tx: Transaction) => {
    deleteTransaction(tx.id)
      .then((removed) => {
        if (removed) {
          showToast({
            message: t('editor.deleted'),
            actionLabel: t('common.undo'),
            onAction: () => restoreTransaction(removed),
          });
        }
      })
      .catch((error: unknown) => logger.error('Delete failed', error));
  }, []);

  const filterCount = activeFilterCount(filter);
  const hasQuery = filterCount > 0 || filter.search.trim() !== '';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={styles.toolbar}>
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <Icon name="magnify" size={20} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('transactions.search')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('transactions.search')}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search !== '' ? (
            <IconButton
              icon="close-circle"
              label={t('common.clear')}
              size={20}
              onPress={() => setSearch('')}
            />
          ) : null}
        </View>
        <Chip
          label={
            filterCount > 0
              ? t('transactions.filtersActive', { count: filterCount })
              : t('transactions.filters')
          }
          icon="filter-variant"
          selected={filterCount > 0}
          onPress={() => router.push('/transaction-filters')}
        />
      </View>
      {data ? (
        <AppText variant="caption" color="textSecondary" style={styles.count}>
          {t('transactions.count', { count: data.length })}
        </AppText>
      ) : null}

      {loading && !data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        hasQuery ? (
          <EmptyState
            icon="filter-remove-outline"
            title={t('transactions.noResults')}
            actionLabel={t('transactions.clearFilters')}
            onAction={() => {
              setSearch('');
              resetFilters();
            }}
          />
        ) : (
          <EmptyState
            icon="receipt"
            title={t('transactions.empty')}
            hint={t('transactions.emptyHint')}
            actionLabel={t('home.addExpenseA11y')}
            onAction={() => router.push({ pathname: '/transaction', params: { type: 'expense' } })}
          />
        )
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          stickyHeaderIndices={stickyIndices}
          extraData={lookups}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View
                accessibilityRole="header"
                style={[
                  styles.header,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <AppText variant="label" style={styles.flex}>
                  {formatRelativeDay(item.date)}
                </AppText>
                <AppText variant="label" color="textSecondary" tabular>
                  {item.totals}
                </AppText>
              </View>
            ) : (
              <TransactionRow
                tx={item.tx}
                lookups={lookups}
                onPress={onPress}
                onDelete={onDelete}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 4 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingLeft: 12,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 16, paddingHorizontal: 8, minHeight: 44 },
  count: { paddingHorizontal: 16, paddingBottom: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: { paddingBottom: 48 },
});
