import type { AccountFlow } from '@/domain/balance';
import type { Account } from '@/domain/types';

import { type AccountRow, bool, toAccount } from '../rows';
import type { SqlExecutor } from '../sqlDatabase';

export async function listAccounts(db: SqlExecutor, includeArchived = true): Promise<Account[]> {
  const rows = await db.all<AccountRow>(
    `SELECT * FROM accounts ${includeArchived ? '' : 'WHERE is_archived = 0'} ORDER BY sort_order, created_at`,
  );
  return rows.map(toAccount);
}

export async function getAccount(db: SqlExecutor, id: string): Promise<Account | null> {
  const row = await db.first<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ? toAccount(row) : null;
}

export async function insertAccount(db: SqlExecutor, a: Account): Promise<void> {
  await db.run(
    `INSERT INTO accounts (id, name, currency, initial_balance, color, icon, include_in_total, is_archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      a.name,
      a.currency,
      a.initialBalance,
      a.color,
      a.icon,
      bool(a.includeInTotal),
      bool(a.isArchived),
      a.sortOrder,
      a.createdAt,
    ],
  );
}

export async function updateAccount(db: SqlExecutor, a: Account): Promise<void> {
  await db.run(
    `UPDATE accounts SET name = ?, currency = ?, initial_balance = ?, color = ?, icon = ?,
       include_in_total = ?, is_archived = ?, sort_order = ? WHERE id = ?`,
    [
      a.name,
      a.currency,
      a.initialBalance,
      a.color,
      a.icon,
      bool(a.includeInTotal),
      bool(a.isArchived),
      a.sortOrder,
      a.id,
    ],
  );
}

export async function nextAccountSortOrder(db: SqlExecutor): Promise<number> {
  const row = await db.first<{ next: number }>(
    'SELECT IFNULL(MAX(sort_order), -1) + 1 AS next FROM accounts',
  );
  return row?.next ?? 0;
}

/** Persists a new order; call inside a transaction so the reorder is atomic. */
export async function reorderAccounts(
  db: SqlExecutor,
  orderedIds: readonly string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db.run('UPDATE accounts SET sort_order = ? WHERE id = ?', [index, id]);
  }
}

export async function countAccountTransactions(db: SqlExecutor, id: string): Promise<number> {
  const row = await db.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?',
    [id, id],
  );
  return row?.n ?? 0;
}

/** Aggregated money flows per account in a single pass over the account indexes. */
export async function accountFlows(
  db: SqlExecutor,
  beforeIso?: string,
): Promise<Map<string, AccountFlow>> {
  const dateClause = beforeIso ? 'AND date < ?' : '';
  const params = beforeIso ? [beforeIso, beforeIso] : [];
  const rows = await db.all<{
    account_id: string;
    income: number;
    expense: number;
    out_total: number;
    in_total: number;
  }>(
    `SELECT account_id, SUM(income) AS income, SUM(expense) AS expense, SUM(out_total) AS out_total, SUM(in_total) AS in_total FROM (
       SELECT account_id,
              SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
              SUM(CASE WHEN type = 'transfer' THEN amount ELSE 0 END) AS out_total,
              0 AS in_total
       FROM transactions WHERE 1 = 1 ${dateClause} GROUP BY account_id
       UNION ALL
       SELECT to_account_id AS account_id, 0, 0, 0, SUM(IFNULL(to_amount, amount))
       FROM transactions WHERE type = 'transfer' AND to_account_id IS NOT NULL ${dateClause} GROUP BY to_account_id
     ) GROUP BY account_id`,
    params,
  );
  return new Map(
    rows.map((r) => [
      r.account_id,
      {
        accountId: r.account_id,
        income: r.income ?? 0,
        expense: r.expense ?? 0,
        transferOut: r.out_total ?? 0,
        transferIn: r.in_total ?? 0,
      },
    ]),
  );
}
