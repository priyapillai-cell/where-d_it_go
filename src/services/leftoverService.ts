import { getAccount, listAccounts } from '@/db/repositories/accountRepository';
import { listBudgets } from '@/db/repositories/budgetRepository';
import { fundSpendTotal, getFund, insertFundEntryIfAbsent } from '@/db/repositories/fundRepository';
import { listInRange } from '@/db/repositories/transactionRepository';
import type { SqlDatabase, SqlExecutor } from '@/db/sqlDatabase';
import { type BudgetProgress, budgetProgress, spentForBudget } from '@/domain/budgets';
import { budgetMonthsSince, leftoverOf, rolledLimits } from '@/domain/carryover';
import { monthPeriodKey, type Period } from '@/domain/periods';
import type { Budget, MinorUnits, Settings } from '@/domain/types';
import { stableId } from '@/utils/id';

export interface MonthBudgetState {
  period: Period;
  /** The budget as set by the user. */
  base: MinorUnits;
  /** Unspent budget brought forward from earlier months. */
  carried: MinorUnits;
  /** `progress.limit` is `base + carried`. */
  progress: BudgetProgress;
}

export interface MainMonthBudget extends MonthBudgetState {
  /** `overall` when an all-expenses budget exists, else the sum of the category budgets. */
  source: 'overall' | 'categories';
}

type BudgetSettings = Pick<
  Settings,
  'defaultCurrency' | 'firstDayOfMonth' | 'budgetLeftover' | 'budgetLeftoverSince'
>;

function mainBudgetScope(budgets: readonly Budget[], currency: string) {
  const inCurrency = budgets.filter((b) => b.currency === currency);
  const overall = inCurrency.find((b) => b.categoryId === null);
  if (overall) return { source: 'overall' as const, budgets: [overall] };
  if (inCurrency.length === 0) return null;
  return { source: 'categories' as const, budgets: inCurrency };
}

async function mainSpentPerMonth(
  db: SqlExecutor,
  months: readonly Period[],
  budgets: readonly Budget[],
): Promise<MinorUnits[]> {
  const accounts = await listAccounts(db);
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const spent: MinorUnits[] = [];
  for (const month of months) {
    const transactions = await listInRange(db, {
      from: month.start?.toISOString() ?? null,
      to: month.end?.toISOString() ?? null,
      accountIds: null,
    });
    spent.push(budgets.reduce((sum, b) => sum + spentForBudget(b, transactions, currencyOf), 0));
  }
  return spent;
}

/**
 * The main monthly budget for the month containing `now`, in the default currency, including
 * leftovers rolled forward when that option is on. `null` without budgets in that currency.
 */
export async function loadMainMonthBudget(
  db: SqlExecutor,
  now: Date,
  settings: BudgetSettings,
): Promise<MainMonthBudget | null> {
  const scope = mainBudgetScope(await listBudgets(db), settings.defaultCurrency);
  if (!scope) return null;
  const base = scope.budgets.reduce((sum, b) => sum + b.amount, 0);
  const since = settings.budgetLeftover === 'nextMonth' ? settings.budgetLeftoverSince : null;
  const months = budgetMonthsSince(since, now, settings.firstDayOfMonth);
  const spent = await mainSpentPerMonth(db, months, scope.budgets);
  const limits = rolledLimits(base, spent);
  const limit = limits.at(-1) ?? base;
  return {
    source: scope.source,
    period: months.at(-1) ?? months[0]!,
    base,
    carried: limit - base,
    progress: budgetProgress(limit, spent.at(-1) ?? 0),
  };
}

/**
 * The sinking fund budget for the month containing `now`: spending from funds in the default
 * currency against `fundBudget`, plus leftovers rolled forward when that option is on.
 */
export async function loadFundMonthBudget(
  db: SqlExecutor,
  now: Date,
  settings: Pick<
    Settings,
    'defaultCurrency' | 'firstDayOfMonth' | 'fundBudget' | 'fundLeftover' | 'fundLeftoverSince'
  >,
): Promise<MonthBudgetState | null> {
  if (settings.fundBudget === null) return null;
  const since = settings.fundLeftover === 'nextMonth' ? settings.fundLeftoverSince : null;
  const months = budgetMonthsSince(since, now, settings.firstDayOfMonth);
  const spent: MinorUnits[] = [];
  for (const month of months) {
    spent.push(
      await fundSpendTotal(
        db,
        settings.defaultCurrency,
        month.start?.toISOString() ?? '',
        month.end?.toISOString() ?? '',
      ),
    );
  }
  const base = settings.fundBudget;
  const limit = rolledLimits(base, spent).at(-1) ?? base;
  return {
    period: months.at(-1) ?? months[0]!,
    base,
    carried: limit - base,
    progress: budgetProgress(limit, spent.at(-1) ?? 0),
  };
}

export const leftoverEntryId = (monthKey: string): string => stableId('leftover', monthKey);

/**
 * When the main budget's leftover goes to the sinking fund: deposits what was left of every
 * finished month since the option was chosen. Returns the deposits made and the last month
 * handled, which the caller stores as `budgetLeftoverLastMonth`.
 */
export async function runBudgetLeftoverTransfers(
  db: SqlDatabase,
  settings: Settings,
  now: Date = new Date(),
): Promise<{ created: number; lastMonth: string | null }> {
  const none = { created: 0, lastMonth: settings.budgetLeftoverLastMonth };
  if (settings.budgetLeftover !== 'sinkingFund' || !settings.budgetLeftoverSince) return none;
  const fundId = settings.budgetLeftoverFundId;
  if (!fundId) return none;

  return db.transaction(async (tx) => {
    const fund = await getFund(tx, fundId);
    if (!fund || fund.isArchived || fund.currency !== settings.defaultCurrency) return none;
    const scope = mainBudgetScope(await listBudgets(tx), settings.defaultCurrency);
    if (!scope) return none;

    const last = settings.budgetLeftoverLastMonth;
    const finished = budgetMonthsSince(settings.budgetLeftoverSince, now, settings.firstDayOfMonth)
      .slice(0, -1)
      .filter(
        (m) => m.start && (!last || monthPeriodKey(m.start, settings.firstDayOfMonth) > last),
      );
    if (finished.length === 0) return none;

    const account = settings.budgetLeftoverAccountId
      ? await getAccount(tx, settings.budgetLeftoverAccountId)
      : null;
    const accountId =
      account && !account.isArchived && account.currency === fund.currency ? account.id : null;
    const base = scope.budgets.reduce((sum, b) => sum + b.amount, 0);
    const spent = await mainSpentPerMonth(tx, finished, scope.budgets);

    let created = 0;
    let lastMonth = last;
    for (const [i, month] of finished.entries()) {
      const key = monthPeriodKey(month.start!, settings.firstDayOfMonth);
      lastMonth = key;
      const amount = leftoverOf(base, spent[i] ?? 0);
      if (amount <= 0 || !month.end) continue;
      const nowIso = now.toISOString();
      const inserted = await insertFundEntryIfAbsent(tx, {
        id: leftoverEntryId(key),
        fundId: fund.id,
        type: 'deposit',
        amount,
        note: '',
        date: month.end.toISOString(),
        accountId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (inserted) created += 1;
    }
    return { created, lastMonth };
  });
}
