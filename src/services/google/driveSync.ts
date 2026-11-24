import { format } from 'date-fns';

import { getSyncMeta, setSyncMeta } from '@/db/repositories/syncRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { type BackupFile, parseBackup } from '@/domain/backup';
import { err, ok, type Result } from '@/domain/types';
import { type DriveProblem, type DriveState, useSyncStore } from '@/state/syncStore';
import { logger } from '@/utils/logger';

import { hasUserData, type SyncMode, type SyncOutcome, syncDatabase } from '../syncService';
import { type DriveClient, DriveError, type DriveFile } from './driveClient';
import {
  DriveSnapshotStore,
  listDriveBackups,
  uploadBackup,
  uploadSpreadsheet,
} from './driveFiles';
import { GoogleAuthExpiredError } from './googleAuth';
import type { GoogleAvailability } from './googleConfig';

export const META = {
  enabled: 'drive.enabled',
  email: 'drive.email',
  deviceId: 'drive.deviceId',
  lastSyncedAt: 'drive.lastSyncedAt',
  autoBackup: 'drive.autoBackup',
  sheet: 'drive.sheet',
  lastBackupDay: 'drive.lastBackupDay',
  folderId: 'drive.folderId',
  sheetFileId: 'drive.sheetFileId',
} as const;

const ACCOUNT_KEYS = [
  META.enabled,
  META.email,
  META.lastSyncedAt,
  META.lastBackupDay,
  META.folderId,
  META.sheetFileId,
];

export interface DriveSyncDeps {
  getDatabase(): Promise<SqlDatabase>;
  createDrive(): DriveClient;
  availability(): GoogleAvailability;
  signIn(): Promise<{ kind: 'signedIn'; email: string | null } | { kind: 'cancelled' }>;
  signOut(): Promise<void>;
  hasAccount(): Promise<boolean>;
  /** Runs after remote changes were written locally (recurring catch-up, UI refresh). */
  afterPull(db: SqlDatabase): Promise<void>;
  backupJson(db: SqlDatabase, now: Date): Promise<string>;
  spreadsheet(db: SqlDatabase, now: Date): Promise<Uint8Array>;
  newDeviceId(): string;
  now(): Date;
}

export type ConnectResult = 'synced' | 'needsChoice' | 'cancelled' | 'failed';

function problemFor(error: unknown): DriveProblem {
  if (error instanceof GoogleAuthExpiredError) return 'signedOut';
  if (error instanceof DriveError) {
    return error.status === 0 || error.status === 429 || error.status >= 500
      ? 'network'
      : 'unknown';
  }
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}

