import type { RecurringRule } from '@/domain/types';

import { bool, type RecurringRuleRow, toRecurringRule } from '../rows';
import type { SqlExecutor } from '../sqlDatabase';

export async function listRecurringRules(db: SqlExecutor): Promise<RecurringRule[]> {
  const rows = await db.all<RecurringRuleRow>('SELECT * FROM recurring_rules ORDER BY created_at');
  return rows.map(toRecurringRule);
}

export async function getRecurringRule(db: SqlExecutor, id: string): Promise<RecurringRule | null> {
  const row = await db.first<RecurringRuleRow>('SELECT * FROM recurring_rules WHERE id = ?', [id]);
  return row ? toRecurringRule(row) : null;
}

export async function insertRecurringRule(db: SqlExecutor, r: RecurringRule): Promise<void> {
  await db.run(
    `INSERT INTO recurring_rules (id, type, amount, to_amount, account_id, to_account_id, category_id, note,
       frequency, interval, start_date, end_date, last_generated_at, reminder_days_before, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id,
      r.type,
      r.amount,
      r.toAmount,
      r.accountId,
      r.toAccountId,
      r.categoryId,
      r.note,
      r.frequency,
      r.interval,
      r.startDate,
      r.endDate,
      r.lastGeneratedAt,
      r.reminderDaysBefore,
      bool(r.isActive),
      r.createdAt,
    ],
  );
}

export async function updateRecurringRule(db: SqlExecutor, r: RecurringRule): Promise<void> {
  await db.run(
    `UPDATE recurring_rules SET type = ?, amount = ?, to_amount = ?, account_id = ?, to_account_id = ?,
       category_id = ?, note = ?, frequency = ?, interval = ?, start_date = ?, end_date = ?,
       last_generated_at = ?, reminder_days_before = ?, is_active = ? WHERE id = ?`,
    [
      r.type,
      r.amount,
      r.toAmount,
      r.accountId,
      r.toAccountId,
      r.categoryId,
      r.note,
      r.frequency,
      r.interval,
      r.startDate,
      r.endDate,
      r.lastGeneratedAt,
      r.reminderDaysBefore,
      bool(r.isActive),
      r.id,
    ],
  );
}

export async function setRuleWatermark(
  db: SqlExecutor,
  id: string,
  lastGeneratedAt: string,
): Promise<void> {
  await db.run('UPDATE recurring_rules SET last_generated_at = ? WHERE id = ?', [
    lastGeneratedAt,
    id,
  ]);
}

/** Deletes a rule but keeps its already-generated transactions (detached). Run in a transaction. */
export async function deleteRecurringRule(db: SqlExecutor, id: string): Promise<void> {
  await db.run('UPDATE transactions SET recurring_rule_id = NULL WHERE recurring_rule_id = ?', [
    id,
  ]);
  await db.run('DELETE FROM recurring_rules WHERE id = ?', [id]);
}
