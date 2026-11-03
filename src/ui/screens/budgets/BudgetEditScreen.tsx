import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listBudgets } from '@/db/repositories/budgetRepository';
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
import { FieldLabel, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { SelectSheet } from '../../components/SelectSheet';
import { ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';

const OVERALL = '__overall__';

export function BudgetEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { data: budgets } = useDbQuery('budget-edit', listBudgets);
  if (params.id && !budgets) return <ListSkeleton />;
  const existing = budgets?.find((b) => b.id === params.id) ?? null;
  return <BudgetForm key={existing?.id ?? 'new'} existing={existing} />;
}

function BudgetForm({ existing }: { existing: Budget | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);

  const [scope, setScope] = useState<string>(existing?.categoryId ?? OVERALL);
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [amountText, setAmountText] = useState(
    existing ? toMajorString(existing.amount, existing.currency) : '',
  );
  const [error, setError] = useState<ValidationCode | 'invalidNumber' | undefined>();
  const [sheet, setSheet] = useState<'none' | 'scope' | 'currency'>('none');
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
    Alert.alert(t('budgets.deleteConfirm'), undefined, [
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
        <FieldLabel>{t('budgets.scope')}</FieldLabel>
        <View style={styles.wrap}>
          <Chip
            label={scopeLabel}
            leading={
              selectedCategory ? (
                <CategoryIcon
                  icon={selectedCategory.icon}
                  color={selectedCategory.color}
                  size={24}
                />
              ) : undefined
            }
            icon={selectedCategory ? undefined : 'wallet-outline'}
            trailingIcon="chevron-down"
            accessibilityLabel={`${t('budgets.scope')}: ${scopeLabel}`}
            onPress={() => setSheet('scope')}
          />
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
        visible={sheet === 'scope'}
        title={t('budgets.scope')}
        options={[
          { value: OVERALL, label: t('budgets.allExpenses') },
          ...expenseCategories.map((c) => ({
            value: c.id,
            label: c.name,
            leading: <CategoryIcon icon={c.icon} color={c.color} size={32} />,
          })),
        ]}
        selected={scope}
        onSelect={setScope}
        onClose={() => setSheet('none')}
      />
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  delete: { marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
