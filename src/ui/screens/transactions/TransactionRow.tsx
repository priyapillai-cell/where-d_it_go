import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { type Account, assertNever, type Category, type Transaction } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, money } from '@/i18n/format';

import { AppText } from '../../components/AppText';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';

export interface RowLookups {
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
}

export function describeTransaction(tx: Transaction, lookups: RowLookups) {
  const account = lookups.accounts.get(tx.accountId);
  const currency = account?.currency ?? 'USD';
  switch (tx.type) {
    case 'transfer': {
      const to = tx.toAccountId ? lookups.accounts.get(tx.toAccountId) : undefined;
      return {
        title: t('transactions.transferLabel', { from: account?.name ?? '?', to: to?.name ?? '?' }),
        icon: 'swap-horizontal',
        color: '#546E7A',
        amountText: money(tx.amount, currency),
        secondaryAmount:
          to && to.currency !== currency ? money(tx.toAmount ?? tx.amount, to.currency) : null,
        tone: 'transfer' as const,
        account,
      };
    }
    case 'expense':
    case 'income': {
      const category = tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined;
      return {
        title: category?.name ?? t('transactions.uncategorized'),
        icon: category?.icon ?? 'help',
        color: category?.color ?? '#757575',
        amountText: money(tx.type === 'expense' ? -tx.amount : tx.amount, currency, 'always'),
        secondaryAmount: null,
        tone: tx.type,
        account,
      };
    }
    default:
      return assertNever(tx.type);
  }
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('transactions.deleteA11y')}
      onPress={onPress}
      style={[styles.deleteAction, { backgroundColor: colors.danger }]}
    >
      <Icon name="delete-outline" size={24} color={colors.onDanger} />
      <AppText variant="label" style={{ color: colors.onDanger }}>
        {t('common.delete')}
      </AppText>
    </Pressable>
  );
}

export const TransactionRow = memo(function TransactionRow({
  tx,
  lookups,
  onPress,
  onDelete,
}: {
  tx: Transaction;
  lookups: RowLookups;
  onPress: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { colors } = useTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const info = describeTransaction(tx, lookups);
  const amountColor =
    info.tone === 'expense'
      ? colors.expense
      : info.tone === 'income'
        ? colors.income
        : colors.transfer;
  const subtitle = [tx.note, info.account?.name].filter(Boolean).join(' · ');

  // Rows are recycled by FlashList; never let an open swipe leak onto another transaction.
  useEffect(() => {
    swipeRef.current?.reset();
  }, [tx.id]);

  const remove = () => {
    swipeRef.current?.reset();
    onDelete(tx);
  };

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={64}
      overshootRight={false}
      renderRightActions={() => <DeleteAction onPress={remove} />}
      onSwipeableOpen={remove}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('transactions.rowA11y', {
          type: t(`types.${tx.type}`),
          category: info.title,
          amount: info.amountText,
          account: info.account?.name ?? '',
          note: tx.note,
        })}
        accessibilityHint={t('transactions.swipeHint')}
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') remove();
        }}
        onPress={() => onPress(tx)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? colors.surfaceVariant : colors.surface },
        ]}
      >
        <CategoryIcon icon={info.icon} color={info.color} size={40} />
        <View style={styles.text}>
          <AppText variant="body" numberOfLines={1}>
            {info.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle || formatDate(new Date(tx.date), 'time')}
          </AppText>
        </View>
        <View style={styles.amounts}>
          <AppText variant="subtitle" tabular style={{ color: amountColor }}>
            {info.amountText}
          </AppText>
          {info.secondaryAmount ? (
            <AppText variant="caption" color="textSecondary" tabular>
              → {info.secondaryAmount}
            </AppText>
          ) : null}
          {tx.recurringRuleId ? (
            <Icon name="repeat" size={14} color={colors.textSecondary} />
          ) : null}
        </View>
      </Pressable>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: { flex: 1 },
  amounts: { alignItems: 'flex-end', gap: 2 },
  deleteAction: { width: 96, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
