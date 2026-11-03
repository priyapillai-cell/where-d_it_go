import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COMMON_CURRENCIES } from '@/domain/currencies';
import { parseAmount, toMajorString } from '@/domain/money';
import { assertNever } from '@/domain/types';
import { MAX_NAME_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import {
  type AccountActionError,
  type AccountFieldErrors,
  deleteAccount,
  saveAccount,
  setAccountArchived,
} from '@/services/accountService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { FieldError, FieldLabel, SwitchRow, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { ColorPicker, IconPicker } from '../../components/Pickers';
import { SelectSheet } from '../../components/SelectSheet';
import { PALETTE } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';

function actionErrorMessage(error: AccountActionError): string {
  switch (error) {
    case 'lastAccount':
      return t('accounts.lastAccount');
    case 'hasTransactions':
      return t('accounts.cannotDelete');
    case 'notFound':
      return t('common.somethingWentWrong');
    default:
      return assertNever(error);
  }
}

export function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const existing = useAppStore((s) => s.accounts.find((a) => a.id === id) ?? null);
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);

  const [name, setName] = useState(existing?.name ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [balanceText, setBalanceText] = useState(
    existing ? toMajorString(existing.initialBalance, existing.currency) : '',
  );
  const [color, setColor] = useState(existing?.color ?? PALETTE[8] ?? '#00897B');
  const [icon, setIcon] = useState(existing?.icon ?? 'wallet');
  const [includeInTotal, setIncludeInTotal] = useState(existing?.includeInTotal ?? true);
  const [errors, setErrors] = useState<AccountFieldErrors & { balanceText?: 'invalidNumber' }>({});
  const [currencySheet, setCurrencySheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const currencies = COMMON_CURRENCIES.includes(currency)
    ? COMMON_CURRENCIES
    : [currency, ...COMMON_CURRENCIES];

  const onSave = async () => {
    const initialBalance = balanceText.trim() === '' ? 0 : parseAmount(balanceText, currency);
    if (initialBalance === null) {
      setErrors({ balanceText: 'invalidNumber' });
      return;
    }
    setSaving(true);
    try {
      const result = await write((db) =>
        saveAccount(
          db,
          { name, currency, initialBalance, color, icon, includeInTotal },
          existing?.id,
        ),
      );
      if (!result.ok) {
        setErrors(result.error);
        return;
      }
      router.back();
    } catch (e) {
      logger.error('Saving account failed', e);
      setErrors({ name: 'required' });
    } finally {
      setSaving(false);
    }
  };

  const onArchive = () => {
    if (!existing) return;
    const archive = async () => {
      const result = await write((db) => setAccountArchived(db, existing.id, !existing.isArchived));
      if (!result.ok) Alert.alert(actionErrorMessage(result.error));
      else router.back();
    };
    if (existing.isArchived) {
      void archive();
      return;
    }
    Alert.alert(t('accounts.archiveConfirm'), t('accounts.archiveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), onPress: () => void archive() },
    ]);
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert(t('accounts.deleteConfirm'), existing.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await write((db) => deleteAccount(db, existing.id));
          if (!result.ok) {
            Alert.alert(actionErrorMessage(result.error));
            return;
          }
          router.back();
          showToast({ message: t('accounts.deleted') });
        },
      },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={existing ? t('accounts.edit') : t('accounts.new')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <CategoryIcon icon={icon} color={color} size={64} />
        </View>
        <TextField
          label={t('accounts.name')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          maxLength={MAX_NAME_LENGTH}
          autoFocus={!existing}
          error={errors.name}
        />

        <View style={styles.field}>
          <FieldLabel>{t('accounts.currency')}</FieldLabel>
          <View style={styles.wrap}>
            <Chip
              label={currency}
              icon="currency-usd"
              trailingIcon="chevron-down"
              accessibilityLabel={`${t('accounts.currency')}: ${currency}`}
              onPress={() => setCurrencySheet(true)}
            />
          </View>
          <FieldError code={errors.currency} />
        </View>

        <TextField
          label={`${t('accounts.initialBalance')} (${currency})`}
          value={balanceText}
          onChangeText={(v) => {
            setBalanceText(v);
            setErrors((e) => ({ ...e, balanceText: undefined, initialBalance: undefined }));
          }}
          keyboardType="numbers-and-punctuation"
          placeholder="0"
          error={errors.balanceText ?? errors.initialBalance}
        />

        <SwitchRow
          label={t('accounts.includeInTotal')}
          hint={t('accounts.includeInTotalHint')}
          value={includeInTotal}
          onValueChange={setIncludeInTotal}
        />

        <FieldLabel>{t('accounts.color')}</FieldLabel>
        <ColorPicker value={color} onChange={setColor} />
        <FieldLabel>{t('accounts.icon')}</FieldLabel>
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
        visible={currencySheet}
        title={t('accounts.currency')}
        options={currencies.map((code) => ({ value: code, label: code }))}
        selected={currency}
        onSelect={(code) => {
          setCurrency(code);
          setErrors((e) => ({ ...e, currency: undefined }));
        }}
        onClose={() => setCurrencySheet(false)}
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
