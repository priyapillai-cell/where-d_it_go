import type { Budget, MinorUnits, Transaction } from './types';

export type BudgetStatus = 'ok' | 'warning' | 'over';
export type BudgetThreshold = 80 | 100;
export const BUDGET_THRESHOLDS: readonly BudgetThreshold[] = [80, 100];

export interface BudgetProgress {
  spent: MinorUnits;
  limit: MinorUnits;
  remaining: MinorUnits;
  /** spent / limit; may exceed 1. */
  ratio: number;
  status: BudgetStatus;
}

/** Green below 80%, amber from 80% up to and including 100%, red above 100%. */
export function budgetStatus(ratio: number): BudgetStatus {
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

export function budgetProgress(limit: MinorUnits, spent: MinorUnits): BudgetProgress {
  const ratio = limit > 0 ? spent / limit : spent > 0 ? Infinity : 0;
  return { spent, limit, remaining: limit - spent, ratio, status: budgetStatus(ratio) };
}

export interface MonthBudgetSummary {
  /** `overall` when an all-expenses budget exists, else the sum of the category budgets. */
  source: 'overall' | 'categories';
  progress: BudgetProgress;
}

/** The month's budget in one currency, as shown on the overview; `null` without budgets. */
export function monthBudgetSummary(
  items: readonly { budget: Pick<Budget, 'categoryId' | 'currency'>; progress: BudgetProgress }[],
  currency: string,
): MonthBudgetSummary | null {
  const inCurrency = items.filter((i) => i.budget.currency === currency);
  const overall = inCurrency.find((i) => i.budget.categoryId === null);
  if (overall) return { source: 'overall', progress: overall.progress };
  if (inCurrency.length === 0) return null;
  const limit = inCurrency.reduce((sum, i) => sum + i.progress.limit, 0);
  const spent = inCurrency.reduce((sum, i) => sum + i.progress.spent, 0);
  return { source: 'categories', progress: budgetProgress(limit, spent) };
}

/** Expense total that counts against a budget: its category (or all) in the budget currency. */
export function spentForBudget(
  budget: Pick<Budget, 'categoryId' | 'currency'>,
  transactions: readonly Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'accountId'>[],
  accountCurrency: ReadonlyMap<string, string>,
): MinorUnits {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (accountCurrency.get(tx.accountId) !== budget.currency) continue;
    if (budget.categoryId !== null && tx.categoryId !== budget.categoryId) continue;
    total += tx.amount;
  }
  return total;
}

/** Thresholds reached by `ratio` that have not been notified yet in this period. */
export function newlyReachedThresholds(
  ratio: number,
  alreadyNotified: readonly number[],
): BudgetThreshold[] {
  return BUDGET_THRESHOLDS.filter((t) => ratio * 100 >= t && !alreadyNotified.includes(t));
}
