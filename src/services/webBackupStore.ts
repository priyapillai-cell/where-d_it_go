import type { StoredFile } from './fileTypes';

/** The subset of the browser's `localStorage` the web backup list needs. */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = 'pocket-ledger.backup:';
export const WEB_BACKUP_SCHEME = 'browser-backup:';

interface StoredBackup {
  savedAt: string;
  contents: string;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function parseEntry(raw: string | null): StoredBackup | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredBackup>;
    return typeof value.contents === 'string' && typeof value.savedAt === 'string'
      ? { savedAt: value.savedAt, contents: value.contents }
      : null;
  } catch {
    return null;
  }
}

function nameFromUri(uri: string): string | null {
  return uri.startsWith(WEB_BACKUP_SCHEME) ? uri.slice(WEB_BACKUP_SCHEME.length) : null;
}

function toStoredFile(name: string, entry: StoredBackup): StoredFile {
  return {
    name,
    uri: `${WEB_BACKUP_SCHEME}${name}`,
    size: byteLength(entry.contents),
    modifiedAt: new Date(entry.savedAt),
  };
}

/** Keeps a backup in browser storage; throws if the browser refuses (for example, quota). */
export function saveWebBackup(
  storage: KeyValueStorage,
  name: string,
  contents: string,
  now: Date,
): StoredFile {
  const entry: StoredBackup = { savedAt: now.toISOString(), contents };
  storage.setItem(`${KEY_PREFIX}${name}`, JSON.stringify(entry));
  return toStoredFile(name, entry);
}

/** Backups kept in browser storage, newest first; unreadable entries are skipped. */
export function listWebBackups(storage: KeyValueStorage): StoredFile[] {
  const files: StoredFile[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const entry = parseEntry(storage.getItem(key));
    if (entry) files.push(toStoredFile(key.slice(KEY_PREFIX.length), entry));
  }
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

export function readWebBackup(storage: KeyValueStorage, uri: string): string | null {
  const name = nameFromUri(uri);
  return name === null
    ? null
    : (parseEntry(storage.getItem(`${KEY_PREFIX}${name}`))?.contents ?? null);
}

export function deleteWebBackup(storage: KeyValueStorage, uri: string): void {
  const name = nameFromUri(uri);
  if (name !== null) storage.removeItem(`${KEY_PREFIX}${name}`);
}
