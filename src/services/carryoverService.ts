import { addMonths } from 'date-fns';

import { accountFlows, getAccount } from '@/db/repositories/accountRepository';
import {
  carryoverTakenFromAccount,
  getFund,
  insertFundEntryIfAbsent,
  listFunds,
  upsertFund,
} from '@/db/repositories/fundRepository';
import type { SqlDatabase, SqlExecutor } from '@/db/sqlDatabase';
import { computeBalance } from '@/domain/balance';
import { carryoverAmount, dueCarryoverMonths, monthKey, monthStart } from '@/domain/carryover';
import type { Account, MinorUnits, SinkingFund } from '@/domain/types';
import { stableId } from '@/utils/id';

export const carryoverEntryId = (fundId: string, month: string): string =>
  stableId('carry', fundId, month);

/**
 * What the account gained between two instants, ignoring automatic carryovers so one month's
 * carryover never eats into the next month's leftover.
 */
async function netChangeExcludingCarryover(
  db: SqlExecutor,
  account: Account,
  from: Date,
  to: Date,
): Promise<MinorUnits> {
  const [before, after] = await Promise.all([
    accountFlows(db, from.toISOString()),
    accountFlows(db, to.toISOString()),
  ]);
  const change =
    computeBalance(account, after.get(account.id)) -
    computeBalance(account, before.get(account.id));
  const carried = await carryoverTakenFromAccount(
    db,
    account.id,
    from.toISOString(),
    to.toISOString(),
  );
  return change + carried;
}

async function carryOverFund(db: SqlExecutor, fund: SinkingFund, now: Date): Promise<number> {
  if (!fund.autoMode || !fund.autoAccountId || fund.isArchived) return 0;
  const months = dueCarryoverMonths(fund.autoLastMonth, now);
  if (months.length === 0) return 0;

  let created = 0;
  const account = await getAccount(db, fund.autoAccountId);
  if (account && !account.isArchived && account.currency === fund.currency) {
    for (const month of months) {
      const start = monthStart(month);
      const next = addMonths(start, 1);
      const leftover = fund.autoMode === 'leftover';
      const net = leftover
        ? await netChangeExcludingCarryover(db, account, addMonths(start, -1), start)
        : 0;
      const taken = leftover
        ? await carryoverTakenFromAccount(db, account.id, start.toISOString(), next.toISOString())
        : 0;
      const amount = carryoverAmount(fund.autoMode, fund.monthlyContribution, net, taken);
      if (amount <= 0) continue;
      const nowIso = now.toISOString();
      const inserted = await insertFundEntryIfAbsent(db, {
        id: carryoverEntryId(fund.id, month),
        fundId: fund.id,
        type: 'deposit',
        amount,
        note: '',
        date: start.toISOString(),
        accountId: account.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (inserted) created += 1;
    }
  }
  await upsertFund(db, { ...fund, autoLastMonth: monthKey(now) });
  return created;
}

/**
 * Moves money from accounts into sinking funds for every 1st of the month that passed since the
 * last run. Entry ids are deterministic so two synced devices never carry over twice.
 */
export async function runFundCarryovers(db: SqlDatabase, now: Date = new Date()): Promise<number> {
  const funds = await listFunds(db, false);
  let created = 0;
  for (const { id, autoMode } of funds) {
    if (!autoMode) continue;
    created += await db.transaction(async (tx) => {
      const fund = await getFund(tx, id);
      return fund ? carryOverFund(tx, fund, now) : 0;
    });
  }
  return created;
}
