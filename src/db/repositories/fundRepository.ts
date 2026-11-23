import type { FundEntry, SinkingFund } from '@/domain/types';

import { bool, type FundEntryRow, type SinkingFundRow, toFundEntry, toSinkingFund } from '../rows';
import type { SqlExecutor } from '../sqlDatabase';

export async function listFunds(db: SqlExecutor, includeArchived = true): Promise<SinkingFund[]> {
  const rows = await db.all<SinkingFundRow>(
    `SELECT * FROM sinking_funds ${includeArchived ? '' : 'WHERE is_archived = 0'} ORDER BY sort_order, created_at`,
  );
  return rows.map(toSinkingFund);
}

export async function getFund(db: SqlExecutor, id: string): Promise<SinkingFund | null> {
  const row = await db.first<SinkingFundRow>('SELECT * FROM sinking_funds WHERE id = ?', [id]);
  return row ? toSinkingFund(row) : null;
}

export async function upsertFund(db: SqlExecutor, f: SinkingFund): Promise<void> {
  await db.run(
    `INSERT INTO sinking_funds (id, name, icon, color, currency, target_amount, target_date,
       monthly_contribution, is_archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon,
       color = excluded.color, currency = excluded.currency,
       target_amount = excluded.target_amount, target_date = excluded.target_date,
       monthly_contribution = excluded.monthly_contribution, is_archived = excluded.is_archived,
       sort_order = excluded.sort_order`,
    [
      f.id,
      f.name,
      f.icon,
      f.color,
      f.currency,
      f.targetAmount,
      f.targetDate,
      f.monthlyContribution,
      bool(f.isArchived),
      f.sortOrder,
      f.createdAt,
    ],
  );
}

export async function deleteFund(db: SqlExecutor, id: string): Promise<void> {
  await db.run('DELETE FROM fund_entries WHERE fund_id = ?', [id]);
  await db.run('DELETE FROM sinking_funds WHERE id = ?', [id]);
}

export async function nextFundSortOrder(db: SqlExecutor): Promise<number> {
  const row = await db.first<{ next: number }>(
    'SELECT IFNULL(MAX(sort_order), -1) + 1 AS next FROM sinking_funds',
  );
  return row?.next ?? 0;
}

export async function reorderFunds(db: SqlExecutor, orderedIds: readonly string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db.run('UPDATE sinking_funds SET sort_order = ? WHERE id = ?', [index, id]);
  }
}

export async function listAllFundEntries(db: SqlExecutor): Promise<FundEntry[]> {
  const rows = await db.all<FundEntryRow>(
    'SELECT * FROM fund_entries ORDER BY date DESC, created_at DESC',
  );
  return rows.map(toFundEntry);
}

/** Deposits that were taken out of one of `accountIds`, with `fromIso <= date < toIso`. */
export async function listAccountDeposits(
  db: SqlExecutor,
  { from, to, accountIds }: { from: string; to: string; accountIds: readonly string[] },
): Promise<FundEntry[]> {
  if (accountIds.length === 0) return [];
  const rows = await db.all<FundEntryRow>(
    `SELECT * FROM fund_entries
     WHERE type = 'deposit' AND date >= ? AND date < ?
       AND account_id IN (${accountIds.map(() => '?').join(', ')})
     ORDER BY date`,
    [from, to, ...accountIds],
  );
  return rows.map(toFundEntry);
}

export async function listFundEntries(db: SqlExecutor, fundId: string): Promise<FundEntry[]> {
  const rows = await db.all<FundEntryRow>(
    'SELECT * FROM fund_entries WHERE fund_id = ? ORDER BY date DESC, created_at DESC',
    [fundId],
  );
  return rows.map(toFundEntry);
}

export async function getFundEntry(db: SqlExecutor, id: string): Promise<FundEntry | null> {
  const row = await db.first<FundEntryRow>('SELECT * FROM fund_entries WHERE id = ?', [id]);
  return row ? toFundEntry(row) : null;
}

export async function countFundEntries(db: SqlExecutor, fundId: string): Promise<number> {
  const row = await db.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fund_entries WHERE fund_id = ?',
    [fundId],
  );
  return row?.n ?? 0;
}

export async function upsertFundEntry(db: SqlExecutor, e: FundEntry): Promise<void> {
  await db.run(
    `INSERT INTO fund_entries (id, fund_id, type, amount, note, date, account_id, created_at,
       updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET fund_id = excluded.fund_id, type = excluded.type,
       amount = excluded.amount, note = excluded.note, date = excluded.date,
       account_id = excluded.account_id, updated_at = excluded.updated_at`,
    entryParams(e),
  );
}

export async function deleteFundEntry(db: SqlExecutor, id: string): Promise<void> {
  await db.run('DELETE FROM fund_entries WHERE id = ?', [id]);
}

function entryParams(e: FundEntry) {
  return [e.id, e.fundId, e.type, e.amount, e.note, e.date, e.accountId, e.createdAt, e.updatedAt];
}

/** Inserts unless an entry with the same id exists (deterministic carryover ids). */
export async function insertFundEntryIfAbsent(db: SqlExecutor, e: FundEntry): Promise<boolean> {
  const result = await db.run(
    `INSERT OR IGNORE INTO fund_entries (id, fund_id, type, amount, note, date, account_id,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entryParams(e),
  );
  return result.changes > 0;
}

/** Spending from funds in `currency` with `fromIso <= date < toIso`. */
export async function fundSpendTotal(
  db: SqlExecutor,
  currency: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const row = await db.first<{ total: number | null }>(
    `SELECT SUM(e.amount) AS total FROM fund_entries e
     JOIN sinking_funds f ON f.id = e.fund_id
     WHERE e.type = 'spend' AND f.currency = ? AND e.date >= ? AND e.date < ?`,
    [currency, fromIso, toIso],
  );
  return row?.total ?? 0;
}
