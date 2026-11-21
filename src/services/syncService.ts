import { SCHEMA_VERSION } from '@/db/migrations';
import {
  applyRemoteRecords,
  clearSyncedData,
  dropTombstones,
  readLocalRecords,
} from '@/db/repositories/syncRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import {
  emptyTables,
  mergeTable,
  parseSnapshot,
  pruneTombstones,
  serializeSnapshot,
  SYNC_FORMAT,
  SYNC_TABLES,
  SYNC_VERSION,
  type SyncRecord,
  type SyncSnapshot,
  type SyncTable,
  type SyncTables,
  TOMBSTONE_RETENTION_DAYS,
} from '@/domain/sync';

/** Where the shared snapshot lives (a Google Drive file in the app, a fake in tests). */
export interface SnapshotStore {
  read(): Promise<{ text: string; version: string } | null>;
  /**
   * Writes `text` only if the stored copy is still at `expectedVersion` (`null`: no copy yet).
   * Returns 'conflict' when another device wrote in between.
   */
  write(text: string, expectedVersion: string | null): Promise<'written' | 'conflict'>;
}

/**
 * - `merge`: combine both sides record by record (normal sync).
 * - `adoptRemote`: replace this device's data with the shared copy (joining an existing sync).
 * - `overwriteRemote`: replace the shared copy with this device's data (repairs a bad copy).
 */
export type SyncMode = 'merge' | 'adoptRemote' | 'overwriteRemote';

export type SyncOutcome =
  | { kind: 'synced'; pulled: number; pushed: boolean }
  | { kind: 'remoteNewerApp' }
  | { kind: 'remoteInvalid' }
  | { kind: 'conflict' };

export interface SyncOptions {
  deviceId: string;
  mode?: SyncMode;
  now?: () => Date;
  maxAttempts?: number;
}

function hasRemoteBehind(local: SyncTables, remote: SyncTables): boolean {
  return SYNC_TABLES.some((t) => mergeTable(local[t], remote[t]).remoteBehind);
}

function snapshotFrom(tables: SyncTables, deviceId: string, now: Date): SyncSnapshot {
  const pruned = emptyTables();
  for (const table of SYNC_TABLES) pruned[table] = pruneTombstones(tables[table], now);
  return {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    schemaVersion: SCHEMA_VERSION,
    deviceId,
    updatedAt: now.toISOString(),
    tables: pruned,
  };
}

/** Synchronises the local database with the shared snapshot. Never leaves partial writes. */
export async function syncDatabase(
  db: SqlDatabase,
  store: SnapshotStore,
  options: SyncOptions,
): Promise<SyncOutcome> {
  const now = options.now ?? (() => new Date());
  const mode = options.mode ?? 'merge';
  const attempts = options.maxAttempts ?? 3;

  const cutoff = new Date(now().getTime() - TOMBSTONE_RETENTION_DAYS * 86_400_000);
  await db.transaction((tx) => dropTombstones(tx, cutoff.toISOString()));

  let pulled = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const stored = await store.read();
    let remote: SyncTables = emptyTables();
    if (stored) {
      const parsed = parseSnapshot(stored.text, SCHEMA_VERSION);
      if (parsed.ok) {
        for (const table of SYNC_TABLES) {
          remote[table] = pruneTombstones(parsed.value.tables[table], now());
        }
      } else if (parsed.error.kind === 'newerSchema' || parsed.error.kind === 'newerFormat') {
        return { kind: 'remoteNewerApp' };
      } else if (mode !== 'overwriteRemote') {
        return { kind: 'remoteInvalid' };
      }
    }

    if (mode === 'adoptRemote' && attempt === 0 && stored) {
      const records: Partial<Record<SyncTable, SyncRecord[]>> = {};
      for (const table of SYNC_TABLES) records[table] = remote[table];
      pulled += await db.transaction(async (tx) => {
        await clearSyncedData(tx);
        return applyRemoteRecords(tx, records, now().toISOString());
      });
    } else if (mode !== 'overwriteRemote') {
      const local = await readLocalRecords(db);
      const toApply: Partial<Record<SyncTable, SyncRecord[]>> = {};
      let count = 0;
      for (const table of SYNC_TABLES) {
        toApply[table] = mergeTable(local[table], remote[table]).toApply;
        count += toApply[table]?.length ?? 0;
      }
      if (count > 0) {
        pulled += await db.transaction((tx) =>
          applyRemoteRecords(tx, toApply, now().toISOString()),
        );
      }
    }

    const local = await readLocalRecords(db);
    const mustPush = mode === 'overwriteRemote' || !stored || hasRemoteBehind(local, remote);
    if (!mustPush) return { kind: 'synced', pulled, pushed: false };

    const text = serializeSnapshot(snapshotFrom(local, options.deviceId, now()));
    const result = await store.write(text, stored?.version ?? null);
    if (result === 'written') return { kind: 'synced', pulled, pushed: true };
  }
  return { kind: 'conflict' };
}

/** True when this device holds data a user created (beyond the first-run defaults). */
export async function hasUserData(db: SqlDatabase): Promise<boolean> {
  const row = await db.first<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM transactions) + (SELECT COUNT(*) FROM fund_entries)
       + (SELECT COUNT(*) FROM sinking_funds) + (SELECT COUNT(*) FROM budgets)
       + (SELECT COUNT(*) FROM recurring_rules) AS n`,
  );
  return (row?.n ?? 0) > 0;
}
