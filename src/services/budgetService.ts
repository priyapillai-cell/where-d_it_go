import { listAccounts } from '@/db/repositories/accountRepository';
import {
  deleteBudget as deleteRow,
  listBudgets,
  notifiedThresholds,
  recordBudgetAlert,
  upsertBudget,
} from '@/db/repositories/budgetRepository';
import { listInRange } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import {
  type BudgetProgress,
  budgetProgress,
  type BudgetThreshold,
  newlyReachedThresholds,
  spentForBudget,
} from '@/domain/budgets';
import { monthPeriodKey, type Period, periodContaining, periodToIsoRange } from '@/domain/periods';
import { type Budget, err, ok, type Result } from '@/domain/types';
import { validateBudgetAmount, type ValidationCode } from '@/domain/validation';
import { newId } from '@/utils/id';

export interface BudgetInput {
  categoryId: string | null;
  amount: number | null;
  currency: string;
}

/** Saving a budget for a scope that already has one replaces it (one budget per scope). */
export async function saveBudget(
  db: SqlDatabase,
  input: BudgetInput,
  existingId?: string,
): Promise<Result<Budget, { amount: ValidationCode }>> {
  const amountError = validateBudgetAmount(input.amount);
  if (amountError || input.amount === null) return err({ amount: amountError ?? 'amountPositive' });
  const budget: Budget = {
    id: existingId ?? newId(),
    categoryId: input.categoryId,
    period: 'monthly',
    amount: input.amount,
    currency: input.currency,
  };
  await db.transaction((tx) => upsertBudget(tx, budget));
  return ok(budget);
}

export async function deleteBudget(db: SqlDatabase, id: string): Promise<void> {
  await db.transaction((tx) => deleteRow(tx, id));
}

export interface BudgetOverviewItem {
  budget: Budget;
  progress: BudgetProgress;
}

export interface BudgetOverview {
  period: Period;
  periodKey: string;
  items: BudgetOverviewItem[];
}

/** Progress of every budget for the (custom-start) month containing `now`. */
export async function loadBudgetOverview(
  db: SqlDatabase,
  now: Date,
  firstDayOfMonth: number,
): Promise<BudgetOverview> {
  const period = periodContaining('month', now, { firstDayOfWeek: 1, firstDayOfMonth });
  const { from, to } = periodToIsoRange(period);
  const [budgets, accounts, transactions] = await Promise.all([
    listBudgets(db),
    listAccounts(db),
    listInRange(db, { from, to, accountIds: null }),
  ]);
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  return {
    period,
    periodKey: monthPeriodKey(now, firstDayOfMonth),
    items: budgets.map((budget) => ({
      budget,
      progress: budgetProgress(budget.amount, spentForBudget(budget, transactions, currencyOf)),
    })),
  };
}

export interface BudgetAlert extends BudgetOverviewItem {
  threshold: BudgetThreshold;
}

/**
 * Returns thresholds crossed for the first time this month and records them, so each alert
 * fires at most once per budget, threshold and month (including across app restarts).
 */
export async function collectBudgetAlerts(
  db: SqlDatabase,
  now: Date,
  firstDayOfMonth: number,
): Promise<BudgetAlert[]> {
  const overview = await loadBudgetOverview(db, now, firstDayOfMonth);
  const alerts: BudgetAlert[] = [];
  for (const item of overview.items) {
    const notified = await notifiedThresholds(db, item.budget.id, overview.periodKey);
    const reached = newlyReachedThresholds(item.progress.ratio, notified);
    // Only the highest new threshold is announced; lower ones are recorded silently.
    let highest: BudgetThreshold | null = null;
    for (const threshold of reached) {
      const recorded = await recordBudgetAlert(
        db,
        item.budget.id,
        overview.periodKey,
        threshold,
        now.toISOString(),
      );
      if (recorded && (highest === null || threshold > highest)) highest = threshold;
    }
    if (highest !== null) alerts.push({ ...item, threshold: highest });
  }
  return alerts;
}
