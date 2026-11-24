import { getAccount } from '@/db/repositories/accountRepository';
import {
  deleteRecurringRule as deleteRow,
  getRecurringRule,
  insertRecurringRule,
  updateRecurringRule,
} from '@/db/repositories/recurringRepository';
import { loadSettings } from '@/db/repositories/settingsRepository';
import {
  deleteTransaction,
  listRuleTransactionsFrom,
  updateTransaction,
} from '@/db/repositories/transactionRepository';
import type { SqlDatabase, SqlExecutor } from '@/db/sqlDatabase';
import { startOfCustomMonth } from '@/domain/periods';
import { dueOccurrences, occurrenceKey } from '@/domain/recurrence';
import {
  type CategoryType,
  err,
  type Frequency,
  ok,
  type RecurringRule,
  type Result,
} from '@/domain/types';
import {
  type FieldErrors,
  hasErrors,
  MAX_NOTE_LENGTH,
  validateRecurringDraft,
} from '@/domain/validation';
import { newId } from '@/utils/id';

export interface RecurringRuleInput {
  type: CategoryType;
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  note: string;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  reminderDaysBefore: number | null;
  isActive: boolean;
}

export type RecurringFieldErrors = FieldErrors<
  'amount' | 'accountId' | 'categoryId' | 'interval' | 'startDate' | 'endDate' | 'note'
>;

function scheduleChanged(a: RecurringRule, b: RecurringRule): boolean {
  return (
    a.startDate !== b.startDate ||
    a.endDate !== b.endDate ||
    a.frequency !== b.frequency ||
    a.interval !== b.interval
  );
}

/**
 * Applies an edited rule to what it already recorded from the current budget month on: those
 * transactions take the new amount, type, account, category and note, and ones no longer on
 * the schedule are removed. Earlier months stay as history and are not regenerated. Returns the
 * watermark to keep so the next generation run fills in this month's dates on the new schedule.
 */
async function applyEditToGenerated(
  tx: SqlExecutor,
  before: RecurringRule,
  after: RecurringRule,
  now: Date,
): Promise<string | null> {
  const { firstDayOfMonth } = await loadSettings(tx);
  const monthStart = startOfCustomMonth(now, firstDayOfMonth);
  const beforeMonth = new Date(monthStart.getTime() - 1).toISOString();
  const moved = scheduleChanged(before, after);
  const onSchedule = new Set(
    dueOccurrences({ ...after, isActive: true, lastGeneratedAt: beforeMonth }, now).map(
      occurrenceKey,
    ),
  );
  const nowIso = now.toISOString();
  for (const t of await listRuleTransactionsFrom(tx, after.id, monthStart.toISOString())) {
    if (moved && (!t.occurrenceKey || !onSchedule.has(t.occurrenceKey))) {
      await deleteTransaction(tx, t.id);
      continue;
    }
    await updateTransaction(tx, {
      ...t,
      type: after.type,
      amount: after.amount,
      accountId: after.accountId,
      categoryId: after.categoryId,
      note: after.note,
      updatedAt: nowIso,
    });
  }
  if (!moved || !before.lastGeneratedAt) return before.lastGeneratedAt;
  return before.lastGeneratedAt < beforeMonth ? before.lastGeneratedAt : beforeMonth;
}

/**
 * Creates or updates a rule. Editing updates what the rule recorded this month (see
 * `applyEditToGenerated`); older months are never generated twice.
 */
export async function saveRecurringRule(
  db: SqlDatabase,
  input: RecurringRuleInput,
  existingId?: string,
  now: Date = new Date(),
): Promise<Result<RecurringRule, RecurringFieldErrors>> {
  const errors: RecurringFieldErrors = validateRecurringDraft(input);
  if (!input.categoryId) errors.categoryId = 'required';
  if (input.note.length > MAX_NOTE_LENGTH) errors.note = 'tooLong';
  if (
    input.reminderDaysBefore !== null &&
    (!Number.isInteger(input.reminderDaysBefore) || input.reminderDaysBefore < 0)
  ) {
    errors.interval = 'invalidInterval';
  }
  if (hasErrors(errors)) return err(errors);

  return db.transaction(async (tx) => {
    if (!(await getAccount(tx, input.accountId as string))) {
      return err({ accountId: 'missingAccount' });
    }
    const existing = existingId ? await getRecurringRule(tx, existingId) : null;
    const rule: RecurringRule = {
      id: existing?.id ?? newId(),
      type: input.type,
      amount: input.amount,
      toAmount: null,
      accountId: input.accountId as string,
      toAccountId: null,
      categoryId: input.categoryId,
      note: input.note.trim(),
      frequency: input.frequency,
      interval: input.interval,
      startDate: new Date(input.startDate).toISOString(),
      endDate: input.endDate ? new Date(input.endDate).toISOString() : null,
      lastGeneratedAt: existing?.lastGeneratedAt ?? null,
      reminderDaysBefore: input.reminderDaysBefore,
      isActive: input.isActive,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (!existing) {
      await insertRecurringRule(tx, rule);
      return ok(rule);
    }
    const saved = { ...rule, lastGeneratedAt: await applyEditToGenerated(tx, existing, rule, now) };
    await updateRecurringRule(tx, saved);
    return ok(saved);
  });
}

/** Removes the rule; transactions it created stay in history. */
export async function deleteRecurringRule(db: SqlDatabase, id: string): Promise<void> {
  await db.transaction((tx) => deleteRow(tx, id));
}
