import { makeFundEntry } from '@/test/factories';

import {
  fundTotalsByCurrency,
  monthsUntil,
  parseCalendarDay,
  summarizeFund,
  toCalendarDay,
} from '../sinkingFunds';
import { validateFundDraft, validateFundEntryDraft } from '../validation';

const NOW = new Date(2026, 10, 21, 13, 0);

const noGoal = { targetAmount: null, targetDate: null, monthlyContribution: null };

describe('calendar days', () => {
  it('parses only real YYYY-MM-DD days', () => {
    expect(parseCalendarDay('2027-03-15')).toEqual(new Date(2027, 2, 15));
    expect(parseCalendarDay('2027-02-30')).toBeNull();
    expect(parseCalendarDay('15/03/2027')).toBeNull();
    expect(toCalendarDay(new Date(2027, 0, 5))).toBe('2027-01-05');
  });

  it('counts the current month towards the months left', () => {
    expect(monthsUntil(NOW, new Date(2026, 10, 30))).toBe(1);
    expect(monthsUntil(NOW, new Date(2026, 11, 1))).toBe(2);
    expect(monthsUntil(NOW, new Date(2027, 2, 15))).toBe(5);
    expect(monthsUntil(NOW, new Date(2025, 0, 1))).toBe(1);
  });
});

describe('summarizeFund', () => {
  const entries = [
    makeFundEntry({ type: 'deposit', amount: 30000, date: '2026-10-05T10:00:00.000Z' }),
    makeFundEntry({ type: 'deposit', amount: 20000, date: '2026-11-02T10:00:00.000Z' }),
    makeFundEntry({ type: 'spend', amount: 5000, date: '2026-11-10T10:00:00.000Z' }),
  ];

  it('adds deposits, subtracts spending and tracks this month', () => {
    const summary = summarizeFund(noGoal, entries, NOW);
    expect(summary).toMatchObject({
      deposited: 50000,
      spent: 5000,
      balance: 45000,
      depositedThisMonth: 20000,
      progress: null,
      remaining: null,
      neededPerMonth: null,
      status: 'noTarget',
    });
  });

  it('works out the monthly amount needed to hit a dated target', () => {
    const summary = summarizeFund(
      { targetAmount: 100000, targetDate: '2027-03-15', monthlyContribution: 12000 },
      entries,
      NOW,
    );
    expect(summary.remaining).toBe(55000);
    expect(summary.progress).toBeCloseTo(0.45);
    expect(summary.monthsLeft).toBe(5);
    expect(summary.neededPerMonth).toBe(11000);
    expect(summary.status).toBe('onTrack');
  });

  it('flags a plan that falls short, an overdue target and a reached goal', () => {
    const dated = { targetAmount: 100000, targetDate: '2027-03-15' };
    expect(summarizeFund({ ...dated, monthlyContribution: 5000 }, entries, NOW).status).toBe(
      'behind',
    );
    expect(summarizeFund({ ...dated, monthlyContribution: null }, entries, NOW).status).toBe(
      'inProgress',
    );
    const overdue = summarizeFund(
      { targetAmount: 100000, targetDate: '2026-11-01', monthlyContribution: null },
      entries,
      NOW,
    );
    expect(overdue).toMatchObject({ status: 'overdue', neededPerMonth: 55000, monthsLeft: 0 });
    const reached = summarizeFund(
      { targetAmount: 40000, targetDate: '2026-11-01', monthlyContribution: null },
      entries,
      NOW,
    );
    expect(reached).toMatchObject({ status: 'reached', remaining: 0, progress: 1 });
  });

  it('never reports negative progress when more was spent than saved', () => {
    const summary = summarizeFund(
      { targetAmount: 10000, targetDate: null, monthlyContribution: null },
      [makeFundEntry({ type: 'spend', amount: 3000 })],
      NOW,
    );
    expect(summary).toMatchObject({ balance: -3000, progress: 0, remaining: 13000 });
  });
});

it('totals active fund balances per currency', () => {
  const funds = [
    { id: 'a', currency: 'USD', isArchived: false },
    { id: 'b', currency: 'INR', isArchived: false },
    { id: 'c', currency: 'USD', isArchived: false },
    { id: 'd', currency: 'USD', isArchived: true },
  ];
  const balances = new Map([
    ['a', 100],
    ['b', 500],
    ['c', 50],
    ['d', 999],
  ]);
  expect(fundTotalsByCurrency(funds, balances)).toEqual([
    { currency: 'INR', balance: 500 },
    { currency: 'USD', balance: 150 },
  ]);
});

describe('fund validation', () => {
  it('requires a name and valid optional goal fields', () => {
    expect(
      validateFundDraft({
        name: ' ',
        currency: 'XXX1',
        targetAmount: 0,
        targetDate: '2027-13-45',
        monthlyContribution: -1,
      }),
    ).toEqual({
      name: 'required',
      currency: 'invalidCurrency',
      targetAmount: 'amountPositive',
      targetDate: 'invalidDate',
      monthlyContribution: 'amountPositive',
    });
    expect(
      Object.values(
        validateFundDraft({
          name: 'Gifts',
          currency: 'INR',
          targetAmount: null,
          targetDate: null,
          monthlyContribution: null,
        }),
      ).filter(Boolean),
    ).toEqual([]);
  });

  it('validates entry amounts and dates', () => {
    expect(validateFundEntryDraft({ amount: 0, note: '', date: 'nope' })).toEqual({
      amount: 'amountPositive',
      note: undefined,
      date: 'invalidDate',
    });
  });
});
