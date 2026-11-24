import { backupFileName } from '../fileTypes';
import {
  deleteWebBackup,
  type KeyValueStorage,
  listWebBackups,
  readWebBackup,
  saveWebBackup,
} from '../webBackupStore';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const NOV_20 = new Date('2026-11-20T08:00:00.000Z');
const NOV_24 = new Date('2026-11-24T07:30:00.000Z');

describe('web backup store', () => {
  it('saves backups and lists them newest first with size and date', () => {
    const storage = memoryStorage();
    saveWebBackup(storage, backupFileName(NOV_20), '{"a":1}', NOV_20);
    const saved = saveWebBackup(storage, backupFileName(NOV_24), '{"b":"₹"}', NOV_24);
    expect(saved).toEqual({
      name: 'pocket-ledger-2026-11-24-07-30-00.json',
      uri: 'browser-backup:pocket-ledger-2026-11-24-07-30-00.json',
      size: 11,
      modifiedAt: NOV_24,
    });
    expect(listWebBackups(storage).map((f) => f.name)).toEqual([
      'pocket-ledger-2026-11-24-07-30-00.json',
      'pocket-ledger-2026-11-20-08-00-00.json',
    ]);
  });

  it('reads and deletes a backup by its uri', () => {
    const storage = memoryStorage();
    const file = saveWebBackup(storage, backupFileName(NOV_20), '{"a":1}', NOV_20);
    expect(readWebBackup(storage, file.uri)).toBe('{"a":1}');
    deleteWebBackup(storage, file.uri);
    expect(readWebBackup(storage, file.uri)).toBeNull();
    expect(listWebBackups(storage)).toEqual([]);
  });

  it('ignores other keys, damaged entries and foreign uris', () => {
    const storage = memoryStorage({
      theme: 'dark',
      'pocket-ledger.backup:broken.json': 'not json',
      'pocket-ledger.backup:empty.json': '{"savedAt":"2026-11-20T00:00:00.000Z"}',
    });
    expect(listWebBackups(storage)).toEqual([]);
    expect(readWebBackup(storage, 'blob:http://localhost/1234')).toBeNull();
    deleteWebBackup(storage, 'theme');
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('lets a full browser storage error reach the caller', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveWebBackup(storage, 'x.json', '{}', NOV_20)).toThrow('QuotaExceededError');
  });
});
