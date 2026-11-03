import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { getDatabase } from '@/db/database';
import { COMMON_CURRENCIES } from '@/domain/currencies';
import {
  assertNever,
  type LanguagePreference,
  THEMES,
  type ThemePreference,
  WEEK_STARTS,
  type WeekStart,
} from '@/domain/types';
import { t, type TranslationKey } from '@/i18n';
import { exportBackupJson, exportCsv, resetAllData } from '@/services/dataService';
import { shareExport } from '@/services/fileService';
import { cancelAllNotifications } from '@/services/notificationService';
import { biometricsAvailable, clearPasscode } from '@/services/securityService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Card, ListRow, SectionTitle, SwitchRow } from '../../components/FormField';
import { type SelectOption, SelectSheet } from '../../components/SelectSheet';
import { useTheme } from '../../theme/ThemeProvider';

type Sheet = 'none' | 'currency' | 'language' | 'theme' | 'week' | 'month';

const LANGUAGES: readonly LanguagePreference[] = ['system', 'en'];

function themeLabel(theme: ThemePreference): string {
  switch (theme) {
    case 'system':
      return t('settings.themeSystem');
    case 'light':
      return t('settings.themeLight');
    case 'dark':
      return t('settings.themeDark');
    default:
      return assertNever(theme);
  }
}

function weekLabel(day: WeekStart): string {
  switch (day) {
    case 0:
      return t('settings.sunday');
    case 1:
      return t('settings.monday');
    case 6:
      return t('settings.saturday');
    default:
      return assertNever(day);
  }
}

function languageLabel(language: LanguagePreference): string {
  switch (language) {
    case 'system':
      return t('settings.languageSystem');
    case 'en':
      return t('settings.languageEn');
    default:
      return assertNever(language);
  }
}

