import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';

import type { BackupFile } from '@/domain/backup';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { restoreBackup } from '@/services/dataService';
import type { DriveFile } from '@/services/google/driveClient';
import { driveSync } from '@/services/google/driveSyncInstance';
import { runMaintenance } from '@/services/maintenanceService';
import { write } from '@/services/writes';
import { type DriveProblem, useSyncStore } from '@/state/syncStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { Card, ListRow, SectionTitle, SwitchRow } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ModalHeader } from '../../components/ModalHeader';
import { useTheme } from '../../theme/ThemeProvider';
import { showAlert } from '../../dialogs';

function problemText(problem: DriveProblem): string {
  switch (problem) {
    case 'network':
      return t('drive.problem.network');
    case 'signedOut':
      return t('drive.problem.signedOut');
    case 'remoteInvalid':
      return t('drive.problem.remoteInvalid');
    case 'remoteNewerApp':
      return t('drive.problem.remoteNewerApp');
    case 'conflict':
      return t('drive.problem.conflict');
    case 'unknown':
      return t('drive.problem.unknown');
    default:
      return assertNever(problem);
  }
}

function dateTime(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date, 'medium')} ${formatDate(date, 'time')}`;
}

export function DriveScreen() {
  const { colors } = useTheme();
  const state = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<DriveFile[] | null>(null);

  useEffect(() => {
    driveSync.refreshState().catch((e: unknown) => logger.warn('Drive state failed', e));
  }, []);

  const connected = state.status !== 'off';
  const syncing = state.status === 'syncing';

  const guard = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      logger.error('Google Drive action failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const onConnect = () =>
    guard(async () => {
      try {
        const result = await driveSync.connect();
        if (result === 'failed') showToast({ message: t('drive.connectFailed') });
      } catch (e) {
        logger.warn('Google sign-in failed', e);
        showToast({ message: t('drive.connectFailed') });
      }
    });

  const onDisconnect = () =>
    showAlert(t('drive.disconnectConfirm'), t('drive.disconnectConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('drive.disconnect'),
        style: 'destructive',
        onPress: () =>
          void guard(async () => {
            await driveSync.disconnect();
            setBackups(null);
          }),
      },
    ]);

  const onUseDrive = () =>
    showAlert(t('drive.choiceUseDriveConfirm'), t('drive.choiceUseDriveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('drive.choiceUseDrive'),
        style: 'destructive',
        onPress: () =>
          void guard(async () => void (await driveSync.resolveFirstSync('adoptRemote'))),
      },
    ]);

  const onRepair = () =>
    showAlert(t('drive.repair'), t('drive.repairConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.continue'),
        style: 'destructive',
        onPress: () => void guard(async () => void (await driveSync.sync('overwriteRemote'))),
      },
    ]);

  const loadBackups = () => guard(async () => setBackups(await driveSync.listBackups()));

  const onBackupNow = () =>
    guard(async () => {
      await driveSync.backupNow();
      showToast({ message: t('drive.backupDone') });
      setBackups(await driveSync.listBackups());
    });

  const applyRestore = (backup: BackupFile) =>
    guard(async () => {
      await write(async (db) => {
        await restoreBackup(db, backup);
        await runMaintenance(db, { source: 'foreground' });
      });
      showToast({ message: t('backups.restored') });
      void driveSync.sync();
    });

  const onRestore = (file: DriveFile) =>
    guard(async () => {
      const downloaded = await driveSync.downloadBackup(file.id);
      if (!downloaded.ok) {
        showAlert(t('backups.invalid'));
        return;
      }
      const backup = downloaded.value;
      showAlert(
        t('backups.restoreConfirm'),
        t('drive.restoreConfirmBody', { date: dateTime(backup.exportedAt) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.restore'),
            style: 'destructive',
            onPress: () => void applyRestore(backup),
          },
        ],
      );
    });

  const unavailable = ((): string | null => {
    switch (state.availability) {
      case 'available':
        return null;
      case 'expoGo':
        return t('drive.unavailable.expoGo');
      case 'unsupportedPlatform':
        return t('drive.unavailable.unsupportedPlatform');
      case 'notConfigured':
        return t('drive.unavailable.notConfigured');
      default:
        return assertNever(state.availability);
    }
  })();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader title={t('drive.title')} onClose={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Icon name="google-drive" size={40} color={colors.primary} />
          <AppText variant="body" color="textSecondary" style={styles.flex}>
            {t('drive.intro')}
          </AppText>
        </View>

        {unavailable && !connected ? (
          <Card style={styles.notice}>
            <AppText variant="body">{unavailable}</AppText>
          </Card>
        ) : null}

        {!connected ? (
          <Button
            label={busy ? t('drive.connecting') : t('drive.connect')}
            icon="google"
            loading={busy}
            disabled={unavailable !== null}
            onPress={() => void onConnect()}
          />
        ) : (
          <Card style={styles.status}>
            <View style={styles.statusRow}>
              <Icon name="account-circle-outline" size={28} color={colors.textSecondary} />
              <View style={styles.flex}>
                <AppText variant="body" numberOfLines={1}>
                  {state.email
                    ? t('drive.connectedAs', { email: state.email })
                    : t('drive.connected')}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {syncing
                    ? t('drive.syncing')
                    : state.lastSyncedAt
                      ? t('drive.lastSynced', { when: dateTime(state.lastSyncedAt) })
                      : t('drive.neverSynced')}
                </AppText>
              </View>
              {syncing ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
            {state.problem ? (
              <AppText variant="caption" color="danger">
                {problemText(state.problem)}
              </AppText>
            ) : null}
            {state.problem === 'remoteInvalid' ? (
              <Button
                label={t('drive.repair')}
                variant="outline"
                disabled={busy}
                onPress={onRepair}
              />
            ) : null}
            <View style={styles.actions}>
              <Button
                label={t('drive.syncNow')}
                icon="sync"
                disabled={busy || syncing || state.status === 'needsChoice'}
                onPress={() => void driveSync.sync()}
              />
              <Button
                label={t('drive.disconnect')}
                variant="outline"
                disabled={busy}
                onPress={onDisconnect}
              />
            </View>
          </Card>
        )}

        {state.status === 'needsChoice' ? (
          <Card style={styles.status}>
            <AppText variant="title">{t('drive.choiceTitle')}</AppText>
            <AppText variant="body" color="textSecondary">
              {t('drive.choiceBody')}
            </AppText>
            <View style={styles.actions}>
              <Button
                label={t('drive.choiceMerge')}
                disabled={busy}
                onPress={() =>
                  void guard(async () => void (await driveSync.resolveFirstSync('merge')))
                }
              />
              <Button
                label={t('drive.choiceUseDrive')}
                variant="outline"
                disabled={busy}
                onPress={onUseDrive}
              />
            </View>
          </Card>
        ) : null}

        <SectionTitle>{t('drive.sectionOptions')}</SectionTitle>
        <Card style={styles.switchCard}>
          <SwitchRow
            label={t('drive.autoBackup')}
            hint={t('drive.autoBackupHint')}
            value={state.autoBackup}
            onValueChange={(v) => void driveSync.setAutoBackup(v)}
          />
          <SwitchRow
            label={t('drive.sheet')}
            hint={t('drive.sheetHint')}
            value={state.sheetEnabled}
            onValueChange={(v) => void driveSync.setSheetEnabled(v)}
          />
        </Card>
        {connected && state.sheetEnabled && state.sheetFolderId ? (
          <Card>
            <ListRow
              icon="folder-google-drive"
              label={t('drive.openSheet')}
              onPress={() =>
                void Linking.openURL(
                  `https://drive.google.com/drive/folders/${encodeURIComponent(state.sheetFolderId ?? '')}`,
                )
              }
            />
          </Card>
        ) : null}

        {connected ? (
          <>
            <SectionTitle>{t('drive.sectionBackups')}</SectionTitle>
            <View style={styles.actions}>
              <Button
                label={t('drive.backupNow')}
                icon="cloud-upload-outline"
                disabled={busy}
                onPress={() => void onBackupNow()}
              />
              {backups === null ? (
                <Button
                  label={t('drive.loadBackups')}
                  variant="outline"
                  disabled={busy}
                  onPress={() => void loadBackups()}
                />
              ) : null}
            </View>
            {backups !== null && backups.length === 0 ? (
              <AppText variant="caption" color="textSecondary">
                {t('drive.backupsEmpty')}
              </AppText>
            ) : null}
            {backups && backups.length > 0 ? (
              <Card>
                {backups.map((file) => {
                  const label = file.modifiedTime ? dateTime(file.modifiedTime) : file.name;
                  return (
                    <View key={file.id} style={styles.row}>
                      <Icon name="cloud-outline" size={22} color={colors.textSecondary} />
                      <AppText variant="body" style={styles.flex} numberOfLines={1}>
                        {label}
                      </AppText>
                      <IconButton
                        icon="backup-restore"
                        label={`${t('common.restore')}: ${label}`}
                        disabled={busy}
                        onPress={() => void onRestore(file)}
                      />
                    </View>
                  );
                })}
              </Card>
            ) : null}
          </>
        ) : null}

        <AppText variant="caption" color="textSecondary">
          {t('drive.privacy')}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { padding: 16 },
  status: { padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchCard: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, minHeight: 56 },
});
