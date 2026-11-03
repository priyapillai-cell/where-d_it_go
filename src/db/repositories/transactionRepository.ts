import type { TransactionFilter } from '@/domain/transactionFilter';
import type { CategoryType, Transaction } from '@/domain/types';

import { toTransaction, type TransactionRow } from '../rows';
import type { SqlExecutor, SqlValue } from '../sqlDatabase';

const COLUMNS =
  'id, type, amount, to_amount, account_id, to_account_id, category_id, note, date, created_at, updated_at, recurring_rule_id, occurrence_key';

function values(t: Transaction): SqlValue[] {
  return [
    t.id,
    t.type,
    t.amount,
    t.toAmount,
    t.accountId,
    t.toAccountId,
    t.categoryId,
    t.note,
    t.date,
    t.createdAt,
    t.updatedAt,
    t.recurringRuleId,
    t.occurrenceKey,
  ];
}

export async function insertTransaction(db: SqlExecutor, t: Transaction): Promise<void> {
  await db.run(
    `INSERT INTO transactions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values(t),
  );
}

/** Inserts unless the (rule, occurrence) pair already exists. Returns true if a row was added. */
export async function insertTransactionIfAbsent(db: SqlExecutor, t: Transaction): Promise<boolean> {
  const result = await db.run(
    `INSERT OR IGNORE INTO transactions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values(t),
  );
  return result.changes > 0;
}

export async function updateTransaction(db: SqlExecutor, t: Transaction): Promise<void> {
  await db.run(
    `UPDATE transactions SET type = ?, amount = ?, to_amount = ?, account_id = ?, to_account_id = ?,
       category_id = ?, note = ?, date = ?, updated_at = ? WHERE id = ?`,
    [
      t.type,
      t.amount,
      t.toAmount,
      t.accountId,
      t.toAccountId,
      t.categoryId,
      t.note,
      t.date,
      t.updatedAt,
      t.id,
    ],
  );
}

export async function deleteTransaction(db: SqlExecutor, id: string): Promise<void> {
  await db.run('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function getTransaction(db: SqlExecutor, id: string): Promise<Transaction | null> {
  const row = await db.first<TransactionRow>(`SELECT ${COLUMNS} FROM transactions WHERE id = ?`, [
    id,
  ]);
  return row ? toTransaction(row) : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

/** Builds the WHERE clause for list/search screens. Exported for unit testing. */
export function buildFilterClause(filter: TransactionFilter): {
  where: string;
  params: SqlValue[];
} {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  const search = filter.search.trim();
  if (search !== '') {
    const like = `%${escapeLike(search)}%`;
    clauses.push(`(t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  if (filter.types.length > 0) {
    clauses.push(`t.type IN (${placeholders(filter.types.length)})`);
    params.push(...filter.types);
  }
  if (filter.accountIds.length > 0) {
    const ph = placeholders(filter.accountIds.length);
    clauses.push(`(t.account_id IN (${ph}) OR t.to_account_id IN (${ph}))`);
    params.push(...filter.accountIds, ...filter.accountIds);
  }
  if (filter.categoryIds.length > 0) {
    clauses.push(`t.category_id IN (${placeholders(filter.categoryIds.length)})`);
    params.push(...filter.categoryIds);
  }
  if (filter.from) {
    clauses.push('t.date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push('t.date < ?');
    params.push(filter.to);
  }
  if (filter.minAmount !== null) {
    clauses.push('t.amount >= ?');
    params.push(filter.minAmount);
  }
  if (filter.maxAmount !== null) {
    clauses.push('t.amount <= ?');
    params.push(filter.maxAmount);
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Newest first. Joins categories only for name search; rendering resolves names from the store. */
export async function listTransactions(
  db: SqlExecutor,
  filter: TransactionFilter,
): Promise<Transaction[]> {
  const { where, params } = buildFilterClause(filter);
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS.split(', ')
      .map((c) => `t.${c}`)
      .join(', ')}
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     ${where}
     ORDER BY t.date DESC, t.created_at DESC`,
    params,
  );
  return rows.map(toTransaction);
}

export interface RangeQuery {
  from: string | null;
  to: string | null;
  /** Restrict to transactions touching these accounts; null = all accounts. */
  accountIds: readonly string[] | null;
}

export async function listInRange(db: SqlExecutor, q: RangeQuery): Promise<Transaction[]> {
  return listTransactions(db, {
    search: '',
    types: [],
    accountIds: q.accountIds ? [...q.accountIds] : [],
    categoryIds: [],
    from: q.from,
    to: q.to,
    minAmount: null,
    maxAmount: null,
  });
}

export async function listAllTransactions(db: SqlExecutor): Promise<Transaction[]> {
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date, created_at`,
  );
  return rows.map(toTransaction);
}

export async function earliestTransactionDate(db: SqlExecutor): Promise<string | null> {
  const row = await db.first<{ d: string | null }>('SELECT MIN(date) AS d FROM transactions');
  return row?.d ?? null;
}

/** Most recently used category of a type: the quick-add default when none is preselected. */
export async function lastUsedCategoryId(
  db: SqlExecutor,
  type: CategoryType,
): Promise<string | null> {
  const row = await db.first<{ category_id: string | null }>(
    `SELECT t.category_id FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = ? AND c.is_archived = 0 ORDER BY t.created_at DESC LIMIT 1`,
    [type],
  );
  return row?.category_id ?? null;
}

export async function countTransactions(db: SqlExecutor): Promise<number> {
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return row?.n ?? 0;
}
