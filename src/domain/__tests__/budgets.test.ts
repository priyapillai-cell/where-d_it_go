import { makeTransaction } from '@/test/factories';

import { budgetProgress, budgetStatus, newlyReachedThresholds, spentForBudget } from '../budgets';

it('maps ratios to status bands', () => {
  expect(budgetStatus(0.79)).toBe('ok');
  expect(budgetStatus(0.8)).toBe('warning');
  expect(budgetStatus(1)).toBe('warning');
  expect(budgetStatus(1.01)).toBe('over');
});

it('computes progress and remaining', () => {
  expect(budgetProgress(10000, 8500)).toEqual({
    spent: 8500,
    limit: 10000,
    remaining: 1500,
    ratio: 0.85,
    status: 'warning',
  });
});

it('counts only matching expenses in the budget currency', () => {
  const currency = new Map([
    ['usd', 'USD'],
    ['eur', 'EUR'],
  ]);
  const txs = [
    makeTransaction({ amount: 100, categoryId: 'food', accountId: 'usd' }),
    makeTransaction({ amount: 200, categoryId: 'fun', accountId: 'usd' }),
    makeTransaction({ amount: 400, categoryId: 'food', accountId: 'eur' }),
    makeTransaction({ type: 'income', amount: 800, categoryId: 'food', accountId: 'usd' }),
  ];
  expect(spentForBudget({ categoryId: null, currency: 'USD' }, txs, currency)).toBe(300);
  expect(spentForBudget({ categoryId: 'food', currency: 'USD' }, txs, currency)).toBe(100);
});

it('reports thresholds once', () => {
  expect(newlyReachedThresholds(0.5, [])).toEqual([]);
  expect(newlyReachedThresholds(0.8, [])).toEqual([80]);
  expect(newlyReachedThresholds(1.2, [80])).toEqual([100]);
  expect(newlyReachedThresholds(1.2, [80, 100])).toEqual([]);
});
