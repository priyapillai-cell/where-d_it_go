import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listBudgets } from '@/db/repositories/budgetRepository';
import { budgetToEdit } from '@/domain/budgets';
import { parseAmount, toMajorString } from '@/domain/money';
import type { Budget } from '@/domain/types';
import type { ValidationCode } from '@/domain/validation';
import { t } from '@/i18n';
import { deleteBudget, saveBudget } from '@/services/budgetService';
import { requestNotificationPermission } from '@/services/notificationService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { TextField } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ModalHeader } from '../../components/ModalHeader';
import { SelectSheet } from '../../components/SelectSheet';
import { ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { showAlert } from '../../dialogs';

const OVERALL = '__overall__';

export function BudgetEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);
  const { data: budgets } = useDbQuery('budget-edit', listBudgets);
  if (!budgets) return <ListSkeleton />;
  const existing = budgetToEdit(budgets, params.id, defaultCurrency);
  return <BudgetForm key={existing?.id ?? 'new'} existing={existing} />;
}

function BudgetForm({ existing }: { existing: Budget | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);

  const scope = existing?.categoryId ?? OVERALL;
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [amountText, setAmountText] = useState(
    existing ? toMajorString(existing.amount, existing.currency) : '',
  );
  const [error, setError] = useState<ValidationCode | 'invalidNumber' | undefined>();
  const [sheet, setSheet] = useState<'none' | 'currency'>('none');
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter(
    (c) => c.type === 'expense' && (!c.isArchived || c.id === existing?.categoryId),
  );
  const selectedCategory = expenseCategories.find((c) => c.id === scope) ?? null;
  const currencies = [
    ...new Set([defaultCurrency, ...accounts.filter((a) => !a.isArchived).map((a) => a.currency)]),
  ];

  const onSave = async () => {
    const amount = parseAmount(amountText, currency, { allowNegative: false });
    if (amount === null) {
      setError('invalidNumber');
      return;
    }
    setSaving(true);
    try {
      const result = await write((db) =>
        saveBudget(
          db,
          { categoryId: scope === OVERALL ? null : scope, amount, currency },
          existing?.id,
        ),
      );
      if (!result.ok) {
        setError(result.error.amount);
        return;
      }
      router.back();
      if (!(await requestNotificationPermission())) {
        showToast({ message: t('budgets.notificationsOff') });
      }
    } catch (e) {
      logger.error('Saving budget failed', e);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    showAlert(t('budgets.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          write((db) => deleteBudget(db, existing.id))
            .then(() => {
              router.back();
              showToast({ message: t('budgets.deleted') });
            })
            .catch((e: unknown) => logger.error('Deleting budget failed', e));
        },
      },
    ]);
  };

  const scopeLabel = selectedCategory?.name ?? t('budgets.allExpenses');

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={existing ? t('budgets.edit') : t('budgets.add')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.scope}>
          {selectedCategory ? (
            <CategoryIcon icon={selectedCategory.icon} color={selectedCategory.color} size={28} />
          ) : (
            <Icon name="wallet-outline" size={24} color={colors.primary} />
          )}
          <AppText variant="subtitle">{scopeLabel}</AppText>
        </View>
        <View style={styles.wrap}>
          {currencies.length > 1 ? (
            <Chip
              label={currency}
              icon="cash-multiple"
              trailingIcon="chevron-down"
              accessibilityLabel={`${t('budgets.currency')}: ${currency}`}
              onPress={() => setSheet('currency')}
            />
          ) : null}
        </View>

        <TextField
          label={`${t('budgets.amount')} (${currency})`}
          value={amountText}
          onChangeText={(v) => {
            setAmountText(v);
            setError(undefined);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          autoFocus={!existing}
          error={error}
        />
        {currencies.length > 1 ? (
          <AppText variant="caption" color="textSecondary">
            {t('budgets.currencyNote')}
          </AppText>
        ) : null}

        {existing ? (
          <Button
            label={t('common.delete')}
            icon="delete-outline"
            variant="danger"
            onPress={onDelete}
            style={styles.delete}
          />
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={t('common.save')}
          icon="check"
          size="large"
          loading={saving}
          onPress={onSave}
        />
      </View>

      <SelectSheet
        visible={sheet === 'currency'}
        title={t('budgets.currency')}
        options={currencies.map((code) => ({ value: code, label: code }))}
        selected={currency}
        onSelect={(code) => {
          setCurrency(code);
          setError(undefined);
        }}
        onClose={() => setSheet('none')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  delete: { marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
