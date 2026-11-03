import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { getRecurringRule } from '@/db/repositories/recurringRepository';
import { parseAmount, toMajorString } from '@/domain/money';
import { nextOccurrence } from '@/domain/recurrence';
import { type CategoryType, FREQUENCIES, type Frequency, type RecurringRule } from '@/domain/types';
import { MAX_NOTE_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { runMaintenance } from '@/services/maintenanceService';
import { requestNotificationPermission } from '@/services/notificationService';
import {
  deleteRecurringRule,
  type RecurringFieldErrors,
  saveRecurringRule,
} from '@/services/recurringRuleService';
import { syncReminders } from '@/services/reminderService';
import { write } from '@/services/writes';
import { selectActiveAccounts, useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { FieldError, FieldLabel, SwitchRow, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SelectSheet } from '../../components/SelectSheet';
import { ListSkeleton } from '../../components/States';
import { useDbQuery } from '../../hooks/useDbQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { frequencyLabel, REMINDER_CHOICES, reminderLabel } from './labels';

export function RecurringEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, loading } = useDbQuery(`recurring-edit|${id ?? ''}`, (db) =>
    id ? getRecurringRule(db, id) : Promise.resolve(null),
  );
  if (id && loading && data === undefined) return <ListSkeleton />;
  return <RuleForm key={data?.id ?? 'new'} existing={data ?? null} />;
}

type Sheet = 'none' | 'account' | 'start' | 'end' | 'reminder';

