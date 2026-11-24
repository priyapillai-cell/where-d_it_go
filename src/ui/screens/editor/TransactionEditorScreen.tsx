import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { lastUsedCategoryId } from '@/db/repositories/transactionRepository';
import { getDatabase } from '@/db/database';
import {
  applyKey,
  evaluateExpression,
  expressionFromMinor,
  hasOperator,
  type KeypadKey,
} from '@/domain/calculator';
import { currencyFractionDigits } from '@/domain/money';
import type { CategoryType, Transaction } from '@/domain/types';
import { MAX_NOTE_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import { formatDate, formatShortRelative, money } from '@/i18n/format';
import { selectActiveAccounts, useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import {
  deleteTransaction,
  loadTransaction,
  restoreTransaction,
  saveTransaction,
} from '@/services/transactionService';
import { logger } from '@/utils/logger';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { Keypad } from '../../components/Keypad';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useTheme } from '../../theme/ThemeProvider';

type Params = { id?: string; type?: string; categoryId?: string; accountId?: string };

function parseType(value: string | undefined): CategoryType {
  return value === 'income' ? 'income' : 'expense';
}

export function TransactionEditorScreen() {
  const params = useLocalSearchParams<Params>();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useAppStore(useShallow(selectActiveAccounts));
  const allAccounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);

  const [existing, setExisting] = useState<Transaction | null>(null);
  const [type, setType] = useState<CategoryType>(parseType(params.type));
  const [expression, setExpression] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(
    params.accountId ?? accounts[0]?.id ?? null,
  );
  const [date, setDate] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<'none' | 'account' | 'date'>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const account = allAccounts.find((a) => a.id === accountId) ?? null;
  const currency = account?.currency ?? useAppStore.getState().settings.defaultCurrency;
  const digits = currencyFractionDigits(currency);

  useEffect(() => {
    let cancelled = false;
    if (params.id) {
      loadTransaction(params.id)
        .then((tx) => {
          if (cancelled || !tx) return;
          if (tx.type === 'transfer') {
            router.replace({ pathname: '/transfer', params: { id: tx.id } });
            return;
          }
          const txAccount = useAppStore.getState().accounts.find((a) => a.id === tx.accountId);
          setExisting(tx);
          setType(tx.type);
          setExpression(
            expressionFromMinor(tx.amount, currencyFractionDigits(txAccount?.currency ?? 'USD')),
          );
          setCategoryId(tx.categoryId);
          setAccountId(tx.accountId);
          setDate(new Date(tx.date));
          setNote(tx.note);
        })
        .catch((e: unknown) => logger.error('Failed to load transaction', e));
    } else if (!params.categoryId) {
      getDatabase()
        .then((db) => lastUsedCategoryId(db, parseType(params.type)))
        .then((id) => {
          if (!cancelled && id) setCategoryId((current) => current ?? id);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [params.id, params.categoryId, params.type]);

  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === type && (!c.isArchived || c.id === categoryId)),
    [categories, type, categoryId],
  );

  const selectedCategoryId = typeCategories.some((c) => c.id === categoryId) ? categoryId : null;

  const result = evaluateExpression(expression, digits);
  const amount = result.ok ? result.value : 0;
  const showPreview = hasOperator(expression) && result.ok;
  const typeColor = type === 'expense' ? colors.expense : colors.income;
  const isEdit = existing !== null;
  const title = isEdit
    ? t(type === 'expense' ? 'editor.editExpense' : 'editor.editIncome')
    : t(type === 'expense' ? 'editor.newExpense' : 'editor.newIncome');

  const onKey = (key: KeypadKey) => {
    setError(undefined);
    setExpression((expr) => applyKey(expr, key, digits));
  };

  const onSave = async () => {
    if (amount <= 0) {
      setError(t('editor.enterAmount'));
      return;
    }
    if (!selectedCategoryId) {
      setError(t('editor.chooseCategory'));
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTransaction(
        {
          type,
          amount,
          toAmount: null,
          accountId,
          toAccountId: null,
          categoryId,
          note,
          date: date.toISOString(),
        },
        existing?.id,
      );
      if (!saved.ok) {
        const code = Object.values(saved.error).find(Boolean);
        setError(code ? t(`validation.${code}`) : undefined);
        return;
      }
      router.back();
      const previous = existing;
      if (previous) {
        showToast({
          message: t('editor.updated'),
          actionLabel: t('common.undo'),
          onAction: async () => {
            await saveTransaction(previous, previous.id);
          },
        });
      } else {
        showToast({
          message: t('editor.saved', { type: t(`types.${type}`) }),
          actionLabel: t('common.undo'),
          onAction: async () => {
            await deleteTransaction(saved.value.id);
          },
        });
      }
    } catch (e) {
      logger.error('Saving transaction failed', e);
      setError(t('common.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    try {
      const removed = await deleteTransaction(existing.id);
      router.back();
      if (removed) {
        showToast({
          message: t('editor.deleted'),
          actionLabel: t('common.undo'),
          onAction: () => restoreTransaction(removed),
        });
      }
    } catch (e) {
      logger.error('Deleting transaction failed', e);
    }
  };

  const displayExpression = expression === '' ? '0' : expression.replace(/-/g, '−');

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <View style={styles.header}>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
        <AppText variant="title" accessibilityRole="header" style={styles.flex} align="center">
          {title}
        </AppText>
        {isEdit ? (
          <IconButton
            icon="delete-outline"
            label={t('common.delete')}
            color={colors.danger}
            onPress={onDelete}
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.body}>
        <SegmentedControl
          segments={[
            { value: 'expense', label: t('types.expense') },
            { value: 'income', label: t('types.income') },
          ]}
          value={type}
          onChange={(next) => {
            setType(next);
            setCategoryId(null);
          }}
        />

        <View
          style={[
            styles.display,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderColor: error ? colors.danger : colors.border,
            },
          ]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('keypad.display', { value: money(amount, currency) })}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="caption" color="textSecondary">
            {account?.name ?? ''} · {currency}
          </AppText>
          <AppText
            variant="display"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: typeColor }}
          >
            {type === 'expense' ? '−' : '+'}
            {displayExpression}
          </AppText>
          {showPreview ? (
            <AppText variant="body" color="textSecondary" tabular>
              = {money(amount, currency)}
            </AppText>
          ) : null}
          {expression !== '' && !result.ok && result.error === 'divisionByZero' ? (
            <AppText variant="caption" color="danger">
              ÷ 0
            </AppText>
          ) : null}
        </View>
        {error ? (
          <AppText variant="caption" color="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel={t('editor.category')}
        >
          {typeCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === selectedCategoryId}
              leading={<CategoryIcon icon={c.icon} color={c.color} size={24} />}
              onPress={() => {
                setError(undefined);
                setCategoryId(c.id);
              }}
            />
          ))}
        </ScrollView>

        <View style={styles.metaRow}>
          <Chip
            label={account?.name ?? t('editor.noAccounts')}
            icon="wallet-outline"
            trailingIcon="chevron-down"
            accessibilityLabel={`${t('editor.account')}: ${account?.name ?? ''}`}
            onPress={() => setSheet('account')}
          />
          <Chip
            label={formatShortRelative(date)}
            icon="calendar"
            accessibilityLabel={`${t('editor.date')}: ${formatDate(date, 'long')}`}
            onPress={() => setSheet('date')}
          />
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('common.noteOptional')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('editor.note')}
          maxLength={MAX_NOTE_LENGTH}
          returnKeyType="done"
          style={[
            styles.note,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        />
      </View>

      <View style={styles.keypad}>
        <Keypad onKey={onKey} allowDecimal={digits > 0} />
        <Button
          label={t('common.save')}
          icon="check"
          size="large"
          tint={typeColor}
          loading={saving}
          onPress={onSave}
          accessibilityHint={money(amount, currency)}
        />
      </View>

      <AccountSheet
        visible={sheet === 'account'}
        selected={accountId}
        onSelect={(id) => {
          setAccountId(id);
          const next = allAccounts.find((a) => a.id === id);
          if (next)
            setExpression((expr) => (currencyFractionDigits(next.currency) === digits ? expr : ''));
        }}
        onClose={() => setSheet('none')}
      />
      <DatePickerModal
        visible={sheet === 'date'}
        value={date}
        title={t('editor.date')}
        onCancel={() => setSheet('none')}
        onConfirm={(d) => {
          setDate(d);
          setSheet('none');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 8 },
  headerSpacer: { width: 48 },
  body: { paddingHorizontal: 16, gap: 10, flexShrink: 1 },
  display: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, alignItems: 'flex-end' },
  chips: { gap: 8, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  note: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  keypad: { marginTop: 'auto', paddingHorizontal: 16, gap: 8, paddingTop: 8 },
});
