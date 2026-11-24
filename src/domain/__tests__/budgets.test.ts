import { makeTransaction } from '@/test/factories';

import type { Budget } from '../types';
import {
  budgetProgress,
  budgetToEdit,
  budgetStatus,
  monthBudgetSummary,
  newlyReachedThresholds,
  spentForBudget,
} from '../budgets';

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

describe('monthBudgetSummary', () => {
  const item = (categoryId: string | null, currency: string, limit: number, spent: number) => ({
    budget: { categoryId, currency },
    progress: budgetProgress(limit, spent),
  });

  it('prefers the overall budget in the requested currency', () => {
    const summary = monthBudgetSummary(
      [item('food', 'INR', 500, 100), item(null, 'INR', 2000, 900), item(null, 'USD', 10, 1)],
      'INR',
    );
    expect(summary).toEqual({ source: 'overall', progress: budgetProgress(2000, 900) });
  });

  it('adds up category budgets when there is no overall budget', () => {
    const summary = monthBudgetSummary(
      [item('food', 'INR', 500, 600), item('bills', 'INR', 1500, 200)],
      'INR',
    );
    expect(summary).toEqual({ source: 'categories', progress: budgetProgress(2000, 800) });
  });

  it('returns null without budgets in that currency', () => {
    expect(monthBudgetSummary([item(null, 'USD', 10, 1)], 'INR')).toBeNull();
    expect(monthBudgetSummary([], 'INR')).toBeNull();
  });
});

describe('budgetToEdit', () => {
  const budget = (id: string, categoryId: string | null, currency = 'INR'): Budget => ({
    id,
    categoryId,
    currency,
    period: 'monthly',
    amount: 1000,
  });

  it('allows a new budget only when none exists', () => {
    expect(budgetToEdit([], undefined, 'INR')).toBeNull();
  });

  it('opens the existing budget instead of adding a second one', () => {
    const budgets = [budget('food', 'c1'), budget('usd', null, 'USD'), budget('inr', null)];
    expect(budgetToEdit(budgets, undefined, 'INR')?.id).toBe('inr');
    expect(budgetToEdit(budgets.slice(0, 2), undefined, 'INR')?.id).toBe('usd');
    expect(budgetToEdit(budgets.slice(0, 1), undefined, 'INR')?.id).toBe('food');
  });

  it('opens the requested budget by id', () => {
    expect(budgetToEdit([budget('a', null), budget('b', 'c1')], 'b', 'INR')?.id).toBe('b');
    expect(budgetToEdit([budget('a', null)], 'gone', 'INR')).toBeNull();
  });
});
