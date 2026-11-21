import { z } from 'zod';

import { err, ok, type Result } from './types';

/** Synced tables in dependency order: parents before the rows that reference them. */
export const SYNC_TABLES = [
  'accounts',
  'categories',
  'sinking_funds',
  'recurring_rules',
  'transactions',
  'budgets',
  'fund_entries',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export type SyncValue = string | number | null;

/** One row of a synced table, or a tombstone when `deleted` is true. */
export interface SyncRecord {
  id: string;
  /** ISO timestamp of the last local change; the most recent change wins a merge. */
  changedAt: string;
  deleted: boolean;
  /** Column values keyed by column name; `null` for tombstones. */
  data: Record<string, SyncValue> | null;
}

export type SyncTables = Record<SyncTable, SyncRecord[]>;

export const SYNC_FORMAT = 'pocket-ledger-sync';
export const SYNC_VERSION = 1;
export const MAX_SYNC_BYTES = 50 * 1024 * 1024;
/** Tombstones older than this are dropped; a device offline longer may resurrect deletions. */
export const TOMBSTONE_RETENTION_DAYS = 180;
/** Changed-at stamp for seed rows, so any real edit on another device wins over a fresh seed. */
export const SEED_CHANGED_AT = '1970-01-01T00:00:00.000Z';

export interface SyncSnapshot {
  format: typeof SYNC_FORMAT;
  version: number;
  /** Database schema version of the device that wrote the snapshot. */
  schemaVersion: number;
  deviceId: string;
  updatedAt: string;
  tables: SyncTables;
}

export function emptyTables(): SyncTables {
  return Object.fromEntries(SYNC_TABLES.map((t) => [t, []])) as unknown as SyncTables;
}

const isoTimestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const recordSchema = z
  .object({
    id: z.string().min(1).max(64),
    changedAt: isoTimestamp,
    deleted: z.boolean().optional(),
    data: z.record(z.string().max(64), z.union([z.string(), z.number(), z.null()])).optional(),
  })
  .transform((r): SyncRecord => ({
    id: r.id,
    changedAt: r.changedAt,
    deleted: r.deleted === true,
    data: r.deleted === true ? null : (r.data ?? null),
  }))
  .refine((r) => r.deleted || r.data !== null, 'Rows need data');

const snapshotSchema = z.object({
  format: z.literal(SYNC_FORMAT),
  version: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  deviceId: z.string().max(64),
  updatedAt: isoTimestamp,
  tables: z.record(z.string(), z.array(z.unknown())),
});

export type SnapshotError =
  | { kind: 'notJson' }
  | { kind: 'invalid'; issue: string }
  | { kind: 'newerFormat' }
  | { kind: 'newerSchema'; schemaVersion: number };

/**
 * Validates an untrusted snapshot. Malformed rows are skipped rather than failing the whole
 * snapshot, so one bad record cannot block sync. Never throws.
 */
export function parseSnapshot(
  text: string,
  localSchemaVersion: number,
): Result<SyncSnapshot, SnapshotError> {
  if (text.length > MAX_SYNC_BYTES) return err({ kind: 'invalid', issue: 'Too large' });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err({ kind: 'notJson' });
  }
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) {
    return err({ kind: 'invalid', issue: parsed.error.issues[0]?.message ?? 'Invalid' });
  }
  if (parsed.data.version > SYNC_VERSION) return err({ kind: 'newerFormat' });
  if (parsed.data.schemaVersion > localSchemaVersion) {
    return err({ kind: 'newerSchema', schemaVersion: parsed.data.schemaVersion });
  }
  const tables = emptyTables();
  for (const table of SYNC_TABLES) {
    const seen = new Set<string>();
    for (const raw of parsed.data.tables[table] ?? []) {
      const record = recordSchema.safeParse(raw);
      if (!record.success || seen.has(record.data.id)) continue;
      if (record.data.data && record.data.data.id !== record.data.id) continue;
      seen.add(record.data.id);
      tables[table].push(record.data);
    }
  }
  return ok({ ...parsed.data, format: SYNC_FORMAT, tables });
}

export function serializeSnapshot(snapshot: SyncSnapshot): string {
  const tables = Object.fromEntries(
    SYNC_TABLES.map((table) => [
      table,
      snapshot.tables[table].map((r) =>
        r.deleted
          ? { id: r.id, changedAt: r.changedAt, deleted: true }
          : { id: r.id, changedAt: r.changedAt, data: r.data },
      ),
    ]),
  );
  return JSON.stringify({ ...snapshot, tables });
}

function stableData(data: Record<string, SyncValue> | null): string {
  if (!data) return '';
  return JSON.stringify(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
}

export function sameContent(a: SyncRecord, b: SyncRecord): boolean {
  return a.deleted === b.deleted && stableData(a.data) === stableData(b.data);
}

/**
 * Last-writer-wins order. Ties on the timestamp break deterministically (a deletion wins,
 * then the larger serialized row) so every device converges on the same result.
 */
export function compareRecords(a: SyncRecord, b: SyncRecord): number {
  const ta = Date.parse(a.changedAt);
  const tb = Date.parse(b.changedAt);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
  const da = stableData(a.data);
  const db = stableData(b.data);
  return da === db ? 0 : da < db ? -1 : 1;
}

export interface TableMerge {
  /** Remote records that win and must be written to the local database. */
  toApply: SyncRecord[];
  /** True when the local side has records the remote copy lacks or holds older versions of. */
  remoteBehind: boolean;
}

export function mergeTable(
  local: readonly SyncRecord[],
  remote: readonly SyncRecord[],
): TableMerge {
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteIds = new Set<string>();
  const toApply: SyncRecord[] = [];
  let remoteBehind = false;

  for (const theirs of remote) {
    remoteIds.add(theirs.id);
    const mine = localById.get(theirs.id);
    if (!mine) {
      // Remote tombstones are kept locally too, so they are not lost on the next upload.
      toApply.push(theirs);
      continue;
    }
    const order = compareRecords(mine, theirs);
    if (order < 0) {
      toApply.push(theirs);
    } else if (order > 0) {
      remoteBehind = true;
    }
  }
  for (const mine of local) {
    if (!remoteIds.has(mine.id)) remoteBehind = true;
  }
  return { toApply, remoteBehind };
}

/** Drops tombstones older than the retention window. */
export function pruneTombstones(records: readonly SyncRecord[], now: Date): SyncRecord[] {
  const cutoff = now.getTime() - TOMBSTONE_RETENTION_DAYS * 86_400_000;
  return records.filter((r) => !r.deleted || Date.parse(r.changedAt) >= cutoff);
}