function RuleForm({ existing }: { existing: RecurringRule | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useAppStore(useShallow(selectActiveAccounts));
  const allAccounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);

  const [type, setType] = useState<CategoryType>(
    existing?.type === 'income' ? 'income' : 'expense',
  );
  const [accountId, setAccountId] = useState<string | null>(
    existing?.accountId ?? accounts[0]?.id ?? null,
  );
  const account = allAccounts.find((a) => a.id === accountId) ?? null;
  const currency = account?.currency ?? 'USD';
  const [amountText, setAmountText] = useState(
    existing ? toMajorString(existing.amount, currency) : '',
  );
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [intervalText, setIntervalText] = useState(String(existing?.interval ?? 1));
  const [startDate, setStartDate] = useState(() =>
    existing ? new Date(existing.startDate) : new Date(),
  );
  const [endDate, setEndDate] = useState<Date | null>(
    existing?.endDate ? new Date(existing.endDate) : null,
  );
  const [reminder, setReminder] = useState<number | null>(existing?.reminderDaysBefore ?? null);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [errors, setErrors] = useState<RecurringFieldErrors & { amountText?: 'invalidNumber' }>({});
  const [sheet, setSheet] = useState<Sheet>('none');
  const [saving, setSaving] = useState(false);
  const [openedAt] = useState(() => new Date());

  const typeCategories = categories.filter(
    (c) => c.type === type && (!c.isArchived || c.id === categoryId),
  );
  const interval = Number.parseInt(intervalText, 10);
  const preview = Number.isFinite(interval)
    ? nextOccurrence(
        {
          frequency,
          interval,
          startDate: startDate.toISOString(),
          endDate: endDate?.toISOString() ?? null,
        },
        new Date(openedAt.getTime() - 1),
      )
    : null;

  const onSave = async () => {
    const amount = parseAmount(amountText, currency, { allowNegative: false });
    if (amount === null) {
      setErrors({ amountText: 'invalidNumber' });
      return;
    }
    setSaving(true);
    try {
      const result = await write((db) =>
        saveRecurringRule(
          db,
          {
            type,
            amount,
            accountId,
            categoryId: typeCategories.some((c) => c.id === categoryId) ? categoryId : null,
            note,
            frequency,
            interval: Number.isFinite(interval) ? interval : 0,
            startDate: startDate.toISOString(),
            endDate: endDate?.toISOString() ?? null,
            reminderDaysBefore: reminder,
            isActive,
          },
          existing?.id,
        ),
      );
      if (!result.ok) {
        setErrors(result.error);
        return;
      }
      router.back();
      if (reminder !== null) await requestNotificationPermission();
      await write((db) => runMaintenance(db, { source: 'foreground' }));
    } catch (e) {
      logger.error('Saving recurring rule failed', e);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert(t('recurring.deleteConfirm'), t('recurring.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          write(async (db) => {
            await deleteRecurringRule(db, existing.id);
            await syncReminders(db);
          })
            .then(() => router.back())
            .catch((e: unknown) => logger.error('Deleting recurring rule failed', e));
        },
      },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={existing ? t('recurring.edit') : t('recurring.new')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        <TextField
          label={`${t('editor.amount')} (${currency})`}
          value={amountText}
          onChangeText={(v) => {
            setAmountText(v);
            setErrors((e) => ({ ...e, amount: undefined, amountText: undefined }));
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.amountText ?? errors.amount}
        />

        <FieldLabel>{t('editor.category')}</FieldLabel>
        <View style={styles.wrap}>
          {typeCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === categoryId}
              leading={<CategoryIcon icon={c.icon} color={c.color} size={24} />}
              onPress={() => {
                setCategoryId(c.id);
                setErrors((e) => ({ ...e, categoryId: undefined }));
              }}
            />
          ))}
        </View>
        <FieldError code={errors.categoryId} />

        <View style={styles.wrap}>
          <Chip
            label={account?.name ?? t('editor.noAccounts')}
            icon="wallet-outline"
            trailingIcon="chevron-down"
            accessibilityLabel={`${t('editor.account')}: ${account?.name ?? ''}`}
            onPress={() => setSheet('account')}
          />
        </View>
        <FieldError code={errors.accountId} />

        <TextField
          label={t('editor.note')}
          value={note}
          onChangeText={setNote}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={t('common.optional')}
        />

        <FieldLabel>{t('recurring.frequency')}</FieldLabel>
        <SegmentedControl
          segments={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.${f}`) }))}
          value={frequency}
          onChange={setFrequency}
          accessibilityLabel={t('recurring.frequency')}
        />
        <TextField
          label={t('recurring.interval')}
          value={intervalText}
          onChangeText={(v) => {
            setIntervalText(v.replace(/\D/g, ''));
            setErrors((e) => ({ ...e, interval: undefined }));
          }}
          keyboardType="number-pad"
          maxLength={4}
          error={errors.interval}
        />
        {Number.isFinite(interval) && interval > 0 ? (
          <AppText variant="caption" color="textSecondary">
            {frequencyLabel(frequency, interval)}
          </AppText>
        ) : null}

        <View style={styles.wrap}>
          <Chip
            icon="calendar-start"
            label={`${t('recurring.startDate')}: ${formatDate(startDate, 'medium')}`}
            onPress={() => setSheet('start')}
          />
          <Chip
            icon="calendar-end"
            label={
              endDate
                ? `${t('recurring.endDate')}: ${formatDate(endDate, 'medium')}`
                : t('recurring.noEndDate')
            }
            selected={endDate !== null}
            onPress={() => setSheet('end')}
          />
          {endDate ? (
            <Chip icon="close" label={t('common.clear')} onPress={() => setEndDate(null)} />
          ) : null}
        </View>
        <FieldError code={errors.startDate ?? errors.endDate} />
        {preview ? (
          <AppText variant="caption" color="textSecondary">
            {t('recurring.next', { date: formatDate(preview, 'long') })}
          </AppText>
        ) : null}

        <View style={styles.wrap}>
          <Chip
            icon="bell-outline"
            label={`${t('recurring.reminder')}: ${reminderLabel(reminder)}`}
            trailingIcon="chevron-down"
            selected={reminder !== null}
            onPress={() => setSheet('reminder')}
          />
        </View>

        <SwitchRow label={t('recurring.active')} value={isActive} onValueChange={setIsActive} />

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

      <AccountSheet
        visible={sheet === 'account'}
        selected={accountId}
        onSelect={(next) => {
          setAccountId(next);
          setErrors((e) => ({ ...e, accountId: undefined }));
        }}
        onClose={() => setSheet('none')}
      />
      <DatePickerModal
        visible={sheet === 'start' || sheet === 'end'}
        value={(sheet === 'end' ? endDate : null) ?? startDate}
        minimumDate={sheet === 'end' ? startDate : undefined}
        title={sheet === 'end' ? t('recurring.endDate') : t('recurring.startDate')}
        onCancel={() => setSheet('none')}
        onConfirm={(d) => {
          if (sheet === 'end') setEndDate(d);
          else setStartDate(d);
          setErrors((e) => ({ ...e, startDate: undefined, endDate: undefined }));
          setSheet('none');
        }}
      />
      <SelectSheet
        visible={sheet === 'reminder'}
        title={t('recurring.reminder')}
        options={REMINDER_CHOICES.map((days) => ({
          value: days === null ? -1 : days,
          label: reminderLabel(days),
        }))}
        selected={reminder ?? -1}
        onSelect={(value) => setReminder(value < 0 ? null : value)}
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
