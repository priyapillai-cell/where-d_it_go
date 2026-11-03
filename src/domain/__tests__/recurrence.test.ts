import { makeRule } from '@/test/factories';

import {
  dueOccurrences,
  nextOccurrence,
  nextReminder,
  occurrenceAt,
  reminderTime,
  transactionFromRule,
} from '../recurrence';

const isoList = (dates: Date[]) => dates.map((d) => d.toISOString());

describe('occurrenceAt', () => {
  it('anchors monthly rules to the start day without drift', () => {
    const rule = makeRule({ startDate: '2026-01-31T09:00:00.000Z', frequency: 'monthly' });
    expect(isoList([0, 1, 2, 3].map((n) => occurrenceAt(rule, n)))).toEqual([
      '2026-01-31T09:00:00.000Z',
      '2026-02-28T09:00:00.000Z',
      '2026-03-31T09:00:00.000Z',
      '2026-04-30T09:00:00.000Z',
    ]);
  });

  it('supports intervals for each frequency', () => {
    const start = '2026-01-01T09:00:00.000Z';
    expect(
      occurrenceAt(
        makeRule({ startDate: start, frequency: 'daily', interval: 3 }),
        2,
      ).toISOString(),
    ).toBe('2026-01-07T09:00:00.000Z');
    expect(
      occurrenceAt(
        makeRule({ startDate: start, frequency: 'weekly', interval: 2 }),
        1,
      ).toISOString(),
    ).toBe('2026-01-15T09:00:00.000Z');
    expect(occurrenceAt(makeRule({ startDate: start, frequency: 'yearly' }), 2).toISOString()).toBe(
      '2028-01-01T09:00:00.000Z',
    );
  });
});

describe('dueOccurrences', () => {
  const now = new Date('2026-04-15T12:00:00.000Z');

  it('returns all past occurrences up to now', () => {
    const rule = makeRule({ startDate: '2026-01-31T09:00:00.000Z' });
    expect(isoList(dueOccurrences(rule, now))).toEqual([
      '2026-01-31T09:00:00.000Z',
      '2026-02-28T09:00:00.000Z',
      '2026-03-31T09:00:00.000Z',
    ]);
  });

  it('is idempotent with respect to the watermark', () => {
    const rule = makeRule({
      startDate: '2026-01-31T09:00:00.000Z',
      lastGeneratedAt: '2026-02-28T09:00:00.000Z',
    });
    expect(isoList(dueOccurrences(rule, now))).toEqual(['2026-03-31T09:00:00.000Z']);
    const caughtUp = { ...rule, lastGeneratedAt: '2026-03-31T09:00:00.000Z' };
    expect(dueOccurrences(caughtUp, now)).toEqual([]);
    expect(dueOccurrences(caughtUp, now)).toEqual([]);
  });

  it('stops at the end date and ignores inactive or future rules', () => {
    const ending = makeRule({
      startDate: '2026-01-31T09:00:00.000Z',
      endDate: '2026-03-01T00:00:00.000Z',
    });
    expect(dueOccurrences(ending, now)).toHaveLength(2);
    expect(dueOccurrences(makeRule({ isActive: false }), now)).toEqual([]);
    expect(dueOccurrences(makeRule({ startDate: '2027-01-01T00:00:00.000Z' }), now)).toEqual([]);
  });

  it('caps runaway rules and survives malformed dates', () => {
    const daily = makeRule({ startDate: '2000-01-01T00:00:00.000Z', frequency: 'daily' });
    expect(dueOccurrences(daily, now, 50)).toHaveLength(50);
    expect(dueOccurrences(makeRule({ startDate: 'not a date' }), now)).toEqual([]);
    expect(
      dueOccurrences(
        makeRule({ interval: 0, frequency: 'daily', startDate: '2026-04-13T00:00:00.000Z' }),
        now,
      ),
    ).toHaveLength(3);
  });
});

describe('nextOccurrence and reminders', () => {
  it('finds the next occurrence strictly after a date', () => {
    const rule = makeRule({ startDate: '2026-01-31T09:00:00.000Z' });
    expect(nextOccurrence(rule, new Date('2026-03-31T09:00:00.000Z'))?.toISOString()).toBe(
      '2026-04-30T09:00:00.000Z',
    );
    expect(
      nextOccurrence(
        { ...rule, endDate: '2026-02-01T00:00:00.000Z' },
        new Date('2026-02-01T00:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('schedules reminders N days before at 09:00 local', () => {
    expect(reminderTime(new Date('2026-05-10T18:00:00.000Z'), 2).toISOString()).toBe(
      '2026-05-08T09:00:00.000Z',
    );
  });
});

describe('nextReminder', () => {
  const rule = makeRule({
    frequency: 'weekly',
    startDate: '2026-03-02T15:00:00.000Z',
    reminderDaysBefore: 1,
  });

  it('picks the upcoming occurrence when its reminder is still ahead', () => {
    const next = nextReminder(rule, new Date('2026-03-05T00:00:00.000Z'));
    expect(next?.occurrence.toISOString()).toBe('2026-03-09T15:00:00.000Z');
    expect(next?.at.toISOString()).toBe('2026-03-08T09:00:00.000Z');
  });

  it('skips to the following occurrence when the reminder time already passed', () => {
    const next = nextReminder(rule, new Date('2026-03-08T10:00:00.000Z'));
    expect(next?.occurrence.toISOString()).toBe('2026-03-16T15:00:00.000Z');
  });

  it('returns null without a reminder, when paused or after the end', () => {
    const now = new Date('2026-03-05T00:00:00.000Z');
    expect(nextReminder({ ...rule, reminderDaysBefore: null }, now)).toBeNull();
    expect(nextReminder({ ...rule, isActive: false }, now)).toBeNull();
    expect(nextReminder({ ...rule, endDate: '2026-03-03T00:00:00.000Z' }, now)).toBeNull();
  });
});

it('builds transactions with a deterministic occurrence key', () => {
  const rule = makeRule({ id: 'rule-x', categoryId: 'rent', accountId: 'acc-1' });
  const date = new Date('2026-02-28T09:00:00.000Z');
  const tx = transactionFromRule(rule, date, 'tx-1', '2026-04-15T12:00:00.000Z');
  expect(tx).toMatchObject({
    id: 'tx-1',
    type: 'expense',
    amount: 120000,
    accountId: 'acc-1',
    categoryId: 'rent',
    recurringRuleId: 'rule-x',
    occurrenceKey: '2026-02-28T09:00:00.000Z',
    date: '2026-02-28T09:00:00.000Z',
  });
});