function problemForOutcome(outcome: SyncOutcome): DriveProblem | null {
  switch (outcome.kind) {
    case 'synced':
      return null;
    case 'remoteInvalid':
      return 'remoteInvalid';
    case 'remoteNewerApp':
      return 'remoteNewerApp';
    case 'conflict':
      return 'conflict';
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
}

/** Coordinates Google sign-in, sync, backups and the spreadsheet. One sync runs at a time. */
export function createDriveSync(deps: DriveSyncDeps) {
  const set = (patch: Partial<DriveState>) => useSyncStore.setState(patch);
  let running: Promise<SyncOutcome | null> | null = null;
  let pending: SyncMode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let applyingRemote = false;

  async function meta(key: string): Promise<string | null> {
    return getSyncMeta(await deps.getDatabase(), key);
  }

  async function setMeta(key: string, value: string | null): Promise<void> {
    await setSyncMeta(await deps.getDatabase(), key, value);
  }

  async function refreshState(): Promise<void> {
    const availability = deps.availability().kind;
    const db = await deps.getDatabase();
    const enabled = (await getSyncMeta(db, META.enabled)) === '1';
    if (enabled && !(await deps.hasAccount())) {
      await setSyncMeta(db, META.enabled, null);
    }
    const connected = enabled && (await deps.hasAccount());
    const current = useSyncStore.getState();
    set({
      availability,
      status: connected ? (current.status === 'off' ? 'idle' : current.status) : 'off',
      problem: connected ? current.problem : null,
      email: connected ? await getSyncMeta(db, META.email) : null,
      lastSyncedAt: connected ? await getSyncMeta(db, META.lastSyncedAt) : null,
      autoBackup: (await getSyncMeta(db, META.autoBackup)) !== '0',
      sheetEnabled: (await getSyncMeta(db, META.sheet)) !== '0',
      sheetFolderId: connected ? await getSyncMeta(db, META.folderId) : null,
    });
  }

  async function deviceId(): Promise<string> {
    const existing = await meta(META.deviceId);
    if (existing) return existing;
    const created = deps.newDeviceId();
    await setMeta(META.deviceId, created);
    return created;
  }

  async function extras(db: SqlDatabase, drive: DriveClient, changed: boolean): Promise<void> {
    const now = deps.now();
    const state = useSyncStore.getState();
    const today = format(now, 'yyyy-MM-dd');
    if (state.autoBackup && (await getSyncMeta(db, META.lastBackupDay)) !== today) {
      try {
        await uploadBackup(drive, await deps.backupJson(db, now), now);
        await setSyncMeta(db, META.lastBackupDay, today);
      } catch (error) {
        logger.warn('Drive backup failed', error);
      }
    }
    const fileId = await getSyncMeta(db, META.sheetFileId);
    if (state.sheetEnabled && (changed || !fileId)) {
      try {
        const location = await uploadSpreadsheet(drive, await deps.spreadsheet(db, now), {
          folderId: await getSyncMeta(db, META.folderId),
          fileId,
        });
        await setSyncMeta(db, META.folderId, location.folderId);
        await setSyncMeta(db, META.sheetFileId, location.fileId);
        set({ sheetFolderId: location.folderId });
      } catch (error) {
        logger.warn('Drive spreadsheet update failed', error);
      }
    }
  }

  async function runOnce(mode: SyncMode): Promise<SyncOutcome | null> {
    const db = await deps.getDatabase();
    if ((await getSyncMeta(db, META.enabled)) !== '1') return null;
    set({ status: 'syncing' });
    try {
      const drive = deps.createDrive();
      const outcome = await syncDatabase(db, new DriveSnapshotStore(drive), {
        deviceId: await deviceId(),
        mode,
        now: deps.now,
      });
      const problem = problemForOutcome(outcome);
      if (outcome.kind === 'synced') {
        if (outcome.pulled > 0) {
          applyingRemote = true;
          try {
            await deps.afterPull(db);
          } finally {
            applyingRemote = false;
          }
        }
        const syncedAt = deps.now().toISOString();
        await setSyncMeta(db, META.lastSyncedAt, syncedAt);
        set({ lastSyncedAt: syncedAt });
        await extras(db, drive, outcome.pulled > 0 || outcome.pushed);
      }
      set({ status: problem ? 'error' : 'idle', problem });
      return outcome;
    } catch (error) {
      logger.warn('Drive sync failed', error);
      const problem = problemFor(error);
      if (problem === 'signedOut') await setSyncMeta(db, META.enabled, null);
      set({ status: problem === 'signedOut' ? 'off' : 'error', problem });
      return null;
    }
  }

  /** Runs a sync now; concurrent calls share the running one and queue one more round. */
  function sync(mode: SyncMode = 'merge'): Promise<SyncOutcome | null> {
    if (useSyncStore.getState().status === 'needsChoice' && mode === 'merge') {
      return Promise.resolve(null);
    }
    if (running) {
      pending = mode === 'merge' ? (pending ?? mode) : mode;
      return running;
    }
    running = runOnce(mode).finally(() => {
      running = null;
      const next = pending;
      pending = null;
      if (next) void sync(next);
    });
    return running;
  }

  /** Debounced sync after local edits; ignores the writes sync itself makes. */
  function schedule(delayMs = 15_000): void {
    if (applyingRemote) return;
    if (useSyncStore.getState().status === 'off') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void sync();
    }, delayMs);
  }

  async function connect(): Promise<ConnectResult> {
    const signedIn = await deps.signIn();
    if (signedIn.kind === 'cancelled') return 'cancelled';
    const db = await deps.getDatabase();
    for (const key of ACCOUNT_KEYS) await setSyncMeta(db, key, null);
    await setSyncMeta(db, META.email, signedIn.email);
    await setSyncMeta(db, META.enabled, '1');
    await deviceId();
    await refreshState();
    try {
      const remote = await new DriveSnapshotStore(deps.createDrive()).read();
      if (remote && (await hasUserData(db))) {
        set({ status: 'needsChoice', problem: null });
        return 'needsChoice';
      }
      const outcome = await sync(remote ? 'adoptRemote' : 'merge');
      return outcome?.kind === 'synced' ? 'synced' : 'failed';
    } catch (error) {
      logger.warn('Connecting Google Drive failed', error);
      set({ status: 'error', problem: problemFor(error) });
      return 'failed';
    }
  }

  /** Answers the first-connect question when both this device and Drive hold data. */
  async function resolveFirstSync(mode: 'merge' | 'adoptRemote'): Promise<SyncOutcome | null> {
    set({ status: 'idle' });
    return sync(mode);
  }

  async function disconnect(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    await deps.signOut();
    const db = await deps.getDatabase();
    for (const key of ACCOUNT_KEYS) await setSyncMeta(db, key, null);
    set({ status: 'off', problem: null, email: null, lastSyncedAt: null, sheetFolderId: null });
  }

  async function setAutoBackup(enabled: boolean): Promise<void> {
    await setMeta(META.autoBackup, enabled ? null : '0');
    set({ autoBackup: enabled });
  }

  async function setSheetEnabled(enabled: boolean): Promise<void> {
    await setMeta(META.sheet, enabled ? null : '0');
    set({ sheetEnabled: enabled });
    if (enabled) void sync();
  }

  async function backupNow(): Promise<DriveFile> {
    const db = await deps.getDatabase();
    const now = deps.now();
    const file = await uploadBackup(deps.createDrive(), await deps.backupJson(db, now), now);
    await setSyncMeta(db, META.lastBackupDay, format(now, 'yyyy-MM-dd'));
    return file;
  }

  async function listBackups(): Promise<DriveFile[]> {
    return listDriveBackups(deps.createDrive());
  }

  async function downloadBackup(fileId: string): Promise<Result<BackupFile, 'invalid'>> {
    const parsed = parseBackup(await deps.createDrive().download(fileId));
    return parsed.ok ? ok(parsed.value) : err('invalid');
  }

  return {
    refreshState,
    sync,
    schedule,
    connect,
    resolveFirstSync,
    disconnect,
    setAutoBackup,
    setSheetEnabled,
    backupNow,
    listBackups,
    downloadBackup,
  };
}

export type DriveSync = ReturnType<typeof createDriveSync>;
