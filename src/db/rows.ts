import type {
  Account,
  Budget,
  Category,
  CategoryType,
  Frequency,
  RecurringRule,
  Transaction,
  TransactionType,
} from '@/domain/types';

export interface AccountRow {
  id: string;
  name: string;
  currency: string;
  initial_balance: number;
  color: string;
  icon: string;
  include_in_total: number;
  is_archived: number;
  sort_order: number;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sort_order: number;
  is_archived: number;
}

export interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: number;
  to_amount: number | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string;
  date: string;
  created_at: string;
  updated_at: string;
  recurring_rule_id: string | null;
  occurrence_key: string | null;
}

export interface RecurringRuleRow {
  id: string;
  type: TransactionType;
  amount: number;
  to_amount: number | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string;
  frequency: Frequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  last_generated_at: string | null;
  reminder_days_before: number | null;
  is_active: number;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  category_id: string | null;
  period: 'monthly';
  amount: number;
  currency: string;
}

export const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  currency: r.currency,
  initialBalance: r.initial_balance,
  color: r.color,
  icon: r.icon,
  includeInTotal: r.include_in_total === 1,
  isArchived: r.is_archived === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});

export const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  type: r.type,
  icon: r.icon,
  color: r.color,
  sortOrder: r.sort_order,
  isArchived: r.is_archived === 1,
});

export const toTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  type: r.type,
  amount: r.amount,
  toAmount: r.to_amount,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  categoryId: r.category_id,
  note: r.note,
  date: r.date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  recurringRuleId: r.recurring_rule_id,
  occurrenceKey: r.occurrence_key,
});

export const toRecurringRule = (r: RecurringRuleRow): RecurringRule => ({
  id: r.id,
  type: r.type,
  amount: r.amount,
  toAmount: r.to_amount,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  categoryId: r.category_id,
  note: r.note,
  frequency: r.frequency,
  interval: r.interval,
  startDate: r.start_date,
  endDate: r.end_date,
  lastGeneratedAt: r.last_generated_at,
  reminderDaysBefore: r.reminder_days_before,
  isActive: r.is_active === 1,
  createdAt: r.created_at,
});

export const toBudget = (r: BudgetRow): Budget => ({
  id: r.id,
  categoryId: r.category_id,
  period: r.period,
  amount: r.amount,
  currency: r.currency,
});

export const bool = (v: boolean): number => (v ? 1 : 0);
