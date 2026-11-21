import { accountFlows, insertAccount } from '@/db/repositories/accountRepository';
import { getFund, listFundEntries, upsertFund } from '@/db/repositories/fundRepository';
import { insertTransaction } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { computeBalance } from '@/domain/balance';
import type { SinkingFund } from '@/domain/types';
import { makeAccount, makeFund, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import { carryoverEntryId, runFundCarryovers } from '../carryoverService';
import { type FundInput, saveFund } from '../fundService';

let db: SqlDatabase;
const account = makeAccount({ id: 'main', currency: 'INR', initialBalance: 100000 });

const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour);

async function addTx(type: 'income' | 'expense', amount: number, date: Date, accountId = 'main') {
  await insertTransaction(
    db,
    makeTransaction({ type, amount, accountId, date: date.toISOString(), categoryId: null }),
  );
}

async function addFund(overrides: Partial<SinkingFund>): Promise<SinkingFund> {
  const fund = makeFund({
    currency: 'INR',
    autoAccountId: 'main',
    autoLastMonth: '2026-10',
    ...overrides,
  });
  await upsertFund(db, fund);
  return fund;
}

async function balanceOf(accountId: string) {
  const flows = await accountFlows(db);
  return computeBalance(account, flows.get(accountId));
}

beforeEach(async () => {
  db = await createTestDatabase();
  await insertAccount(db, account);
});

afterEach(async () => {
  await db.close();
});

