import {
  carryoverAmount,
  depositsAsOutflows,
  dueCarryoverMonths,
  monthKey,
  monthStart,
} from '../carryover';
import { makeFundEntry } from '@/test/factories';

describe('monthKey / monthStart', () => {
  it('round-trips a month through local midnight on the 1st', () => {
    const start = monthStart('2026-11');
    expect(start).toEqual(new Date(2026, 10, 1));
    expect(monthKey(new Date(2026, 10, 30, 23, 59))).toBe('2026-11');
  });
});

describe('dueCarryoverMonths', () => {
  it('is empty when carryover never started', () => {
    expect(dueCarryoverMonths(null, new Date(2026, 10, 21))).toEqual([]);
  });

  it('is empty during the month that was already processed', () => {
    expect(dueCarryoverMonths('2026-11', new Date(2026, 10, 30))).toEqual([]);
  });

  it('becomes due from the 1st of the next month', () => {
    expect(dueCarryoverMonths('2026-11', new Date(2026, 11, 1, 0, 0, 1))).toEqual(['2026-12']);
  });

  it('catches up every missed month across a year boundary', () => {
    expect(dueCarryoverMonths('2026-11', new Date(2027, 1, 3))).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('keeps only the most recent months when the gap is very long', () => {
    expect(dueCarryoverMonths('2020-01', new Date(2026, 10, 2), 2)).toEqual(['2026-10', '2026-11']);
  });
});

describe('carryoverAmount', () => {
  it('moves the monthly plan in fixed mode regardless of the account', () => {
    expect(carryoverAmount('fixed', 5000, -100, 0)).toBe(5000);
    expect(carryoverAmount('fixed', null, 900, 0)).toBe(0);
  });

  it('moves what is left after other funds in leftover mode', () => {
    expect(carryoverAmount('leftover', null, 12000, 0)).toBe(12000);
    expect(carryoverAmount('leftover', null, 12000, 5000)).toBe(7000);
  });

  it('never moves a negative leftover', () => {
    expect(carryoverAmount('leftover', null, -3000, 0)).toBe(0);
    expect(carryoverAmount('leftover', null, 4000, 5000)).toBe(0);
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
