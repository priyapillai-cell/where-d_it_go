import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { totalsByCurrency } from '@/domain/balance';
import type { Account } from '@/domain/types';
import { t } from '@/i18n';
import { money } from '@/i18n/format';
import { moveAccount } from '@/services/accountService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card, SectionTitle } from '../../components/FormField';
import { EmptyState } from '../../components/States';
import { useTheme } from '../../theme/ThemeProvider';

function AccountRow({
  account,
  balance,
  isFirst,
  isLast,
  onMove,
}: {
  account: Account;
  balance: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const { colors } = useTheme();
  const amount = money(balance, account.currency);
  const badges = [
    account.isArchived ? t('common.archived') : null,
    !account.includeInTotal ? t('accounts.excluded') : null,
  ].filter((b): b is string => b !== null);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          t('accounts.balanceA11y', { name: account.name, amount }),
          ...badges,
        ].join(', ')}
        accessibilityHint={t('accounts.edit')}
        onPress={() => router.push({ pathname: '/account-edit', params: { id: account.id } })}
        style={({ pressed }) => [
          styles.rowMain,
          { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
        ]}
      >
        <CategoryIcon icon={account.icon} color={account.color} size={40} />
        <View style={styles.flex}>
          <AppText variant="body" numberOfLines={1}>
            {account.name}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {[account.currency, ...badges].join(' · ')}
          </AppText>
        </View>
        <AppText variant="subtitle" tabular color={balance < 0 ? 'expense' : 'text'}>
          {amount}
        </AppText>
      </Pressable>
      {!account.isArchived ? (
        <View style={styles.reorder}>
          <IconButton
            icon="chevron-up"
            label={`${t('common.moveUp')}: ${account.name}`}
            disabled={isFirst}
            size={20}
            onPress={() => onMove(-1)}
          />
          <IconButton
            icon="chevron-down"
            label={`${t('common.moveDown')}: ${account.name}`}
            disabled={isLast}
            size={20}
            onPress={() => onMove(1)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function AccountsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const accounts = useAppStore((s) => s.accounts);
  const balances = useAppStore((s) => s.balances);
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);
  const [showArchived, setShowArchived] = useState(false);

  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);
  const totals = totalsByCurrency(accounts, balances, defaultCurrency);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton
            icon="bank-transfer"
            label={t('accounts.transfer')}
            onPress={() => router.push('/transfer')}
          />
          <IconButton
            icon="plus"
            label={t('accounts.add')}
            onPress={() => router.push('/account-edit')}
          />
        </View>
      ),
    });
  }, [navigation]);

  const onMove = (id: string, direction: -1 | 1) => {
    write((db) => moveAccount(db, id, direction)).catch((e: unknown) =>
      logger.error('Reorder failed', e),
    );
  };

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="wallet-outline"
        title={t('accounts.empty')}
        hint={t('accounts.emptyHint')}
        actionLabel={t('accounts.add')}
        onAction={() => router.push('/account-edit')}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Card style={styles.totalCard}>
        <AppText variant="label" color="textSecondary">
          {t('accounts.total')}
        </AppText>
        {totals.map((total) => (
          <AppText key={total.currency} variant="headline" tabular>
            {money(total.total, total.currency)}
          </AppText>
        ))}
      </Card>

      <Card>
        {active.map((account, index) => (
          <AccountRow
            key={account.id}
            account={account}
            balance={balances.get(account.id) ?? account.initialBalance}
            isFirst={index === 0}
            isLast={index === active.length - 1}
            onMove={(direction) => onMove(account.id, direction)}
          />
        ))}
      </Card>

      <View style={styles.actions}>
        <Button
          label={t('accounts.transfer')}
          icon="bank-transfer"
          variant="tonal"
          onPress={() => router.push('/transfer')}
        />
        <Button
          label={t('accounts.add')}
          icon="plus"
          variant="tonal"
          onPress={() => router.push('/account-edit')}
        />
      </View>

      {archived.length > 0 ? (
        <>
          <Button
            label={showArchived ? t('accounts.hideArchived') : t('accounts.showArchived')}
            icon={showArchived ? 'eye-off-outline' : 'archive-outline'}
            variant="text"
            onPress={() => setShowArchived((v) => !v)}
          />
          {showArchived ? (
            <>
              <SectionTitle>{t('common.archived')}</SectionTitle>
              <Card>
                {archived.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    balance={balances.get(account.id) ?? account.initialBalance}
                    isFirst
                    isLast
                    onMove={() => undefined}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  totalCard: { padding: 16, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 64,
  },
  reorder: { flexDirection: 'row' },
  headerActions: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
