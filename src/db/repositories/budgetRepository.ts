import type { Budget } from '@/domain/types';

import { type BudgetRow, toBudget } from '../rows';
import type { SqlExecutor } from '../sqlDatabase';

export async function listBudgets(db: SqlExecutor): Promise<Budget[]> {
  const rows = await db.all<BudgetRow>(
    'SELECT * FROM budgets ORDER BY category_id IS NOT NULL, rowid',
  );
  return rows.map(toBudget);
}

/** Inserts or replaces the budget for the same scope (category + currency + period). */
export async function upsertBudget(db: SqlExecutor, b: Budget): Promise<void> {
  await db.run(
    `DELETE FROM budgets WHERE id <> ? AND IFNULL(category_id, '') = IFNULL(?, '') AND currency = ? AND period = ?`,
    [b.id, b.categoryId, b.currency, b.period],
  );
  await db.run(
    `INSERT INTO budgets (id, category_id, period, amount, currency) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, amount = excluded.amount,
       currency = excluded.currency, period = excluded.period`,
    [b.id, b.categoryId, b.period, b.amount, b.currency],
  );
}

export async function deleteBudget(db: SqlExecutor, id: string): Promise<void> {
  await db.run('DELETE FROM budget_alerts WHERE budget_id = ?', [id]);
  await db.run('DELETE FROM budgets WHERE id = ?', [id]);
}

export async function notifiedThresholds(
  db: SqlExecutor,
  budgetId: string,
  periodKey: string,
): Promise<number[]> {
  const rows = await db.all<{ threshold: number }>(
    'SELECT threshold FROM budget_alerts WHERE budget_id = ? AND period_key = ?',
    [budgetId, periodKey],
  );
  return rows.map((r) => r.threshold);
}

/** Records an alert; returns false if it was already recorded (so it is sent at most once). */
export async function recordBudgetAlert(
  db: SqlExecutor,
  budgetId: string,
  periodKey: string,
  threshold: number,
  at: string,
): Promise<boolean> {
  const result = await db.run(
    'INSERT OR IGNORE INTO budget_alerts (budget_id, period_key, threshold, notified_at) VALUES (?, ?, ?, ?)',
    [budgetId, periodKey, threshold, at],
  );
  return result.changes > 0;
}
