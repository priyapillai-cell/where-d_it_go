import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/db/database';
import { type BackupFile, MAX_BACKUP_BYTES, parseBackup } from '@/domain/backup';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { exportBackupJson, restoreBackup } from '@/services/dataService';
import {
  deleteStoredFile,
  listBackupFiles,
  pickTextFile,
  readTextFile,
  saveBackupFile,
  shareFile,
  type StoredFile,
} from '@/services/fileService';
import { runMaintenance } from '@/services/maintenanceService';
import { write } from '@/services/writes';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { ModalHeader } from '../../components/ModalHeader';
import { EmptyState } from '../../components/States';
import { useTheme } from '../../theme/ThemeProvider';

export function BackupsScreen() {
  const { colors } = useTheme();
  const [files, setFiles] = useState<StoredFile[]>(() => listBackupFiles());
  const [busy, setBusy] = useState(false);

  const reload = () => setFiles(listBackupFiles());

  const onCreate = async () => {
    setBusy(true);
    try {
      await saveBackupFile(await exportBackupJson(await getDatabase()));
      reload();
      showToast({ message: t('backups.created') });
    } catch (e) {
      logger.error('Creating backup failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const applyRestore = async (backup: BackupFile) => {
    setBusy(true);
    try {
      await write(async (db) => {
        await restoreBackup(db, backup);
        await runMaintenance(db, { source: 'foreground' });
      });
      showToast({ message: t('backups.restored') });
      router.back();
    } catch (e) {
      logger.error('Restore failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = (text: string) => {
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      Alert.alert(t('backups.invalid'));
      return;
    }
    const backup = parsed.value;
    Alert.alert(
      t('backups.restoreConfirm'),
      t('backups.restoreConfirmBody', { date: formatDate(new Date(backup.exportedAt), 'long') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.restore'),
          style: 'destructive',
          onPress: () => void applyRestore(backup),
        },
      ],
    );
  };

  const onRestoreStored = async (file: StoredFile) => {
    const text = await readTextFile(file.uri, MAX_BACKUP_BYTES);
    if (!text.ok) {
      Alert.alert(t('backups.invalid'));
      return;
    }
    confirmRestore(text.value);
  };

  const onRestoreFromFile = async () => {
    const picked = await pickTextFile(['application/json', 'text/plain', '*/*'], MAX_BACKUP_BYTES);
    if (!picked.ok) {
      if (picked.error !== 'canceled') Alert.alert(t('backups.invalid'));
      return;
    }
    confirmRestore(picked.value.text);
  };

  const onDelete = (file: StoredFile) => {
    Alert.alert(t('backups.deleteConfirm'), file.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            deleteStoredFile(file.uri);
          } catch (e) {
            logger.warn('Deleting backup failed', e);
          }
          reload();
        },
      },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader title={t('backups.title')} onClose={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="caption" color="textSecondary">
          {t('backups.hint')}
        </AppText>
        <View style={styles.actions}>
          <Button
            label={t('backups.create')}
            icon="content-save-outline"
            loading={busy}
            onPress={onCreate}
          />
          <Button
            label={t('backups.restoreFromFile')}
            icon="folder-open-outline"
            variant="outline"
            disabled={busy}
            onPress={onRestoreFromFile}
          />
        </View>

        {files.length === 0 ? (
          <EmptyState icon="backup-restore" title={t('backups.empty')} />
        ) : (
          <Card>
            {files.map((file) => {
              const date = file.modifiedAt ? formatDate(file.modifiedAt, 'long') : file.name;
              const size = t('backups.size', { size: Math.max(1, Math.round(file.size / 1024)) });
              return (
                <View key={file.uri} style={styles.row}>
                  <Icon name="file-document-outline" size={24} color={colors.textSecondary} />
                  <View style={styles.flex} accessible accessibilityLabel={`${date}, ${size}`}>
                    <AppText variant="body" numberOfLines={1}>
                      {date}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {size}
                    </AppText>
                  </View>
                  <IconButton
                    icon="backup-restore"
                    label={`${t('common.restore')}: ${date}`}
                    disabled={busy}
                    onPress={() => void onRestoreStored(file)}
                  />
                  <IconButton
                    icon="share-variant-outline"
                    label={`${t('common.share')}: ${date}`}
                    onPress={() =>
                      void shareFile(file.uri).then((shared) => {
                        if (!shared) showToast({ message: t('settings.shareUnavailable') });
                      })
                    }
                  />
                  <IconButton
                    icon="delete-outline"
                    label={`${t('common.delete')}: ${date}`}
                    color={colors.danger}
                    onPress={() => onDelete(file)}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, minHeight: 64 },
});
