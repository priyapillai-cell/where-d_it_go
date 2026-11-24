import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type BankMessageDraft, bankMessageDraft, parseBankMessage } from '@/domain/bankMessage';
import { t, type TranslationKey } from '@/i18n';
import { formatDate, money } from '@/i18n/format';
import { useAppStore } from '@/state/appStore';
import { stableId } from '@/utils/id';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card, SectionTitle } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { useTheme } from '../../theme/ThemeProvider';

const MAX_MESSAGE_LENGTH = 2000;
const SHORTCUT_STEPS: readonly TranslationKey[] = [
  'fromMessage.step1',
  'fromMessage.step2',
  'fromMessage.step3',
  'fromMessage.step4',
  'fromMessage.step5',
  'fromMessage.step6',
];

function openEditor(draft: BankMessageDraft): void {
  router.replace({
    pathname: '/transaction',
    params: {
      type: draft.type,
      amount: String(draft.amount),
      date: draft.date,
      note: draft.note,
      ...(draft.accountId ? { accountId: draft.accountId } : {}),
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
    },
  });
}

/** Reads a pasted (or Shortcuts-forwarded) bank message into a prefilled transaction. */
export function AddFromMessageScreen() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const defaultCurrency = useAppStore((s) => s.settings.defaultCurrency);
  const ready = useAppStore((s) => s.status === 'ready');
  const [text, setText] = useState(() => (params.text ?? '').slice(0, MAX_MESSAGE_LENGTH));

  const parsed = useMemo(() => parseBankMessage(text, defaultCurrency), [text, defaultCurrency]);
  const draft = useMemo(
    () =>
      parsed
        ? bankMessageDraft(parsed, {
            accounts,
            categories,
            seedCategoryId: (key) => stableId('seed', 'category', key),
            now: new Date(),
          })
        : null,
    [parsed, accounts, categories],
  );

  const forwarded = useRef(false);
  useEffect(() => {
    if (forwarded.current || !params.text || !ready) return;
    forwarded.current = true;
    if (draft) openEditor(draft);
  }, [params.text, draft, ready]);

  const account = accounts.find((a) => a.id === draft?.accountId);
  const category = categories.find((c) => c.id === draft?.categoryId);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader title={t('fromMessage.title')} onClose={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <AppText color="textSecondary">{t('fromMessage.hint')}</AppText>
        <TextInput
          value={text}
          onChangeText={(next) => setText(next.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder={t('fromMessage.placeholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('fromMessage.inputLabel')}
          multiline
          autoFocus={!params.text}
          textAlignVertical="top"
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        />

        {parsed && draft ? (
          <Card style={styles.preview}>
            <AppText variant="label" color="textSecondary">
              {t('fromMessage.found')}
            </AppText>
            <AppText
              variant="headline"
              tabular
              style={{ color: parsed.type === 'expense' ? colors.expense : colors.income }}
            >
              {`${parsed.type === 'expense' ? '−' : '+'}${money(parsed.amount, parsed.currency)}`}
            </AppText>
            <AppText>{t(`types.${parsed.type}`)}</AppText>
            {parsed.merchant ? <AppText>{parsed.merchant}</AppText> : null}
            <AppText color="textSecondary">
              {[
                formatDate(new Date(draft.date), 'long'),
                account?.name,
                category?.name ?? t('fromMessage.noCategory'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            {draft.currencyMismatch && account ? (
              <AppText variant="caption" color="warning">
                {t('fromMessage.currencyMismatch', {
                  currency: parsed.currency,
                  account: account.name,
                })}
              </AppText>
            ) : null}
          </Card>
        ) : text.trim() !== '' ? (
          <AppText color="danger" accessibilityRole="alert">
            {t('fromMessage.notFound')}
          </AppText>
        ) : null}

        <Button
          label={t('fromMessage.continue')}
          icon="arrow-right"
          size="large"
          disabled={!draft}
          onPress={() => draft && openEditor(draft)}
        />

        <SectionTitle>{t('fromMessage.shortcutTitle')}</SectionTitle>
        <Card style={styles.preview}>
          <AppText color="textSecondary">{t('fromMessage.shortcutIntro')}</AppText>
          {SHORTCUT_STEPS.map((key, index) => (
            <AppText key={key}>{`${index + 1}. ${t(key)}`}</AppText>
          ))}
          <AppText variant="caption" color="textSecondary">
            {t('fromMessage.shortcutNote')}
          </AppText>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  input: { minHeight: 120, borderWidth: 1, padding: 12, fontSize: 16 },
  preview: { padding: 16, gap: 6 },
});
