import { create } from 'zustand';

import type { GoogleAvailability } from '@/services/google/googleConfig';

export type DriveStatus = 'off' | 'idle' | 'syncing' | 'needsChoice' | 'error';

export type DriveProblem =
  'network' | 'signedOut' | 'remoteInvalid' | 'remoteNewerApp' | 'conflict' | 'unknown';

export interface DriveState {
  availability: GoogleAvailability['kind'];
  status: DriveStatus;
  problem: DriveProblem | null;
  email: string | null;
  lastSyncedAt: string | null;
  autoBackup: boolean;
  sheetEnabled: boolean;
  sheetFolderId: string | null;
}

export const INITIAL_DRIVE_STATE: DriveState = {
  availability: 'notConfigured',
  status: 'off',
  problem: null,
  email: null,
  lastSyncedAt: null,
  autoBackup: true,
  sheetEnabled: true,
  sheetFolderId: null,
};

export const useSyncStore = create<DriveState>(() => INITIAL_DRIVE_STATE);
