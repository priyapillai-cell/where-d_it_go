import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import {
  applyKey,
  evaluateExpression,
  expressionFromMinor,
  type KeypadKey,
} from '@/domain/calculator';
import { convertAmount, currencyFractionDigits, parseAmount, toMajorString } from '@/domain/money';
import type { Transaction } from '@/domain/types';
import { MAX_NOTE_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import { formatDate, formatShortRelative, money } from '@/i18n/format';
import {
  deleteTransaction,
  loadTransaction,
  restoreTransaction,
  saveTransaction,
} from '@/services/transactionService';
import { selectActiveAccounts, useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { TextField } from '../../components/FormField';
import { Keypad } from '../../components/Keypad';
import { ModalHeader } from '../../components/ModalHeader';
import { EmptyState } from '../../components/States';
import { useTheme } from '../../theme/ThemeProvider';

/** Display-only rate derived from stored amounts, e.g. "0.92". */
function impliedRate(amount: number, from: string, toAmount: number, to: string): string {
  const ratio = Number(toMajorString(toAmount, to)) / Number(toMajorString(amount, from));
  return Number.isFinite(ratio) && ratio > 0 ? String(Number(ratio.toFixed(6))) : '';
}

export function TransferEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; fromAccountId?: string }>();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const active = useAppStore(useShallow(selectActiveAccounts));
  const allAccounts = useAppStore((s) => s.accounts);

  const [existing, setExisting] = useState<Transaction | null>(null);
  const [fromId, setFromId] = useState<string | null>(
    params.fromAccountId ?? active[0]?.id ?? null,
  );
  const [toId, setToId] = useState<string | null>(
    active.find((a) => a.id !== (params.fromAccountId ?? active[0]?.id))?.id ?? null,
  );
  const [expression, setExpression] = useState('');
  const [rate, setRate] = useState('');
  const [receivedText, setReceivedText] = useState('');
  const [receivedEdited, setReceivedEdited] = useState(false);
  const [date, setDate] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<'none' | 'from' | 'to' | 'date'>('none');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const from = allAccounts.find((a) => a.id === fromId) ?? null;
  const to = allAccounts.find((a) => a.id === toId) ?? null;
  const fromCurrency = from?.currency ?? 'USD';
  const toCurrency = to?.currency ?? fromCurrency;
  const crossCurrency = fromCurrency !== toCurrency;
  const digits = currencyFractionDigits(fromCurrency);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    loadTransaction(params.id)
      .then((tx) => {
        if (cancelled || !tx || tx.type !== 'transfer') return;
        const accounts = useAppStore.getState().accounts;
        const src = accounts.find((a) => a.id === tx.accountId)?.currency ?? 'USD';
        const dst = accounts.find((a) => a.id === tx.toAccountId)?.currency ?? src;
        setExisting(tx);
        setFromId(tx.accountId);
        setToId(tx.toAccountId);
        setExpression(expressionFromMinor(tx.amount, currencyFractionDigits(src)));
        if (src !== dst && tx.toAmount !== null) {
          setReceivedText(toMajorString(tx.toAmount, dst));
          setReceivedEdited(true);
          setRate(impliedRate(tx.amount, src, tx.toAmount, dst));
        }
        setDate(new Date(tx.date));
        setNote(tx.note);
      })
      .catch((e: unknown) => logger.error('Failed to load transfer', e));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const result = evaluateExpression(expression, digits);
  const amount = result.ok ? result.value : 0;
  const converted =
    crossCurrency && rate.trim() !== ''
      ? convertAmount(amount, fromCurrency, toCurrency, rate)
      : null;
  const received = !crossCurrency
    ? amount
    : receivedEdited
      ? parseAmount(receivedText, toCurrency, { allowNegative: false })
      : converted;

  const onKey = (key: KeypadKey) => {
    setError(undefined);
    setExpression((expr) => applyKey(expr, key, digits));
  };

  const onSave = async () => {
    if (amount <= 0) return setError(t('editor.enterAmount'));
    if (!fromId || !toId) return setError(t('validation.missingToAccount'));
    if (fromId === toId) return setError(t('validation.sameAccount'));
    if (crossCurrency && (received === null || received <= 0))
      return setError(t('validation.amountPositive'));
    setSaving(true);
    try {
      const saved = await saveTransaction(
        {
          type: 'transfer',
          amount,
          toAmount: crossCurrency ? received : amount,
          accountId: fromId,
          toAccountId: toId,
          categoryId: null,
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
      showToast({
        message: previous ? t('editor.updated') : t('editor.transferSaved'),
        actionLabel: t('common.undo'),
        onAction: async () => {
          if (previous) await saveTransaction(previous, previous.id);
          else await deleteTransaction(saved.value.id);
        },
      });
    } catch (e) {
      logger.error('Saving transfer failed', e);
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
      logger.error('Deleting transfer failed', e);
    }
  };

  const title = existing ? t('editor.editTransfer') : t('editor.newTransfer');

  if (active.length < 2 && !existing) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ModalHeader title={title} onClose={() => router.back()} />
        <EmptyState
          icon="bank-transfer"
          title={t('editor.needTwoAccounts')}
          actionLabel={t('accounts.add')}
          onAction={() => router.replace('/account-edit')}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <ModalHeader
        title={title}
        onClose={() => router.back()}
        right={
          existing ? (
            <IconButton
              icon="delete-outline"
              label={t('common.delete')}
              color={colors.danger}
              onPress={onDelete}
            />
          ) : undefined
        }
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.accounts}>
          <Chip
            label={from?.name ?? t('editor.fromAccount')}
            icon="arrow-up-circle-outline"
            trailingIcon="chevron-down"
            accessibilityLabel={`${t('editor.fromAccount')}: ${from?.name ?? ''}`}
            onPress={() => setSheet('from')}
          />
          <IconButton
            icon="swap-horizontal"
            label={`${t('editor.fromAccount')} ⇄ ${t('editor.toAccount')}`}
            onPress={() => {
              setFromId(toId);
              setToId(fromId);
              setExpression('');
              setReceivedEdited(false);
              setReceivedText('');
            }}
          />
          <Chip
            label={to?.name ?? t('editor.toAccount')}
            icon="arrow-down-circle-outline"
            trailingIcon="chevron-down"
            accessibilityLabel={`${t('editor.toAccount')}: ${to?.name ?? ''}`}
            onPress={() => setSheet('to')}
          />
        </View>

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
          accessibilityLabel={t('keypad.display', { value: money(amount, fromCurrency) })}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="caption" color="textSecondary">
            {fromCurrency}
          </AppText>
          <AppText
            variant="display"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: colors.transfer }}
          >
            {expression === '' ? '0' : expression.replace(/-/g, '−')}
          </AppText>
        </View>

        {crossCurrency ? (
          <View style={styles.fxRow}>
            <View style={styles.flex}>
              <TextField
                label={t('editor.exchangeRate')}
                placeholder={t('editor.exchangeRateHint', { from: fromCurrency, to: toCurrency })}
                value={rate}
                onChangeText={(v) => {
                  setError(undefined);
                  setRate(v);
                  setReceivedEdited(false);
                }}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label={`${t('editor.receivedAmount')} (${toCurrency})`}
                value={
                  receivedEdited
                    ? receivedText
                    : converted !== null
                      ? toMajorString(converted, toCurrency)
                      : ''
                }
                onChangeText={(v) => {
                  setError(undefined);
                  setReceivedText(v);
                  setReceivedEdited(true);
                }}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        ) : null}

        {error ? (
          <AppText variant="caption" color="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <View style={styles.accounts}>
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
      </ScrollView>

      <View style={styles.keypad}>
        <Keypad onKey={onKey} allowDecimal={digits > 0} />
        <Button
          label={t('common.save')}
          icon="check"
          size="large"
          tint={colors.transfer}
          loading={saving}
          onPress={onSave}
        />
      </View>

      <AccountSheet
        visible={sheet === 'from' || sheet === 'to'}
        title={sheet === 'to' ? t('editor.toAccount') : t('editor.fromAccount')}
        selected={sheet === 'to' ? toId : fromId}
        exclude={sheet === 'to' ? fromId : toId}
        onSelect={(id) => {
          setError(undefined);
          setReceivedEdited(false);
          setReceivedText('');
          if (sheet === 'to') setToId(id);
          else {
            const next = allAccounts.find((a) => a.id === id);
            if (next && currencyFractionDigits(next.currency) !== digits) setExpression('');
            setFromId(id);
          }
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
  body: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  accounts: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  display: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, alignItems: 'flex-end' },
  fxRow: { flexDirection: 'row', gap: 12 },
  note: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  keypad: { paddingHorizontal: 16, gap: 8, paddingTop: 8 },
});
