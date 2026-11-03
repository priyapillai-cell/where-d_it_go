import { getDatabase } from '@/db/database';
import { getAccount } from '@/db/repositories/accountRepository';
import {
  deleteTransaction as deleteRow,
  getTransaction,
  insertTransaction,
  updateTransaction,
} from '@/db/repositories/transactionRepository';
import { err, ok, type Result, type Transaction } from '@/domain/types';
import {
  type FieldErrors,
  hasErrors,
  type TransactionDraft,
  validateTransactionDraft,
} from '@/domain/validation';
import { newId } from '@/utils/id';

import { notifyDataChanged } from './dataEvents';

export type TransactionFieldErrors = FieldErrors<
  'amount' | 'toAmount' | 'accountId' | 'toAccountId' | 'categoryId' | 'note' | 'date'
>;

/** Validates and persists a new or edited transaction. Never throws for invalid input. */
export async function saveTransaction(
  draft: TransactionDraft,
  existingId?: string,
): Promise<Result<Transaction, TransactionFieldErrors>> {
  const errors: TransactionFieldErrors = validateTransactionDraft(draft);
  if (draft.type !== 'transfer' && !draft.categoryId) errors.categoryId = 'required';
  if (hasErrors(errors)) return err(errors);

  const db = await getDatabase();
  const account = await getAccount(db, draft.accountId as string);
  if (!account) return err({ accountId: 'missingAccount' });

  let toAmount: number | null = null;
  if (draft.type === 'transfer') {
    const toAccount = await getAccount(db, draft.toAccountId as string);
    if (!toAccount) return err({ toAccountId: 'missingToAccount' });
    toAmount = draft.toAmount ?? (toAccount.currency === account.currency ? draft.amount : null);
    if (toAmount === null) return err({ toAmount: 'amountPositive' });
  }

  const nowIso = new Date().toISOString();
  const existing = existingId ? await getTransaction(db, existingId) : null;
  const tx: Transaction = {
    id: existing?.id ?? newId(),
    type: draft.type,
    amount: draft.amount,
    toAmount,
    accountId: account.id,
    toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
    categoryId: draft.type === 'transfer' ? null : draft.categoryId,
    note: draft.note.trim(),
    date: new Date(draft.date).toISOString(),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    recurringRuleId: existing?.recurringRuleId ?? null,
    occurrenceKey: existing?.occurrenceKey ?? null,
  };

  if (existing) await updateTransaction(db, tx);
  else await insertTransaction(db, tx);
  await notifyDataChanged();
  return ok(tx);
}

/** Deletes and returns the removed row so the caller can offer Undo. */
export async function deleteTransaction(id: string): Promise<Transaction | null> {
  const db = await getDatabase();
  const existing = await getTransaction(db, id);
  if (!existing) return null;
  await deleteRow(db, id);
  await notifyDataChanged();
  return existing;
}

/** Re-inserts a previously deleted transaction with its original id (Undo). */
export async function restoreTransaction(tx: Transaction): Promise<void> {
  const db = await getDatabase();
  if (await getTransaction(db, tx.id)) return;
  await insertTransaction(db, tx);
  await notifyDataChanged();
}

export async function loadTransaction(id: string): Promise<Transaction | null> {
  return getTransaction(await getDatabase(), id);
}
