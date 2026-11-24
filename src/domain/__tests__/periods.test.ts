import {
  customPeriod,
  isInPeriod,
  monthPeriodKey,
  periodContaining,
  shiftPeriod,
} from '../periods';

const opts = { firstDayOfWeek: 1 as const, firstDayOfMonth: 1 };
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('periodContaining', () => {
  const anchor = new Date(2026, 10, 4, 15, 30); // Wed 4 Nov 2026

  it('computes day, week, month and year bounds', () => {
    expect(iso(periodContaining('day', anchor, opts).start)).toBe('2026-11-04T00:00:00.000Z');
    const week = periodContaining('week', anchor, opts);
    expect(iso(week.start)).toBe('2026-11-02T00:00:00.000Z');
    expect(iso(week.end)).toBe('2026-11-09T00:00:00.000Z');
    const month = periodContaining('month', anchor, opts);
    expect(iso(month.start)).toBe('2026-11-01T00:00:00.000Z');
    expect(iso(month.end)).toBe('2026-12-01T00:00:00.000Z');
    expect(iso(periodContaining('year', anchor, opts).start)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('respects the first day of the week', () => {
    const sundayWeek = periodContaining('week', anchor, { ...opts, firstDayOfWeek: 0 });
    expect(iso(sundayWeek.start)).toBe('2026-11-01T00:00:00.000Z');
  });

  it('supports months starting on a custom day', () => {
    const early = periodContaining('month', new Date(2026, 10, 10), {
      ...opts,
      firstDayOfMonth: 15,
    });
    expect(iso(early.start)).toBe('2026-10-15T00:00:00.000Z');
    expect(iso(early.end)).toBe('2026-11-15T00:00:00.000Z');
    const late = periodContaining('month', new Date(2026, 10, 20), {
      ...opts,
      firstDayOfMonth: 15,
    });
    expect(iso(late.start)).toBe('2026-11-15T00:00:00.000Z');
  });

  it('returns unbounded for all time', () => {
    const all = periodContaining('all', anchor, opts);
    expect(all.start).toBeNull();
    expect(isInPeriod(new Date(1990, 0, 1), all)).toBe(true);
  });
});

describe('shiftPeriod', () => {
  it('moves months across year boundaries', () => {
    const dec = periodContaining('month', new Date(2026, 11, 5), opts);
    expect(iso(shiftPeriod(dec, 1, opts).start)).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(shiftPeriod(dec, -1, opts).start)).toBe('2026-11-01T00:00:00.000Z');
  });

  it('moves custom ranges by their length', () => {
    const range = customPeriod(new Date(2026, 0, 10), new Date(2026, 0, 16));
    const next = shiftPeriod(range, 1, opts);
    expect(iso(next.start)).toBe('2026-01-17T00:00:00.000Z');
    expect(iso(next.end)).toBe('2026-01-24T00:00:00.000Z');
  });
});

describe('isInPeriod and keys', () => {
  it('treats the end bound as exclusive', () => {
    const day = periodContaining('day', new Date(2026, 4, 1), opts);
    expect(isInPeriod(new Date(2026, 4, 1, 23, 59), day)).toBe(true);
    expect(isInPeriod(new Date(2026, 4, 2), day)).toBe(false);
  });

  it('normalises reversed custom ranges', () => {
    const range = customPeriod(new Date(2026, 0, 16), new Date(2026, 0, 10));
    expect(iso(range.start)).toBe('2026-01-10T00:00:00.000Z');
  });

  it('builds month keys with offsets', () => {
    expect(monthPeriodKey(new Date(2026, 0, 3), 5)).toBe('2025-12');
    expect(monthPeriodKey(new Date(2026, 0, 5), 5)).toBe('2026-01');
  });
});
