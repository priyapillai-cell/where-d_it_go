import { useState } from 'react';

import { type BackupFile, MAX_BACKUP_BYTES, parseBackup } from '@/domain/backup';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { restoreBackup } from '@/services/dataService';
import { pickTextFile } from '@/services/fileService';
import { runMaintenance } from '@/services/maintenanceService';
import { write } from '@/services/writes';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { showAlert } from '../../dialogs';

/** Picks a JSON backup, confirms, and replaces all data with it. */
export function useRestoreFromFile(): { busy: boolean; restoreFromFile: () => Promise<void> } {
  const [busy, setBusy] = useState(false);

  const applyRestore = async (backup: BackupFile) => {
    setBusy(true);
    try {
      await write(async (db) => {
        await restoreBackup(db, backup);
        await runMaintenance(db, { source: 'foreground' });
      });
      showToast({ message: t('backups.restored') });
    } catch (e) {
      logger.error('Restore failed', e);
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const restoreFromFile = async () => {
    if (busy) return;
    const picked = await pickTextFile(['application/json', 'text/plain', '*/*'], MAX_BACKUP_BYTES);
    if (!picked.ok) {
      if (picked.error !== 'canceled') showAlert(t('backups.invalid'));
      return;
    }
    const parsed = parseBackup(picked.value.text);
    if (!parsed.ok) {
      showAlert(t('backups.invalid'));
      return;
    }
    const backup = parsed.value;
    showAlert(
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

  return { busy, restoreFromFile };
}
