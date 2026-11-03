import { isValidCurrencyCode } from './money';
import type { Frequency, MinorUnits, TransactionType } from './types';

export type ValidationCode =
  | 'required'
  | 'tooLong'
  | 'amountPositive'
  | 'amountTooLarge'
  | 'invalidCurrency'
  | 'invalidDate'
  | 'sameAccount'
  | 'missingAccount'
  | 'missingToAccount'
  | 'invalidInterval'
  | 'endBeforeStart'
  | 'currencyLocked';

export type FieldErrors<K extends string> = Partial<Record<K, ValidationCode>>;

export const MAX_NAME_LENGTH = 60;
export const MAX_NOTE_LENGTH = 500;
/** One trillion major units: far beyond personal finance, safely inside 2^53. */
const MAX_AMOUNT = 1_000_000_000_000_00;

export function hasErrors<K extends string>(errors: FieldErrors<K>): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}

function validateAmount(amount: MinorUnits): ValidationCode | undefined {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'amountPositive';
  if (amount > MAX_AMOUNT) return 'amountTooLarge';
  return undefined;
}

function isValidIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export interface TransactionDraft {
  type: TransactionType;
  amount: MinorUnits;
  toAmount: MinorUnits | null;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  date: string;
}

export function validateTransactionDraft(
  draft: TransactionDraft,
): FieldErrors<'amount' | 'toAmount' | 'accountId' | 'toAccountId' | 'note' | 'date'> {
  const errors: FieldErrors<'amount' | 'toAmount' | 'accountId' | 'toAccountId' | 'note' | 'date'> =
    {
      amount: validateAmount(draft.amount),
      accountId: draft.accountId ? undefined : 'missingAccount',
      note: draft.note.length > MAX_NOTE_LENGTH ? 'tooLong' : undefined,
      date: isValidIso(draft.date) ? undefined : 'invalidDate',
    };
  if (draft.type === 'transfer') {
    if (!draft.toAccountId) errors.toAccountId = 'missingToAccount';
    else if (draft.toAccountId === draft.accountId) errors.toAccountId = 'sameAccount';
    if (draft.toAmount !== null) errors.toAmount = validateAmount(draft.toAmount);
  }
  return errors;
}

export interface AccountDraft {
  name: string;
  currency: string;
  initialBalance: MinorUnits | null;
}

export function validateAccountDraft(
  draft: AccountDraft,
): FieldErrors<'name' | 'currency' | 'initialBalance'> {
  const name = draft.name.trim();
  return {
    name: name === '' ? 'required' : name.length > MAX_NAME_LENGTH ? 'tooLong' : undefined,
    currency: isValidCurrencyCode(draft.currency) ? undefined : 'invalidCurrency',
    initialBalance:
      draft.initialBalance === null || !Number.isSafeInteger(draft.initialBalance)
        ? 'required'
        : Math.abs(draft.initialBalance) > MAX_AMOUNT
          ? 'amountTooLarge'
          : undefined,
  };
}

export function validateName(name: string): ValidationCode | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'required';
  if (trimmed.length > MAX_NAME_LENGTH) return 'tooLong';
  return undefined;
}

export function validateBudgetAmount(amount: MinorUnits | null): ValidationCode | undefined {
  return amount === null ? 'amountPositive' : validateAmount(amount);
}

export interface RecurringDraft {
  amount: MinorUnits;
  accountId: string | null;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
}

export function validateRecurringDraft(
  draft: RecurringDraft,
): FieldErrors<'amount' | 'accountId' | 'interval' | 'startDate' | 'endDate'> {
  return {
    amount: validateAmount(draft.amount),
    accountId: draft.accountId ? undefined : 'missingAccount',
    interval:
      Number.isInteger(draft.interval) && draft.interval >= 1 && draft.interval <= 1000
        ? undefined
        : 'invalidInterval',
    startDate: isValidIso(draft.startDate) ? undefined : 'invalidDate',
    endDate:
      draft.endDate === null
        ? undefined
        : !isValidIso(draft.endDate)
          ? 'invalidDate'
          : Date.parse(draft.endDate) < Date.parse(draft.startDate)
            ? 'endBeforeStart'
            : undefined,
  };
}
