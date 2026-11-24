import { calendarWeeks, weekdayOrder } from '../calendar';

describe('calendarWeeks', () => {
  it('always shows six full weeks starting on the chosen weekday', () => {
    const weeks = calendarWeeks(new Date(2026, 10, 15), 1);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // November 2026 starts on a Sunday, so a Monday-first grid opens on 26 October.
    expect(weeks[0]?.[0]?.date).toEqual(new Date(2026, 9, 26));
    expect(weeks[0]?.[6]).toEqual(
      expect.objectContaining({ date: new Date(2026, 10, 1), inMonth: true }),
    );
  });

  it('marks days from neighbouring months', () => {
    const days = calendarWeeks(new Date(2026, 10, 1), 0).flat();
    expect(days.filter((d) => d.inMonth)).toHaveLength(30);
    expect(days[0]).toEqual(
      expect.objectContaining({ date: new Date(2026, 10, 1), inMonth: true }),
    );
  });

  it('disables days outside the allowed range, comparing whole days', () => {
    const days = calendarWeeks(
      new Date(2026, 10, 1),
      0,
      new Date(2026, 10, 10, 18),
      new Date(2026, 10, 20, 6),
    ).flat();
    const state = (day: number) => days.find((d) => d.inMonth && d.date.getDate() === day);
    expect(state(9)?.disabled).toBe(true);
    expect(state(10)?.disabled).toBe(false);
    expect(state(20)?.disabled).toBe(false);
    expect(state(21)?.disabled).toBe(true);
  });
});

describe('weekdayOrder', () => {
  it('rotates the week to start on the chosen day', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });
});
