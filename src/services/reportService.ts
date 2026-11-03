import { addDays, startOfDay } from 'date-fns';

import { accountFlows, listAccounts } from '@/db/repositories/accountRepository';
import { earliestTransactionDate, listInRange } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { computeBalance } from '@/domain/balance';
import {
  type Period,
  type PeriodOptions,
  periodContaining,
  periodToIsoRange,
  shiftPeriod,
} from '@/domain/periods';
import type { MinorUnits, Transaction } from '@/domain/types';

export interface ReportData {
  /** Concrete bounds; an "all time" period starts at the first transaction. */
  start: Date;
  end: Date;
  transactions: Transaction[];
  /** Combined balance of the scoped accounts at `start`. */
  openingBalance: MinorUnits;
  thisMonth: Transaction[];
  lastMonth: Transaction[];
}

export async function loadReport(
  db: SqlDatabase,
  period: Period,
  accountIds: readonly string[],
  options: PeriodOptions,
  now: Date = new Date(),
): Promise<ReportData> {
  let start = period.start;
  if (!start) {
    const earliest = await earliestTransactionDate(db);
    start = startOfDay(earliest ? new Date(earliest) : now);
  }
  const end = period.end ?? addDays(startOfDay(now), 1);
  const startIso = start.toISOString();

  const month = periodContaining('month', now, options);
  const previousMonth = shiftPeriod(month, -1, options);

  const [transactions, accounts, flowsBefore, thisMonth, lastMonth] = await Promise.all([
    listInRange(db, { from: startIso, to: end.toISOString(), accountIds }),
    listAccounts(db),
    accountFlows(db, startIso),
    listInRange(db, { ...periodToIsoRange(month), accountIds }),
    listInRange(db, { ...periodToIsoRange(previousMonth), accountIds }),
  ]);

  const scoped = new Set(accountIds);
  const openingBalance = accounts
    .filter((a) => scoped.has(a.id))
    .reduce((sum, a) => sum + computeBalance(a, flowsBefore.get(a.id)), 0);

  return { start, end, transactions, openingBalance, thisMonth, lastMonth };
}
