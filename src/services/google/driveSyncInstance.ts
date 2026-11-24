import { fetch as expoFetch } from 'expo/fetch';

import { getDatabase } from '@/db/database';
import { excelLabels } from '@/i18n/excelLabels';
import { newId } from '@/utils/id';

import { notifyDataChanged } from '../dataEvents';
import { exportBackupJson, exportExcel } from '../dataService';
import { runMaintenance } from '../maintenanceService';
import { DriveClient, type FetchLike } from './driveClient';
import { createDriveSync } from './driveSync';
import { currentGoogleAvailability, googleTokens, signInWithGoogle } from './googleSignIn';

const fetchFn: FetchLike = (url, { body, ...init }) =>
  expoFetch(url, { ...init, body: typeof body === 'string' ? body : body && new Uint8Array(body) });

export const driveSync = createDriveSync({
  getDatabase,
  createDrive: () => new DriveClient(fetchFn, (force) => googleTokens.accessToken(force)),
  availability: currentGoogleAvailability,
  signIn: signInWithGoogle,
  signOut: () => googleTokens.signOut(),
  hasAccount: async () => (await googleTokens.account()) !== null,
  afterPull: async (db) => {
    await runMaintenance(db, { source: 'foreground' });
    await notifyDataChanged();
  },
  backupJson: exportBackupJson,
  spreadsheet: (db, now) => exportExcel(db, excelLabels(), now),
  newDeviceId: newId,
  now: () => new Date(),
});
