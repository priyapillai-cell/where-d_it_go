import { format } from 'date-fns';

import type { SnapshotStore } from '../syncService';
import { type DriveClient, type DriveFile, FOLDER_MIME } from './driveClient';

export const SYNC_FILE_NAME = 'pocket-ledger-sync.json';
export const BACKUP_PREFIX = 'pocket-ledger-backup-';
export const BACKUPS_TO_KEEP = 30;
export const SHEET_FOLDER_NAME = 'Pocket Ledger';
export const SHEET_FILE_NAME = 'Pocket Ledger.xlsx';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JSON_MIME = 'application/json';

/**
 * The shared sync snapshot, kept in the app's hidden Drive folder. Drive has no conditional
 * upload, so the version check narrows but cannot close the race between two devices; a
 * lost write is harmless because the losing device still holds its newer records and
 * pushes them again on its next sync.
 */
export class DriveSnapshotStore implements SnapshotStore {
  private fileId: string | null = null;

  constructor(private readonly drive: DriveClient) {}

  private async current(): Promise<DriveFile | null> {
    const known = this.fileId ? await this.drive.get(this.fileId) : null;
    const file = known ?? (await this.drive.findByName(SYNC_FILE_NAME, 'appDataFolder'));
    this.fileId = file?.id ?? null;
    return file;
  }

  async read(): Promise<{ text: string; version: string } | null> {
    const file = await this.current();
    if (!file) return null;
    return { text: await this.drive.download(file.id), version: file.version };
  }

  async write(text: string, expectedVersion: string | null): Promise<'written' | 'conflict'> {
    const file = await this.current();
    if ((file?.version ?? null) !== expectedVersion) return 'conflict';
    const written = file
      ? await this.drive.upload(file.id, text, JSON_MIME)
      : await this.drive.create(
          { name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: JSON_MIME },
          { data: text, mimeType: JSON_MIME },
        );
    this.fileId = written.id;
    return 'written';
  }
}

export function backupFileName(day: Date): string {
  return `${BACKUP_PREFIX}${format(day, 'yyyy-MM-dd')}.json`;
}

export async function listDriveBackups(drive: DriveClient): Promise<DriveFile[]> {
  const files = await drive.list("'appDataFolder' in parents", 'appDataFolder');
  return files
    .filter((f) => f.name.startsWith(BACKUP_PREFIX))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Writes today's backup (replacing an earlier one from today) and keeps the newest 30. */
export async function uploadBackup(
  drive: DriveClient,
  json: string,
  now: Date,
  keep: number = BACKUPS_TO_KEEP,
): Promise<DriveFile> {
  const name = backupFileName(now);
  const existing = await drive.findByName(name, 'appDataFolder');
  const file = existing
    ? await drive.upload(existing.id, json, JSON_MIME)
    : await drive.create(
        { name, parents: ['appDataFolder'], mimeType: JSON_MIME },
        { data: json, mimeType: JSON_MIME },
      );
  const backups = await listDriveBackups(drive);
  for (const old of backups.slice(keep)) await drive.remove(old.id);
  return file;
}

export interface SheetLocation {
  folderId: string | null;
  fileId: string | null;
}

/** Creates or refreshes the spreadsheet in a visible "Pocket Ledger" folder in My Drive. */
export async function uploadSpreadsheet(
  drive: DriveClient,
  bytes: Uint8Array,
  known: SheetLocation,
): Promise<{ folderId: string; fileId: string }> {
  let folder = known.folderId ? await drive.get(known.folderId) : null;
  folder ??= await drive.findByName(SHEET_FOLDER_NAME, 'drive', { mimeType: FOLDER_MIME });
  folder ??= await drive.create({ name: SHEET_FOLDER_NAME, mimeType: FOLDER_MIME });

  let file = known.fileId ? await drive.get(known.fileId) : null;
  file ??= await drive.findByName(SHEET_FILE_NAME, 'drive', { parentId: folder.id });
  file = file
    ? await drive.upload(file.id, bytes, XLSX_MIME)
    : await drive.create(
        { name: SHEET_FILE_NAME, parents: [folder.id], mimeType: XLSX_MIME },
        { data: bytes, mimeType: XLSX_MIME },
      );
  return { folderId: folder.id, fileId: file.id };
}
