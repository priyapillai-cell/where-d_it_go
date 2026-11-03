import { makeAccount, makeTransaction } from '@/test/factories';

import {
  computeBalance,
  computeBalances,
  flowsFromTransactions,
  netChangeForAccounts,
  totalsByCurrency,
} from '../balance';

describe('balance calculation', () => {
  const cash = makeAccount({ id: 'cash', initialBalance: 10000 });
  const bank = makeAccount({ id: 'bank', initialBalance: 50000 });
  const euro = makeAccount({ id: 'euro', currency: 'EUR', initialBalance: 0 });

  const transactions = [
    makeTransaction({ type: 'income', amount: 20000, accountId: 'cash' }),
    makeTransaction({ type: 'expense', amount: 3500, accountId: 'cash' }),
    makeTransaction({
      type: 'transfer',
      amount: 5000,
      toAmount: 5000,
      accountId: 'cash',
      toAccountId: 'bank',
    }),
    makeTransaction({
      type: 'transfer',
      amount: 10000,
      toAmount: 9200,
      accountId: 'bank',
      toAccountId: 'euro',
    }),
  ];

  it('is initialBalance + income − expenses ± transfers', () => {
    const flows = flowsFromTransactions(transactions);
    expect(computeBalance(cash, flows.get('cash'))).toBe(10000 + 20000 - 3500 - 5000);
    expect(computeBalance(bank, flows.get('bank'))).toBe(50000 + 5000 - 10000);
    expect(computeBalance(euro, flows.get('euro'))).toBe(9200);
  });

  it('falls back to the initial balance for accounts without activity', () => {
    expect(computeBalance(makeAccount({ initialBalance: 777 }))).toBe(777);
  });

  it('uses amount for transfers without toAmount', () => {
    const flows = flowsFromTransactions([
      makeTransaction({
        type: 'transfer',
        amount: 100,
        toAmount: null,
        accountId: 'cash',
        toAccountId: 'bank',
      }),
    ]);
    expect(flows.get('bank')?.transferIn).toBe(100);
  });

  it('totals per currency and skips excluded or archived accounts', () => {
    const hidden = makeAccount({ id: 'hidden', initialBalance: 999, includeInTotal: false });
    const archived = makeAccount({ id: 'archived', initialBalance: 999, isArchived: true });
    const accounts = [cash, bank, euro, hidden, archived];
    const balances = computeBalances(accounts, flowsFromTransactions(transactions));
    expect(totalsByCurrency(accounts, balances, 'EUR')).toEqual([
      { currency: 'EUR', total: 9200 },
      { currency: 'USD', total: 21500 + 45000 },
    ]);
  });

  it('computes net change for a set of accounts', () => {
    const transfer = makeTransaction({
      type: 'transfer',
      amount: 500,
      toAmount: 500,
      accountId: 'cash',
      toAccountId: 'bank',
    });
    expect(netChangeForAccounts(transfer, new Set(['cash', 'bank']))).toBe(0);
    expect(netChangeForAccounts(transfer, new Set(['cash']))).toBe(-500);
    expect(netChangeForAccounts(transfer, new Set(['bank']))).toBe(500);
  });
});
