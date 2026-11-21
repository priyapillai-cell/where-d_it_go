import { FakeDrive } from '@/test/fakeDrive';

import { DriveClient, DriveError, driveQueryLiteral } from '../driveClient';
import {
  backupFileName,
  DriveSnapshotStore,
  listDriveBackups,
  SHEET_FILE_NAME,
  SHEET_FOLDER_NAME,
  SYNC_FILE_NAME,
  uploadBackup,
  uploadSpreadsheet,
} from '../driveFiles';

let fake: FakeDrive;
let tokenCalls: boolean[];
let drive: DriveClient;

beforeEach(() => {
  fake = new FakeDrive();
  tokenCalls = [];
  drive = new DriveClient(fake.fetch, async (force) => {
    tokenCalls.push(force);
    return fake.validToken;
  });
});

describe('DriveClient', () => {
  it('refreshes the token once when Drive rejects it', async () => {
    let stale = true;
    const client = new DriveClient(fake.fetch, async (force) => {
      if (force) stale = false;
      return stale ? 'expired' : fake.validToken;
    });
    expect(await client.list("name = 'x'", 'drive')).toEqual([]);
    expect(fake.requests).toHaveLength(2);
  });

  it('raises DriveError with the HTTP status', async () => {
    fake.failNext = 503;
    await expect(drive.list("name = 'x'", 'drive')).rejects.toMatchObject({
      name: 'DriveError',
      status: 503,
    });
    expect(new DriveError(500, 'x')).toBeInstanceOf(Error);
  });

  it('treats a missing file as null and ignores deleting it twice', async () => {
    expect(await drive.get('nope')).toBeNull();
    await expect(drive.remove('nope')).resolves.toBeUndefined();
  });

  it('escapes quotes and backslashes in search literals', async () => {
    expect(driveQueryLiteral("Ann's \\ file")).toBe("'Ann\\'s \\\\ file'");
    await drive.create({ name: "Ann's file" }, { data: 'x', mimeType: 'text/plain' });
    expect((await drive.findByName("Ann's file", 'drive'))?.name).toBe("Ann's file");
  });
});

describe('DriveSnapshotStore', () => {
  it('creates the hidden sync file and reads it back with its version', async () => {
    const store = new DriveSnapshotStore(drive);
    expect(await store.read()).toBeNull();
    expect(await store.write('{"a":1}', null)).toBe('written');
    expect(fake.byName(SYNC_FILE_NAME)?.parents).toEqual(['appDataFolder']);
    const read = await store.read();
    expect(read?.text).toBe('{"a":1}');
    expect(await store.write('{"a":2}', read!.version)).toBe('written');
  });

  it('reports a conflict when another device wrote in between', async () => {
    const store = new DriveSnapshotStore(drive);
    await store.write('{}', null);
    const read = await store.read();
    fake.touch(SYNC_FILE_NAME, '{"other":true}');
    expect(await store.write('{"mine":true}', read!.version)).toBe('conflict');
    expect(await new DriveSnapshotStore(drive).write('{}', null)).toBe('conflict');
  });
});

describe('backups', () => {
  it('names backups by day, replaces same-day ones and keeps the newest', async () => {
    const day = (d: number) => new Date(2026, 5, d, 12);
    await uploadBackup(drive, '{"v":1}', day(1), 2);
    await uploadBackup(drive, '{"v":2}', day(1), 2);
    await uploadBackup(drive, '{"v":3}', day(2), 2);
    await uploadBackup(drive, '{"v":4}', day(3), 2);
    const names = (await listDriveBackups(drive)).map((f) => f.name);
    expect(names).toEqual([backupFileName(day(3)), backupFileName(day(2))]);
    expect(backupFileName(day(3))).toBe('pocket-ledger-backup-2026-06-03.json');
  });
});

describe('spreadsheet', () => {
  it('creates a visible folder and file, then updates the same file', async () => {
    const first = await uploadSpreadsheet(drive, new Uint8Array([1, 2]), {
      folderId: null,
      fileId: null,
    });
    expect(fake.byName(SHEET_FOLDER_NAME)?.parents).toEqual(['root']);
    expect(fake.byName(SHEET_FILE_NAME)?.parents).toEqual([first.folderId]);
    const second = await uploadSpreadsheet(drive, new Uint8Array([3]), first);
    expect(second).toEqual(first);
    expect(fake.byName(SHEET_FILE_NAME)?.version).toBe(3);
  });

  it('recreates the file when the user trashed it', async () => {
    const first = await uploadSpreadsheet(drive, new Uint8Array([1]), {
      folderId: null,
      fileId: null,
    });
    fake.files.get(first.fileId)!.trashed = true;
    const second = await uploadSpreadsheet(drive, new Uint8Array([2]), first);
    expect(second.fileId).not.toBe(first.fileId);
    expect(second.folderId).toBe(first.folderId);
  });
});
