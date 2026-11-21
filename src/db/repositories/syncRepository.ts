import {
  SEED_CHANGED_AT,
  SYNC_TABLES,
  type SyncRecord,
  type SyncTable,
  type SyncTables,
  type SyncValue,
} from '@/domain/sync';
import { logger } from '@/utils/logger';

import type { SqlExecutor, SqlValue } from '../sqlDatabase';

const columnCache = new Map<SyncTable, readonly string[]>();

async function columnsOf(db: SqlExecutor, table: SyncTable): Promise<readonly string[]> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  const columns = rows.map((r) => r.name);
  columnCache.set(table, columns);
  return columns;
}

function isSyncValue(value: unknown): value is SyncValue {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

/** Every row of every synced table plus its tombstones, stamped from the change log. */
export async function readLocalRecords(db: SqlExecutor): Promise<SyncTables> {
  const tables = {} as SyncTables;
  for (const table of SYNC_TABLES) {
    const rows = await db.all<Record<string, unknown>>(
      `SELECT t.*, s.changed_at AS __changed_at FROM ${table} t
       LEFT JOIN sync_changes s ON s.table_name = ? AND s.row_id = t.id`,
      [table],
    );
    const records: SyncRecord[] = rows.map((row) => {
      const data: Record<string, SyncValue> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key !== '__changed_at' && isSyncValue(value)) data[key] = value;
      }
      const changedAt = typeof row.__changed_at === 'string' ? row.__changed_at : SEED_CHANGED_AT;
      return { id: String(row.id), changedAt, deleted: false, data };
    });
    const tombstones = await db.all<{ row_id: string; changed_at: string }>(
      `SELECT row_id, changed_at FROM sync_changes
       WHERE table_name = ? AND deleted = 1 AND row_id NOT IN (SELECT id FROM ${table})`,
      [table],
    );
    for (const t of tombstones) {
      records.push({ id: t.row_id, changedAt: t.changed_at, deleted: true, data: null });
    }
    tables[table] = records;
  }
  return tables;
}

async function stamp(
  db: SqlExecutor,
  table: SyncTable,
  id: string,
  changedAt: string,
  deleted: boolean,
): Promise<void> {
  await db.run(
    'INSERT OR REPLACE INTO sync_changes (table_name, row_id, changed_at, deleted) VALUES (?, ?, ?, ?)',
    [table, id, changedAt, deleted ? 1 : 0],
  );
}

/** Rows that would violate a secondary unique index if the incoming row were written. */
async function removeUniqueConflicts(
  db: SqlExecutor,
  table: SyncTable,
  data: Record<string, SyncValue>,
): Promise<void> {
  if (table === 'budgets') {
    await db.run(
      `DELETE FROM budgets WHERE id <> ? AND IFNULL(category_id, '') = IFNULL(?, '')
         AND currency = ? AND period = ?`,
      [data.id ?? null, data.category_id ?? null, data.currency ?? null, data.period ?? null],
    );
  } else if (table === 'transactions' && data.recurring_rule_id && data.occurrence_key) {
    await db.run(
      'DELETE FROM transactions WHERE id <> ? AND recurring_rule_id = ? AND occurrence_key = ?',
      [data.id ?? null, data.recurring_rule_id, data.occurrence_key],
    );
  }
}

async function upsertRow(
  db: SqlExecutor,
  table: SyncTable,
  data: Record<string, SyncValue>,
): Promise<void> {
  const known = new Set(await columnsOf(db, table));
  const columns = Object.keys(data).filter((c) => known.has(c));
  if (!columns.includes('id')) throw new Error('Row without id');
  const updates = columns.filter((c) => c !== 'id');
  const values: SqlValue[] = columns.map((c) => data[c] ?? null);
  await db.run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(id) DO ${
       updates.length > 0
         ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}`
         : 'NOTHING'
     }`,
    values,
  );
}

/** `nowIso`, or just after `changedAt` when the other device's clock is ahead. */
function laterThan(changedAt: string, nowIso: string): string {
  const next = new Date(Date.parse(changedAt) + 1).toISOString();
  return next > nowIso ? next : nowIso;
}

async function rowExists(db: SqlExecutor, table: SyncTable, id: string): Promise<boolean> {
  return (await db.first(`SELECT 1 AS x FROM ${table} WHERE id = ?`, [id])) !== null;
}

/**
 * Writes winning remote records inside the caller's transaction: upserts parents first and
 * deletes children first. A record that cannot be applied (for example a deletion of an
 * account another device still references) is re-stamped locally as newest, so this
 * device's version is pushed back and every copy converges. Returns how many applied.
 */
export async function applyRemoteRecords(
  db: SqlExecutor,
  records: Partial<Record<SyncTable, readonly SyncRecord[]>>,
  nowIso: string,
): Promise<number> {
  let applied = 0;
  const failed: { table: SyncTable; record: SyncRecord }[] = [];

  for (const table of SYNC_TABLES) {
    for (const record of records[table] ?? []) {
      if (record.deleted || !record.data) continue;
      try {
        await removeUniqueConflicts(db, table, record.data);
        await upsertRow(db, table, record.data);
        await stamp(db, table, record.id, record.changedAt, false);
        applied += 1;
      } catch (error) {
        logger.warn(`Sync could not apply ${table} ${record.id}`, error);
        failed.push({ table, record });
      }
    }
  }
  for (const table of [...SYNC_TABLES].reverse()) {
    for (const record of records[table] ?? []) {
      if (!record.deleted) continue;
      try {
        await db.run(`DELETE FROM ${table} WHERE id = ?`, [record.id]);
        await stamp(db, table, record.id, record.changedAt, true);
        applied += 1;
      } catch (error) {
        logger.warn(`Sync could not delete ${table} ${record.id}`, error);
        failed.push({ table, record });
      }
    }
  }
  for (const { table, record } of failed) {
    const exists = await rowExists(db, table, record.id);
    await stamp(db, table, record.id, laterThan(record.changedAt, nowIso), !exists);
  }
  return applied;
}

/** Removes every synced row without leaving tombstones (used before adopting Drive data). */
export async function clearSyncedData(db: SqlExecutor): Promise<void> {
  for (const table of [...SYNC_TABLES].reverse()) {
    await db.run(`DELETE FROM ${table}`);
  }
  await db.run('DELETE FROM budget_alerts');
  await db.run('DELETE FROM sync_changes');
}

export async function stampSeedRows(db: SqlExecutor, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await db.run('UPDATE sync_changes SET changed_at = ? WHERE row_id = ? AND deleted = 0', [
      SEED_CHANGED_AT,
      id,
    ]);
  }
}

export async function dropTombstones(db: SqlExecutor, before?: string): Promise<void> {
  if (before) {
    await db.run('DELETE FROM sync_changes WHERE deleted = 1 AND changed_at < ?', [before]);
  } else {
    await db.run('DELETE FROM sync_changes WHERE deleted = 1');
  }
}

export async function getSyncMeta(db: SqlExecutor, key: string): Promise<string | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSyncMeta(
  db: SqlExecutor,
  key: string,
  value: string | null,
): Promise<void> {
  if (value === null) await db.run('DELETE FROM sync_meta WHERE key = ?', [key]);
  else await db.run('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
}
