import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { getDatabase } from '@/db/database';
import {
  assertNever,
  type LanguagePreference,
  THEMES,
  type ThemePreference,
  WEEK_STARTS,
  type WeekStart,
} from '@/domain/types';
import { t, type TranslationKey } from '@/i18n';
import { excelLabels } from '@/i18n/excelLabels';
import { accountsSwitchableTo, switchAccountsCurrency } from '@/services/accountService';
import { exportBackupJson, exportCsv, exportExcel, resetAllData } from '@/services/dataService';
import { type ExportKind, shareExport } from '@/services/fileService';
import { driveSync } from '@/services/google/driveSyncInstance';
import { cancelAllNotifications } from '@/services/notificationService';
import { biometricsAvailable, clearPasscode } from '@/services/securityService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';
import { useSyncStore } from '@/state/syncStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Card, ListRow, SectionTitle, SwitchRow } from '../../components/FormField';
import { type SelectOption, SelectSheet } from '../../components/SelectSheet';
import { useTheme } from '../../theme/ThemeProvider';
import { showAlert } from '../../dialogs';
import { currencyLabel, currencyOptions } from '../../currencyOptions';
import { SinkingFundSettings } from './SinkingFundSettings';
import { useRestoreFromFile } from './useRestoreFromFile';

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
  const restore = useRestoreFromFile();
  const driveOn = useSyncStore((s) => s.status !== 'off');

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

  const changeDefaultCurrency = async (currency: string) => {
    if (currency === settings.defaultCurrency) return;
    save({ defaultCurrency: currency });
    try {
      const switchable = await accountsSwitchableTo(await getDatabase(), currency);
      if (switchable.length === 0) return;
      showAlert(
        t('settings.switchAccountsTitle', { currency: currencyLabel(currency) }),
        t('settings.switchAccountsBody', { accounts: switchable.map((a) => a.name).join(', ') }),
        [
          { text: t('settings.switchAccountsKeep'), style: 'cancel' },
          {
            text: t('settings.switchAccountsAction'),
            onPress: () =>
              void write((db) =>
                switchAccountsCurrency(
                  db,
                  switchable.map((a) => a.id),
                  currency,
                ),
              ).catch((e: unknown) => logger.error('Switching account currency failed', e)),
          },
        ],
      );
    } catch (e) {
      logger.warn('Checking accounts for the new currency failed', e);
    }
  };

  const buildExport = async (kind: ExportKind): Promise<[string, string | Uint8Array]> => {
    const db = await getDatabase();
    switch (kind) {
      case 'csv':
        return ['whered-it-go-transactions', await exportCsv(db)];
      case 'xlsx':
        return ['whered-it-go-transactions', await exportExcel(db, excelLabels())];
      case 'json':
        return ['whered-it-go-backup', await exportBackupJson(db)];
      default:
        return assertNever(kind);
    }
  };

  const runExport = async (kind: ExportKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const [baseName, contents] = await buildExport(kind);
      const result = await shareExport(baseName, kind, contents);
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
      await driveSync.disconnect();
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
    showAlert(t('settings.deleteAllConfirm1'), t('settings.deleteAllConfirm1Body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.continue'),
        style: 'destructive',
        onPress: () =>
          showAlert(t('settings.deleteAllConfirm2'), t('settings.deleteAllConfirm2Body'), [
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
          options: currencyOptions(settings.defaultCurrency),
          selected: settings.defaultCurrency,
          onSelect: (value) => void changeDefaultCurrency(value),
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
          value={currencyLabel(settings.defaultCurrency)}
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

      <SinkingFundSettings />

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
          icon="microsoft-excel"
          label={t('settings.exportExcel')}
          onPress={() => void runExport('xlsx')}
        />
        <ListRow
          icon="code-json"
          label={t('settings.exportJson')}
          onPress={() => void runExport('json')}
        />
        <ListRow
          icon="backup-restore"
          label={t('settings.restoreBackup')}
          onPress={() => void restore.restoreFromFile()}
        />
        <ListRow
          icon="file-import-outline"
          label={t('settings.importCsv')}
          onPress={() => router.push('/import-csv')}
        />
        <ListRow
          icon="google-drive"
          label={t('settings.googleDrive')}
          value={driveOn ? t('settings.googleDriveOn') : t('settings.googleDriveOff')}
          onPress={() => router.push('/drive')}
        />
        <ListRow
          icon="delete-forever-outline"
          label={t('settings.deleteAll')}
          destructive
          onPress={confirmDeleteAll}
        />
      </Card>
      <AppText variant="caption" color="textSecondary" style={styles.hint}>
        {t('settings.importBudgetNote')}
      </AppText>

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
