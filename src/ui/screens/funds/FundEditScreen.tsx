import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase } from '@/db/database';
import { getFund } from '@/db/repositories/fundRepository';
import { parseAmount, toMajorString } from '@/domain/money';
import { parseCalendarDay, toCalendarDay } from '@/domain/sinkingFunds';
import type { SinkingFund } from '@/domain/types';
import { MAX_NAME_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import {
  deleteFund,
  type FundFieldErrors,
  saveFund,
  setFundArchived,
} from '@/services/fundService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { FieldError, FieldLabel, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { ColorPicker, IconPicker } from '../../components/Pickers';
import { SelectSheet } from '../../components/SelectSheet';
import { PALETTE } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';
import { showAlert } from '../../dialogs';
import { currencyLabel, currencyOptions } from '../../currencyOptions';

type Preset = 'gifts' | 'vacation';

const PRESETS: Record<Preset, { name: () => string; icon: string; color: string }> = {
  gifts: {
    name: () => t('funds.suggestGifts'),
    icon: 'gift-outline',
    color: PALETTE[1] ?? '#D81B60',
  },
  vacation: {
    name: () => t('funds.suggestVacation'),
    icon: 'beach',
    color: PALETTE[5] ?? '#1E88E5',
  },
};

type Errors = FundFieldErrors & {
  targetText?: 'invalidNumber';
  monthlyText?: 'invalidNumber';
};

/** Empty text means "not set"; anything else must parse to a positive amount. */
function optionalAmount(text: string, currency: string): number | null | 'invalid' {
  if (text.trim() === '') return null;
  return parseAmount(text, currency, { allowNegative: false }) ?? 'invalid';
}

export function FundEditScreen() {
  const params = useLocalSearchParams<{ id?: string; preset?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);
  const preset =
    params.preset === 'gifts' || params.preset === 'vacation' ? PRESETS[params.preset] : null;

  const [existing, setExisting] = useState<SinkingFund | null>(null);
  const [name, setName] = useState(preset?.name() ?? '');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [targetText, setTargetText] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [monthlyText, setMonthlyText] = useState('');
  const [color, setColor] = useState(preset?.color ?? PALETTE[5] ?? '#1E88E5');
  const [icon, setIcon] = useState(preset?.icon ?? 'piggy-bank');
  const [errors, setErrors] = useState<Errors>({});
  const [sheet, setSheet] = useState<'none' | 'currency' | 'date'>('none');
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => new Date());

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    getDatabase()
      .then((db) => getFund(db, params.id as string))
      .then((fund) => {
        if (cancelled || !fund) return;
        setExisting(fund);
        setName(fund.name);
        setCurrency(fund.currency);
        setTargetText(fund.targetAmount ? toMajorString(fund.targetAmount, fund.currency) : '');
        setTargetDate(fund.targetDate);
        setMonthlyText(
          fund.monthlyContribution ? toMajorString(fund.monthlyContribution, fund.currency) : '',
        );
        setColor(fund.color);
        setIcon(fund.icon);
      })
      .catch((e: unknown) => logger.error('Failed to load fund', e));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const targetDay = targetDate ? parseCalendarDay(targetDate) : null;

  const onSave = async () => {
    const targetAmount = optionalAmount(targetText, currency);
    const monthlyContribution = optionalAmount(monthlyText, currency);
    if (targetAmount === 'invalid' || monthlyContribution === 'invalid') {
      setErrors({
        targetText: targetAmount === 'invalid' ? 'invalidNumber' : undefined,
        monthlyText: monthlyContribution === 'invalid' ? 'invalidNumber' : undefined,
      });
      return;
    }
    setSaving(true);
    try {
      const result = await write((db) =>
        saveFund(
          db,
          { name, icon, color, currency, targetAmount, targetDate, monthlyContribution },
          existing?.id,
        ),
      );
      if (!result.ok) {
        setErrors(result.error);
        return;
      }
      router.back();
    } catch (e) {
      logger.error('Saving fund failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setSaving(false);
    }
  };

  const onArchive = () => {
    if (!existing) return;
    const archive = async () => {
      await write((db) => setFundArchived(db, existing.id, !existing.isArchived));
      router.back();
    };
    if (existing.isArchived) {
      void archive();
      return;
    }
    showAlert(t('funds.archiveConfirm'), t('funds.archiveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), onPress: () => void archive() },
    ]);
  };

  const onDelete = () => {
    if (!existing) return;
    showAlert(t('funds.deleteConfirm'), t('funds.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await write((db) => deleteFund(db, existing.id));
          router.dismissTo('/funds');
          showToast({ message: t('funds.deleted') });
        },
      },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={existing ? t('funds.edit') : t('funds.new')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <CategoryIcon icon={icon} color={color} size={64} />
        </View>
        <TextField
          label={t('funds.name')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          maxLength={MAX_NAME_LENGTH}
          autoFocus={!params.id && !preset}
          error={errors.name}
        />

        <View style={styles.field}>
          <FieldLabel>{t('funds.currency')}</FieldLabel>
          <View style={styles.wrap}>
            <Chip
              label={currencyLabel(currency)}
              icon="currency-usd"
              trailingIcon="chevron-down"
              accessibilityLabel={`${t('funds.currency')}: ${currency}`}
              onPress={() => setSheet('currency')}
            />
          </View>
          {errors.currency === 'currencyLocked' ? (
            <AppText variant="caption" color="danger" accessibilityRole="alert">
              {t('funds.currencyLocked')}
            </AppText>
          ) : (
            <FieldError code={errors.currency} />
          )}
        </View>

        <TextField
          label={`${t('funds.target')} (${currency})`}
          value={targetText}
          onChangeText={(v) => {
            setTargetText(v);
            setErrors((e) => ({ ...e, targetText: undefined, targetAmount: undefined }));
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.targetText ?? errors.targetAmount}
        />

        <View style={styles.field}>
          <FieldLabel>{t('funds.targetDate')}</FieldLabel>
          <View style={styles.wrap}>
            <Chip
              label={targetDay ? formatDate(targetDay, 'long') : t('funds.noTargetDate')}
              icon="calendar"
              accessibilityLabel={`${t('funds.targetDate')}: ${
                targetDay ? formatDate(targetDay, 'long') : t('funds.noTargetDate')
              }`}
              onPress={() => setSheet('date')}
            />
            {targetDate ? (
              <Chip
                label={t('funds.clearDate')}
                icon="close"
                onPress={() => {
                  setTargetDate(null);
                  setErrors((e) => ({ ...e, targetDate: undefined }));
                }}
              />
            ) : null}
          </View>
          <FieldError code={errors.targetDate} />
        </View>

        <TextField
          label={`${t('funds.monthly')} (${currency})`}
          value={monthlyText}
          onChangeText={(v) => {
            setMonthlyText(v);
            setErrors((e) => ({ ...e, monthlyText: undefined, monthlyContribution: undefined }));
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.monthlyText ?? errors.monthlyContribution}
        />

        <FieldLabel>{t('funds.color')}</FieldLabel>
        <ColorPicker value={color} onChange={setColor} />
        <FieldLabel>{t('funds.icon')}</FieldLabel>
        <IconPicker value={icon} color={color} onChange={setIcon} />

        {existing ? (
          <View style={styles.dangerZone}>
            <Button
              label={existing.isArchived ? t('common.unarchive') : t('common.archive')}
              icon={existing.isArchived ? 'archive-arrow-up-outline' : 'archive-outline'}
              variant="outline"
              onPress={onArchive}
            />
            <Button
              label={t('common.delete')}
              icon="delete-outline"
              variant="danger"
              onPress={onDelete}
            />
          </View>
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
        title={t('funds.currency')}
        options={currencyOptions(currency)}
        selected={currency}
        onSelect={(code) => {
          setCurrency(code);
          setErrors((e) => ({ ...e, currency: undefined }));
        }}
        onClose={() => setSheet('none')}
      />
      <DatePickerModal
        visible={sheet === 'date'}
        value={targetDay ?? today}
        minimumDate={today}
        title={t('funds.targetDate')}
        onCancel={() => setSheet('none')}
        onConfirm={(d) => {
          setTargetDate(toCalendarDay(d));
          setErrors((e) => ({ ...e, targetDate: undefined }));
          setSheet('none');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  preview: { alignItems: 'center', paddingVertical: 4 },
  field: { gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dangerZone: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
