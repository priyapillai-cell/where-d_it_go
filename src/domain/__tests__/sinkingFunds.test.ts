import { makeFundEntry } from '@/test/factories';

import {
  fundMonthlyHistory,
  fundTotalsByCurrency,
  monthsUntil,
  parseCalendarDay,
  summarizeFund,
  toCalendarDay,
  totalsByFund,
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

describe('fundMonthlyHistory', () => {
  const at = (month: number, date = 10) => new Date(2026, month, date, 12).toISOString();

  it('lists the last six calendar months, oldest first', () => {
    const history = fundMonthlyHistory([], NOW);
    expect(history.map((m) => m.start)).toEqual([
      new Date(2026, 5, 1),
      new Date(2026, 6, 1),
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 9, 1),
      new Date(2026, 10, 1),
    ]);
    expect(history.every((m) => m.added === 0 && m.spent === 0 && m.balance === 0)).toBe(true);
  });

  it('adds and spends per month with a running balance that includes older entries', () => {
    const history = fundMonthlyHistory(
      [
        makeFundEntry({ type: 'deposit', amount: 5000, date: at(0) }),
        makeFundEntry({ type: 'deposit', amount: 2000, date: at(9) }),
        makeFundEntry({ type: 'spend', amount: 1500, date: at(9, 20) }),
        makeFundEntry({ type: 'deposit', amount: 1000, date: at(10) }),
      ],
      NOW,
      3,
    );
    expect(history.map(({ added, spent, balance }) => ({ added, spent, balance }))).toEqual([
      { added: 0, spent: 0, balance: 5000 },
      { added: 2000, spent: 1500, balance: 5500 },
      { added: 1000, spent: 0, balance: 6500 },
    ]);
  });
});

describe('totalsByFund', () => {
  it('sums one entry type per fund inside the range', () => {
    const entries = [
      makeFundEntry({ fundId: 'a', type: 'spend', amount: 300, date: '2026-11-05T12:00:00.000Z' }),
      makeFundEntry({ fundId: 'a', type: 'spend', amount: 200, date: '2026-11-06T12:00:00.000Z' }),
      makeFundEntry({ fundId: 'b', type: 'spend', amount: 50, date: '2026-11-07T12:00:00.000Z' }),
      makeFundEntry({
        fundId: 'a',
        type: 'deposit',
        amount: 900,
        date: '2026-11-07T12:00:00.000Z',
      }),
      makeFundEntry({ fundId: 'a', type: 'spend', amount: 999, date: '2026-12-01T00:00:00.000Z' }),
    ];
    const totals = totalsByFund(
      entries,
      'spend',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-12-01T00:00:00.000Z'),
    );
    expect(Object.fromEntries(totals)).toEqual({ a: 500, b: 50 });
  });
});
