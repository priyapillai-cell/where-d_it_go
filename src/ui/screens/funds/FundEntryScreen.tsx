import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase } from '@/db/database';
import { getFund, getFundEntry } from '@/db/repositories/fundRepository';
import {
  applyKey,
  evaluateExpression,
  expressionFromMinor,
  type KeypadKey,
} from '@/domain/calculator';
import { currencyFractionDigits } from '@/domain/money';
import type { FundEntry, FundEntryType, SinkingFund } from '@/domain/types';
import { MAX_NOTE_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import { formatDate, formatShortRelative, money } from '@/i18n/format';
import { deleteFundEntry, restoreFundEntry, saveFundEntry } from '@/services/fundService';
import { write } from '@/services/writes';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { Keypad } from '../../components/Keypad';
import { ModalHeader } from '../../components/ModalHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/States';
import { useTheme } from '../../theme/ThemeProvider';

export function FundEntryScreen() {
  const params = useLocalSearchParams<{ fundId: string; type?: string; id?: string }>();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  const [fund, setFund] = useState<SinkingFund | null>(null);
  const [missing, setMissing] = useState(false);
  const [existing, setExisting] = useState<FundEntry | null>(null);
  const [type, setType] = useState<FundEntryType>(params.type === 'spend' ? 'spend' : 'deposit');
  const [expression, setExpression] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDatabase();
      const loaded = await getFund(db, params.fundId);
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        return;
      }
      setFund(loaded);
      if (!params.id) return;
      const entry = await getFundEntry(db, params.id);
      if (cancelled || !entry) return;
      setExisting(entry);
      setType(entry.type);
      setExpression(expressionFromMinor(entry.amount, currencyFractionDigits(loaded.currency)));
      setDate(new Date(entry.date));
      setNote(entry.note);
    })().catch((e: unknown) => logger.error('Failed to load fund entry', e));
    return () => {
      cancelled = true;
    };
  }, [params.fundId, params.id]);

  const currency = fund?.currency ?? 'USD';
  const digits = currencyFractionDigits(currency);
  const result = evaluateExpression(expression, digits);
  const amount = result.ok ? result.value : 0;
  const tint = type === 'deposit' ? colors.income : colors.expense;

  const onKey = (key: KeypadKey) => {
    setError(undefined);
    setExpression((expr) => applyKey(expr, key, digits));
  };

  const onSave = async () => {
    if (!fund) return;
    if (amount <= 0) return setError(t('editor.enterAmount'));
    setSaving(true);
    try {
      const saved = await write((db) =>
        saveFundEntry(db, fund.id, { type, amount, note, date: date.toISOString() }, existing?.id),
      );
      if (!saved.ok) {
        const code = Object.values(saved.error).find(Boolean);
        setError(code ? t(`validation.${code}`) : t('common.somethingWentWrong'));
        return;
      }
      router.back();
      const previous = existing;
      showToast({
        message: t('funds.entrySaved'),
        actionLabel: t('common.undo'),
        onAction: async () => {
          await write(async (db) => {
            if (previous) await restoreFundEntry(db, previous);
            else await deleteFundEntry(db, saved.value.id);
          });
        },
      });
    } catch (e) {
      logger.error('Saving fund entry failed', e);
      setError(t('common.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    try {
      const removed = await write((db) => deleteFundEntry(db, existing.id));
      router.back();
      if (removed) {
        showToast({
          message: t('funds.entryDeleted'),
          actionLabel: t('common.undo'),
          onAction: async () => {
            await write((db) => restoreFundEntry(db, removed));
          },
        });
      }
    } catch (e) {
      logger.error('Deleting fund entry failed', e);
    }
  };

  if (missing) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ModalHeader title={t('funds.title')} onClose={() => router.back()} />
        <EmptyState icon="piggy-bank-outline" title={t('funds.notFound')} />
      </View>
    );
  }

  const title = existing
    ? t('funds.editEntry')
    : type === 'deposit'
      ? t('funds.newDeposit', { name: fund?.name ?? '' })
      : t('funds.newSpend', { name: fund?.name ?? '' });

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
              label={t('funds.deleteEntry')}
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
        <SegmentedControl<FundEntryType>
          segments={[
            { value: 'deposit', label: t('funds.deposit') },
            { value: 'spend', label: t('funds.spend') },
          ]}
          value={type}
          onChange={setType}
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
          accessibilityLabel={t('keypad.display', { value: money(amount, currency) })}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="caption" color="textSecondary">
            {fund ? `${fund.name} · ${currency}` : currency}
          </AppText>
          <AppText
            variant="display"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: tint }}
          >
            {expression === '' ? '0' : expression.replace(/-/g, '−')}
          </AppText>
          {result.ok && /[+\-×÷]/.test(expression.slice(1)) ? (
            <AppText variant="caption" color="textSecondary" tabular>
              {t('editor.preview', { value: money(amount, currency) })}
            </AppText>
          ) : null}
        </View>

        {error ? (
          <AppText variant="caption" color="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <View style={styles.chips}>
          <Chip
            label={formatShortRelative(date)}
            icon="calendar"
            accessibilityLabel={`${t('editor.date')}: ${formatDate(date, 'long')}`}
            onPress={() => setPicking(true)}
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
          tint={tint}
          loading={saving}
          disabled={!fund}
          onPress={onSave}
        />
      </View>

      <DatePickerModal
        visible={picking}
        value={date}
        title={t('editor.date')}
        onCancel={() => setPicking(false)}
        onConfirm={(d) => {
          setDate(d);
          setPicking(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  display: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, alignItems: 'flex-end' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  note: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  keypad: { paddingHorizontal: 16, gap: 8, paddingTop: 8 },
});
