import { budgetMonthsSince, depositsAsOutflows, leftoverOf, rolledLimits } from '../carryover';
import { monthPeriodKey } from '../periods';
import { makeFundEntry } from '@/test/factories';

const keys = (periods: ReturnType<typeof budgetMonthsSince>, firstDay = 1) =>
  periods.map((p) => (p.start ? monthPeriodKey(p.start, firstDay) : null));

describe('budgetMonthsSince', () => {
  it('is only the current month without a start month', () => {
    expect(keys(budgetMonthsSince(null, new Date(2026, 10, 21), 1))).toEqual(['2026-11']);
  });

  it('lists every month from the start month, oldest first, across a year boundary', () => {
    expect(keys(budgetMonthsSince('2026-11', new Date(2027, 1, 3), 1))).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('follows a custom first day of the month', () => {
    const months = budgetMonthsSince('2026-10', new Date(2026, 10, 3), 25);
    expect(keys(months, 25)).toEqual(['2026-10']);
    expect(months.at(-1)?.start).toEqual(new Date(2026, 9, 25));
  });

  it('keeps only the most recent months when the gap is very long', () => {
    expect(keys(budgetMonthsSince('2020-01', new Date(2026, 10, 2), 1, 2))).toEqual([
      '2026-10',
      '2026-11',
    ]);
  });
});

describe('leftoverOf', () => {
  it('is what was not spent and never negative', () => {
    expect(leftoverOf(10000, 4000)).toBe(6000);
    expect(leftoverOf(10000, 12000)).toBe(0);
  });
});

describe('rolledLimits', () => {
  it('starts at the base budget', () => {
    expect(rolledLimits(10000, [2500])).toEqual([10000]);
  });

  it('adds each month leftover to the next month', () => {
    expect(rolledLimits(10000, [6000, 9000, 0])).toEqual([10000, 14000, 15000]);
  });

  it('never drops below the base after overspending', () => {
    expect(rolledLimits(10000, [15000, 0])).toEqual([10000, 10000]);
  });

  it('is empty for no months', () => {
    expect(rolledLimits(10000, [])).toEqual([]);
  });
});

describe('depositsAsOutflows', () => {
  it('turns account-backed deposits into outgoing transfers and skips the rest', () => {
    const entries = [
      makeFundEntry({ type: 'deposit', amount: 700, accountId: 'acc' }),
      makeFundEntry({ type: 'deposit', amount: 300, accountId: null }),
      makeFundEntry({ type: 'spend', amount: 100, accountId: 'acc' }),
    ];
    expect(depositsAsOutflows(entries)).toEqual([
      expect.objectContaining({
        type: 'transfer',
        amount: 700,
        accountId: 'acc',
        toAccountId: null,
      }),
    ]);
  });
});
