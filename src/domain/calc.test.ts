import { describe, expect, it } from 'vitest';
import {
  splitAtMidnight,
  buildInterval, findOverlaps, formatDecimalHours, formatHM, formatHoursWords, rateOn, totals, wage, withRate,
} from './calc';
import type { Shift } from './types';

const shift = (id: string, start: number, end: number | null, rate = 40): Shift => ({
  id, start, end, rate, employerId: 'e', createdAt: 0, updatedAt: 0, deleted: false,
});

describe('midnight crossing', () => {
  it('22:30 -> 03:15 is 4:45 / 4.75h', () => {
    const { start, end } = buildInterval('2026-11-20', '22:30', '03:15');
    expect(formatHM(end - start)).toBe('4:45');
    expect(formatDecimalHours(end - start)).toBe('4.75');
    expect(new Date(end).getDate()).toBe(21);
  });
  it('same day', () => {
    const { start, end } = buildInterval('2026-11-20', '08:00', '15:30');
    expect(formatHM(end - start)).toBe('7:30');
    expect(formatHoursWords(end - start)).toBe('7 שעות ו־30 דקות');
  });
});

describe('wage', () => {
  it('7.5h at 45 = 337.50', () => {
    const { start, end } = buildInterval('2026-11-20', '08:00', '15:30');
    expect(wage({ start, end, rate: 45 })).toBeCloseTo(337.5);
  });
  it('totals skip open and deleted shifts', () => {
    const a = buildInterval('2026-11-20', '08:00', '16:00');
    const t = totals([
      shift('1', a.start, a.end, 45),
      shift('2', a.start, null),
      { ...shift('3', a.start, a.end), deleted: true },
    ]);
    expect(t.count).toBe(1);
    expect(t.wage).toBeCloseTo(360);
  });
});

describe('historical rates', () => {
  const rates = withRate([{ from: '1970-01-01', rate: 40 }], '2026-11-15', 45);
  it('applies rate by date', () => {
    expect(rateOn({ rates }, '2026-11-10')).toBe(40);
    expect(rateOn({ rates }, '2026-11-15')).toBe(45);
    expect(rateOn({ rates }, '2026-11-20')).toBe(45);
  });
});

describe('overlaps', () => {
  it('detects 10-15 vs 14-18', () => {
    const a = buildInterval('2026-11-20', '10:00', '15:00');
    const b = buildInterval('2026-11-20', '14:00', '18:00');
    expect(findOverlaps({ start: b.start, end: b.end }, [shift('a', a.start, a.end)])).toHaveLength(1);
  });
  it('adjacent shifts do not overlap; self is ignored', () => {
    const a = buildInterval('2026-11-20', '10:00', '15:00');
    const b = buildInterval('2026-11-20', '15:00', '18:00');
    expect(findOverlaps({ start: b.start, end: b.end }, [shift('a', a.start, a.end)])).toHaveLength(0);
    expect(findOverlaps({ id: 'a', ...a }, [shift('a', a.start, a.end)])).toHaveLength(0);
  });
});

describe('split at midnight', () => {
  it('22:30 -> 03:15 becomes 1:30 + 3:15', () => {
    const { start, end } = buildInterval('2026-11-18', '22:30', '03:15');
    const parts = splitAtMidnight(start, end);
    expect(parts.map((p) => formatHM(p.end - p.start))).toEqual(['1:30', '3:15']);
    expect(new Date(parts[1].start).getHours()).toBe(0);
  });
  it('ending exactly at midnight stays one piece', () => {
    const { start, end } = buildInterval('2026-11-18', '20:00', '00:00');
    expect(splitAtMidnight(start, end)).toHaveLength(1);
  });
  it('same-day interval is untouched', () => {
    const { start, end } = buildInterval('2026-11-18', '08:00', '16:00');
    expect(splitAtMidnight(start, end)).toEqual([{ start, end }]);
  });
});
