/** All monetary amounts are integers in the currency's minor unit (e.g. cents). */
export type MinorUnits = number;

/** ISO-8601 timestamp in UTC, always produced by `Date.prototype.toISOString()`. */
export type IsoTimestamp = string;

export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryType = 'expense' | 'income';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ThemePreference = 'light' | 'dark' | 'system';
export type LanguagePreference = 'system' | 'en';
/** 0 = Sunday, 1 = Monday, 6 = Saturday (matches `Date.prototype.getDay`). */
export type WeekStart = 0 | 1 | 6;
export type BudgetPeriod = 'monthly';

export const TRANSACTION_TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer'];
export const CATEGORY_TYPES: readonly CategoryType[] = ['expense', 'income'];
export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
export const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const WEEK_STARTS: readonly WeekStart[] = [1, 0, 6];

export interface Account {
  id: string;
  name: string;
  currency: string;
  initialBalance: MinorUnits;
  color: string;
  icon: string;
  includeInTotal: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: IsoTimestamp;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Always positive. For transfers this is the amount leaving `accountId`, in its currency. */
  amount: MinorUnits;
  /** Transfers only: amount arriving in `toAccountId`, in that account's currency. */
  toAmount: MinorUnits | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  date: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  recurringRuleId: string | null;
  /** Deterministic key of the recurring occurrence that produced this row. */
  occurrenceKey: string | null;
}

/** Fields shared by a transaction and the recurring rule template that generates it. */
export type TransactionTemplate = Pick<
  Transaction,
  'type' | 'amount' | 'toAmount' | 'accountId' | 'toAccountId' | 'categoryId' | 'note'
>;

export interface RecurringRule extends TransactionTemplate {
  id: string;
  frequency: Frequency;
  interval: number;
  startDate: IsoTimestamp;
  endDate: IsoTimestamp | null;
  /** Date of the most recent generated occurrence (a watermark, not wall-clock time). */
  lastGeneratedAt: IsoTimestamp | null;
  reminderDaysBefore: number | null;
  isActive: boolean;
  createdAt: IsoTimestamp;
}

export interface Budget {
  id: string;
  /** `null` means the overall budget across all expense categories. */
  categoryId: string | null;
  period: BudgetPeriod;
  amount: MinorUnits;
  currency: string;
}

/**
 * Money set aside for an irregular, larger expense (gifts, vacations). Tracked separately from
 * daily accounts: fund entries never change account balances or the daily overview.
 */
export interface SinkingFund {
  id: string;
  name: string;
  icon: string;
  color: string;
  currency: string;
  /** Goal for the fund; `null` when the fund has no target. */
  targetAmount: MinorUnits | null;
  /** Calendar day (YYYY-MM-DD) the target should be reached by. */
  targetDate: string | null;
  /** Planned amount to set aside each month. */
  monthlyContribution: MinorUnits | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: IsoTimestamp;
}

export type FundEntryType = 'deposit' | 'spend';
export const FUND_ENTRY_TYPES: readonly FundEntryType[] = ['deposit', 'spend'];

export interface FundEntry {
  id: string;
  fundId: string;
  type: FundEntryType;
  /** Always positive, in the fund's currency. */
  amount: MinorUnits;
  note: string;
  date: IsoTimestamp;
  /** For deposits moved out of an account: the account, whose balance it reduces. */
  accountId: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** What happens to the unspent part of the main monthly budget when a month ends. */
export type BudgetLeftoverMode = 'none' | 'nextMonth' | 'sinkingFund';
export const BUDGET_LEFTOVER_MODES: readonly BudgetLeftoverMode[] = [
  'none',
  'nextMonth',
  'sinkingFund',
];

/** What happens to the unspent part of the sinking fund budget when a month ends. */
export type FundLeftoverMode = 'keep' | 'nextMonth';
export const FUND_LEFTOVER_MODES: readonly FundLeftoverMode[] = ['keep', 'nextMonth'];

export interface Settings {
  defaultCurrency: string;
  firstDayOfWeek: WeekStart;
  /** 1..28 so every month contains the start day. */
  firstDayOfMonth: number;
  theme: ThemePreference;
  /** The passcode hash itself lives in the OS secure store, never in SQLite. */
  passcodeEnabled: boolean;
  biometricsEnabled: boolean;
  language: LanguagePreference;
  /** Monthly budget for the whole sinking fund, in the default currency. */
  fundBudget: MinorUnits | null;
  budgetLeftover: BudgetLeftoverMode;
  /** Sinking fund category that receives the main budget's leftover. */
  budgetLeftoverFundId: string | null;
  /** Account the leftover is taken from when it moves into the sinking fund. */
  budgetLeftoverAccountId: string | null;
  /** First budget month (YYYY-MM) whose leftover is handled; set when the mode is chosen. */
  budgetLeftoverSince: string | null;
  /** Last budget month whose leftover was moved into the sinking fund. */
  budgetLeftoverLastMonth: string | null;
  fundLeftover: FundLeftoverMode;
  fundLeftoverSince: string | null;
  showFundsOnOverview: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCurrency: 'USD',
  firstDayOfWeek: 1,
  firstDayOfMonth: 1,
  theme: 'system',
  passcodeEnabled: false,
  biometricsEnabled: false,
  language: 'system',
  fundBudget: null,
  budgetLeftover: 'none',
  budgetLeftoverFundId: null,
  budgetLeftoverAccountId: null,
  budgetLeftoverSince: null,
  budgetLeftoverLastMonth: null,
  fundLeftover: 'keep',
  fundLeftoverSince: null,
  showFundsOnOverview: false,
};

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