describe('runFundCarryovers', () => {
  it('moves the fixed amount on the 1st and reduces the account balance', async () => {
    const fund = await addFund({ autoMode: 'fixed', monthlyContribution: 5000 });

    expect(await runFundCarryovers(db, at(10, 31))).toBe(0);
    expect(await runFundCarryovers(db, at(11, 1, 0))).toBe(1);

    const entries = await listFundEntries(db, fund.id);
    expect(entries).toEqual([
      expect.objectContaining({
        id: carryoverEntryId(fund.id, '2026-11'),
        type: 'deposit',
        amount: 5000,
        accountId: 'main',
        date: new Date(2026, 10, 1).toISOString(),
      }),
    ]);
    expect(await balanceOf('main')).toBe(95000);
    expect((await getFund(db, fund.id))?.autoLastMonth).toBe('2026-11');
  });

  it('runs only once per month', async () => {
    const fund = await addFund({ autoMode: 'fixed', monthlyContribution: 5000 });
    await runFundCarryovers(db, at(11, 1));
    expect(await runFundCarryovers(db, at(11, 20))).toBe(0);
    expect(await listFundEntries(db, fund.id)).toHaveLength(1);
  });

  it('never duplicates a month even when the schedule is replayed (another device)', async () => {
    const fund = await addFund({ autoMode: 'fixed', monthlyContribution: 5000 });
    await runFundCarryovers(db, at(11, 1));
    await upsertFund(db, { ...(await getFund(db, fund.id))!, autoLastMonth: '2026-10' });
    expect(await runFundCarryovers(db, at(11, 2))).toBe(0);
    expect(await listFundEntries(db, fund.id)).toHaveLength(1);
  });

  it('catches up months missed while the app was closed', async () => {
    const fund = await addFund({ autoMode: 'fixed', monthlyContribution: 1000 });
    expect(await runFundCarryovers(db, new Date(2027, 1, 5))).toBe(4);
    const months = (await listFundEntries(db, fund.id)).map((e) => e.date).sort();
    expect(months).toEqual(
      [
        new Date(2026, 10, 1),
        new Date(2026, 11, 1),
        new Date(2027, 0, 1),
        new Date(2027, 1, 1),
      ].map((d) => d.toISOString()),
    );
  });

  it("moves the previous month's leftover, not the whole balance", async () => {
    const fund = await addFund({ autoMode: 'leftover' });
    await addTx('income', 50000, at(10, 3));
    await addTx('expense', 20000, at(10, 18));
    await addTx('expense', 7000, at(9, 10));

    await runFundCarryovers(db, at(11, 1));

    const [entry] = await listFundEntries(db, fund.id);
    expect(entry?.amount).toBe(30000);
    expect(await balanceOf('main')).toBe(100000 + 50000 - 20000 - 7000 - 30000);
  });

  it('skips the month when spending exceeded income', async () => {
    const fund = await addFund({ autoMode: 'leftover' });
    await addTx('income', 1000, at(10, 3));
    await addTx('expense', 4000, at(10, 4));
    expect(await runFundCarryovers(db, at(11, 1))).toBe(0);
    expect(await listFundEntries(db, fund.id)).toHaveLength(0);
    expect((await getFund(db, fund.id))?.autoLastMonth).toBe('2026-11');
  });

  it("does not count last month's carryover against this month's leftover", async () => {
    const fund = await addFund({ autoMode: 'leftover', autoLastMonth: '2026-09' });
    await addTx('income', 10000, at(9, 5));
    await addTx('income', 8000, at(10, 5));

    await runFundCarryovers(db, at(11, 1));

    const amounts = (await listFundEntries(db, fund.id)).map((e) => e.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([8000, 10000]);
  });

  it('shares one leftover between funds without moving it twice', async () => {
    const fixed = await addFund({ autoMode: 'fixed', monthlyContribution: 3000, sortOrder: 0 });
    const leftover = await addFund({ autoMode: 'leftover', sortOrder: 1 });
    await addTx('income', 10000, at(10, 2));

    await runFundCarryovers(db, at(11, 1));

    expect((await listFundEntries(db, fixed.id))[0]?.amount).toBe(3000);
    expect((await listFundEntries(db, leftover.id))[0]?.amount).toBe(7000);
  });

  it('skips archived funds and accounts in another currency', async () => {
    const archived = await addFund({
      autoMode: 'fixed',
      monthlyContribution: 100,
      isArchived: true,
    });
    await insertAccount(db, makeAccount({ id: 'usd', currency: 'USD' }));
    const mismatched = await addFund({
      autoMode: 'fixed',
      monthlyContribution: 100,
      autoAccountId: 'usd',
    });

    expect(await runFundCarryovers(db, at(11, 1))).toBe(0);
    expect(await listFundEntries(db, archived.id)).toHaveLength(0);
    expect(await listFundEntries(db, mismatched.id)).toHaveLength(0);
  });

  it('keeps carried money in the fund when the source account is deleted', async () => {
    const fund = await addFund({ autoMode: 'fixed', monthlyContribution: 5000 });
    await runFundCarryovers(db, at(11, 1));
    await db.run('DELETE FROM accounts WHERE id = ?', ['main']);

    const [entry] = await listFundEntries(db, fund.id);
    expect(entry).toEqual(expect.objectContaining({ amount: 5000, accountId: null }));
    expect((await getFund(db, fund.id))?.autoAccountId).toBeNull();
  });
});

describe('saveFund carryover settings', () => {
  const base: FundInput = {
    name: 'Gifts',
    icon: 'gift-outline',
    color: '#D81B60',
    currency: 'INR',
    targetAmount: null,
    targetDate: null,
    monthlyContribution: 2000,
  };
  const now = at(11, 21);

  it('starts the schedule so the first carryover happens next month', async () => {
    const result = await saveFund(
      db,
      { ...base, autoMode: 'fixed', autoAccountId: 'main' },
      undefined,
      now,
    );
    expect(result.ok && result.value).toEqual(
      expect.objectContaining({
        autoMode: 'fixed',
        autoAccountId: 'main',
        autoLastMonth: '2026-11',
      }),
    );
  });

  it('keeps the schedule when other details change', async () => {
    const created = await saveFund(
      db,
      { ...base, autoMode: 'fixed', autoAccountId: 'main' },
      undefined,
      now,
    );
    if (!created.ok) throw new Error('save failed');
    const saved = await saveFund(
      db,
      { ...base, name: 'Birthdays', autoMode: 'leftover', autoAccountId: 'main' },
      created.value.id,
      at(12, 15),
    );
    expect(saved.ok && saved.value.autoLastMonth).toBe('2026-11');
  });

  it('clears carryover when turned off', async () => {
    const created = await saveFund(
      db,
      { ...base, autoMode: 'fixed', autoAccountId: 'main' },
      undefined,
      now,
    );
    if (!created.ok) throw new Error('save failed');
    const saved = await saveFund(db, { ...base, autoMode: null }, created.value.id, now);
    expect(saved.ok && saved.value).toEqual(
      expect.objectContaining({ autoMode: null, autoAccountId: null, autoLastMonth: null }),
    );
  });

  it('requires an account, a matching currency and a monthly amount for fixed mode', async () => {
    await insertAccount(db, makeAccount({ id: 'usd', currency: 'USD' }));
    const noAccount = await saveFund(db, { ...base, autoMode: 'leftover' }, undefined, now);
    expect(!noAccount.ok && noAccount.error.autoAccount).toBe('missingAccount');

    const otherCurrency = await saveFund(
      db,
      { ...base, autoMode: 'leftover', autoAccountId: 'usd' },
      undefined,
      now,
    );
    expect(!otherCurrency.ok && otherCurrency.error.autoAccount).toBe('currencyMismatch');

    const noAmount = await saveFund(
      db,
      { ...base, monthlyContribution: null, autoMode: 'fixed', autoAccountId: 'main' },
      undefined,
      now,
    );
    expect(!noAmount.ok && noAmount.error.monthlyContribution).toBe('required');
  });
});
