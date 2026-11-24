import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseAmount, toMajorString } from '@/domain/money';
import { t } from '@/i18n';
import { useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { TextField } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ModalHeader } from '../../components/ModalHeader';
import { useTheme } from '../../theme/ThemeProvider';

export function FundBudgetScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const currency = useAppStore((s) => s.settings.defaultCurrency);
  const current = useAppStore((s) => s.settings.fundBudget);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [text, setText] = useState(current !== null ? toMajorString(current, currency) : '');
  const [error, setError] = useState<'invalidNumber' | undefined>();
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const amount = parseAmount(text, currency, { allowNegative: false });
    if (amount === null || amount <= 0) return setError('invalidNumber');
    setSaving(true);
    try {
      await updateSettings({ fundBudget: amount });
      router.back();
      showToast({ message: t('funds.entrySaved') });
    } catch (e) {
      logger.error('Saving the sinking fund budget failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={[styles.flex, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}
    >
      <ModalHeader
        title={current === null ? t('funds.budgetRequiredTitle') : t('funds.budgetEdit')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Icon name="piggy-bank-outline" size={48} color={colors.primary} />
        </View>
        <AppText color="textSecondary">{t('funds.budgetRequiredBody')}</AppText>
        <TextField
          label={`${t('funds.budgetMonthly')} (${currency})`}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setError(undefined);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          autoFocus
          error={error}
          onSubmitEditing={onSave}
        />
        <AppText variant="caption" color="textSecondary">
          {t('funds.budgetHint', { currency })}
        </AppText>
        <Button label={t('funds.budgetSave')} icon="check" loading={saving} onPress={onSave} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14 },
  hero: { alignItems: 'center', paddingVertical: 8 },
});