export function SettingsScreen() {
  const { colors } = useTheme();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    biometricsAvailable()
      .then((available) => {
        if (active) setCanUseBiometrics(available);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const save = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch).catch((e: unknown) => logger.error('Saving settings failed', e));
  };

  const runExport = async (kind: 'csv' | 'json') => {
    if (busy) return;
    setBusy(true);
    try {
      const db = await getDatabase();
      const contents = kind === 'csv' ? await exportCsv(db) : await exportBackupJson(db);
      const result = await shareExport(
        kind === 'csv' ? 'pocket-ledger-transactions' : 'pocket-ledger-backup',
        kind,
        contents,
      );
      if (!result.ok) {
        showToast({
          message:
            result.error === 'unavailable'
              ? t('settings.shareUnavailable')
              : t('settings.exportFailed'),
        });
      }
    } catch (e) {
      logger.error('Export failed', e);
      showToast({ message: t('settings.exportFailed') });
    } finally {
      setBusy(false);
    }
  };

  const deleteEverything = async () => {
    try {
      await write((db) =>
        resetAllData(db, {
          currency: settings.defaultCurrency,
          accountName: t('seed.account'),
          categoryName: (key) => t(`seed.categories.${key}` as TranslationKey),
        }),
      );
      await clearPasscode();
      await cancelAllNotifications();
      useFilterStore.getState().resetFilters();
      showToast({ message: t('settings.deleteAllDone') });
    } catch (e) {
      logger.error('Delete all failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    }
  };

  const confirmDeleteAll = () => {
    Alert.alert(t('settings.deleteAllConfirm1'), t('settings.deleteAllConfirm1Body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.continue'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('settings.deleteAllConfirm2'), t('settings.deleteAllConfirm2Body'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('settings.deleteAllAction'),
              style: 'destructive',
              onPress: () => void deleteEverything(),
            },
          ]),
      },
    ]);
  };

  const currencies = COMMON_CURRENCIES.includes(settings.defaultCurrency)
    ? COMMON_CURRENCIES
    : [settings.defaultCurrency, ...COMMON_CURRENCIES];

  const sheetConfig = ((): {
    title: string;
    options: SelectOption<string>[];
    selected: string;
    onSelect: (value: string) => void;
  } | null => {
    switch (sheet) {
      case 'none':
        return null;
      case 'currency':
        return {
          title: t('settings.defaultCurrency'),
          options: currencies.map((c) => ({ value: c, label: c })),
          selected: settings.defaultCurrency,
          onSelect: (value) => save({ defaultCurrency: value }),
        };
      case 'language':
        return {
          title: t('settings.language'),
          options: LANGUAGES.map((l) => ({ value: l, label: languageLabel(l) })),
          selected: settings.language,
          onSelect: (value) => save({ language: value === 'en' ? 'en' : 'system' }),
        };
      case 'theme':
        return {
          title: t('settings.theme'),
          options: THEMES.map((th) => ({ value: th, label: themeLabel(th) })),
          selected: settings.theme,
          onSelect: (value) => {
            const theme = THEMES.find((th) => th === value);
            if (theme) save({ theme });
          },
        };
      case 'week':
        return {
          title: t('settings.firstDayOfWeek'),
          options: WEEK_STARTS.map((d) => ({ value: String(d), label: weekLabel(d) })),
          selected: String(settings.firstDayOfWeek),
          onSelect: (value) => {
            const day = WEEK_STARTS.find((d) => String(d) === value);
            if (day !== undefined) save({ firstDayOfWeek: day });
          },
        };
      case 'month':
        return {
          title: t('settings.firstDayOfMonth'),
          options: Array.from({ length: 28 }, (_, i) => ({
            value: String(i + 1),
            label: t('settings.dayN', { day: i + 1 }),
          })),
          selected: String(settings.firstDayOfMonth),
          onSelect: (value) => save({ firstDayOfMonth: Number(value) }),
        };
      default:
        return assertNever(sheet);
    }
  })();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <SectionTitle>{t('settings.general')}</SectionTitle>
      <Card style={styles.card}>
        <ListRow
          icon="cash"
          label={t('settings.defaultCurrency')}
          value={settings.defaultCurrency}
          onPress={() => setSheet('currency')}
        />
        <ListRow
          icon="translate"
          label={t('settings.language')}
          value={languageLabel(settings.language)}
          onPress={() => setSheet('language')}
        />
        <ListRow
          icon="theme-light-dark"
          label={t('settings.theme')}
          value={themeLabel(settings.theme)}
          onPress={() => setSheet('theme')}
        />
        <ListRow
          icon="calendar-week"
          label={t('settings.firstDayOfWeek')}
          value={weekLabel(settings.firstDayOfWeek)}
          onPress={() => setSheet('week')}
        />
        <ListRow
          icon="calendar-month"
          label={t('settings.firstDayOfMonth')}
          value={t('settings.dayN', { day: settings.firstDayOfMonth })}
          onPress={() => setSheet('month')}
        />
      </Card>
      <AppText variant="caption" color="textSecondary" style={styles.hint}>
        {`${t('settings.multiCurrency')}: ${t('settings.multiCurrencyHint')}`}
      </AppText>

      <SectionTitle>{t('settings.security')}</SectionTitle>
      <Card style={styles.switchCard}>
        <SwitchRow
          label={t('settings.passcode')}
          value={settings.passcodeEnabled}
          onValueChange={(enabled) =>
            router.push({ pathname: '/passcode', params: { mode: enabled ? 'create' : 'disable' } })
          }
        />
        <SwitchRow
          label={t('settings.biometrics')}
          hint={canUseBiometrics ? undefined : t('settings.biometricsUnavailable')}
          value={settings.biometricsEnabled}
          disabled={!canUseBiometrics || !settings.passcodeEnabled}
          onValueChange={(enabled) => save({ biometricsEnabled: enabled })}
        />
      </Card>
      {settings.passcodeEnabled ? (
        <Card style={styles.card}>
          <ListRow
            icon="lock-reset"
            label={t('settings.changePasscode')}
            onPress={() => router.push({ pathname: '/passcode', params: { mode: 'change' } })}
          />
        </Card>
      ) : null}

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <Card style={styles.card}>
        <ListRow
          icon="file-delimited-outline"
          label={t('settings.exportCsv')}
          onPress={() => void runExport('csv')}
        />
        <ListRow
          icon="code-json"
          label={t('settings.exportJson')}
          onPress={() => void runExport('json')}
        />
        <ListRow
          icon="file-import-outline"
          label={t('settings.importCsv')}
          onPress={() => router.push('/import-csv')}
        />
        <ListRow
          icon="backup-restore"
          label={t('settings.backups')}
          onPress={() => router.push('/backups')}
        />
        <ListRow
          icon="delete-forever-outline"
          label={t('settings.deleteAll')}
          destructive
          onPress={confirmDeleteAll}
        />
      </Card>

      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card style={styles.about}>
        <AppText variant="body">{t('app.name')}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {t('settings.privacy')}
        </AppText>
      </Card>

      {sheetConfig ? (
        <SelectSheet
          visible
          title={sheetConfig.title}
          options={sheetConfig.options}
          selected={sheetConfig.selected}
          onSelect={sheetConfig.onSelect}
          onClose={() => setSheet('none')}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  hint: { marginHorizontal: 16, marginTop: 8 },
  card: { marginHorizontal: 16, marginBottom: 8 },
  switchCard: { marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 16 },
  about: { marginHorizontal: 16, padding: 16, gap: 4 },
});
