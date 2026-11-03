import { getAccount } from '@/db/repositories/accountRepository';
import {
  deleteRecurringRule as deleteRow,
  getRecurringRule,
  insertRecurringRule,
  updateRecurringRule,
} from '@/db/repositories/recurringRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
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

/**
 * Creates or updates a rule. Editing keeps the generation watermark, so occurrences that were
 * already recorded are never generated again even when the schedule changes.
 */
export async function saveRecurringRule(
  db: SqlDatabase,
  input: RecurringRuleInput,
  existingId?: string,
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
    if (existing) await updateRecurringRule(tx, rule);
    else await insertRecurringRule(tx, rule);
    return ok(rule);
  });
}

/** Removes the rule; transactions it created stay in history. */
export async function deleteRecurringRule(db: SqlDatabase, id: string): Promise<void> {
  await db.transaction((tx) => deleteRow(tx, id));
}
