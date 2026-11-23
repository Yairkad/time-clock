import type { Employer, Period, RateEntry, Shift } from './types';

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export function toDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as HH:MM. */
export function toTimeStr(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** DD/MM/YY */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

export function dateKeyToDisplay(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** Build epoch ms from a local date key and HH:MM. */
export function combine(dateKey: string, time: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/**
 * Build a shift interval from a date and two clock times.
 * If the end time is not after the start time, the shift crosses midnight.
 */
export function buildInterval(dateKey: string, startTime: string, endTime: string): { start: number; end: number } {
  const start = combine(dateKey, startTime);
  let end = combine(dateKey, endTime);
  if (end <= start) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    end = combine(toDateKey(next.getTime()), endTime);
  }
  return { start, end };
}

/** Local midnight that starts the day after `ms`. */
export function nextMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Splits an interval at local midnights into one piece per calendar day. */
export function splitAtMidnight(start: number, end: number): { start: number; end: number }[] {
  const parts: { start: number; end: number }[] = [];
  let s = start;
  while (s < end) {
    const e = Math.min(end, nextMidnight(s));
    parts.push({ start: s, end: e });
    s = e;
  }
  return parts;
}

export function durationMs(shift: Pick<Shift, 'start' | 'end'>, now = Date.now()): number {
  return Math.max(0, (shift.end ?? now) - shift.start);
}

export function msToHours(ms: number): number {
  return ms / MS_HOUR;
}

/** H:MM (hours may exceed 24). Rounded down to whole minutes. */
export function formatHM(ms: number): string {
  const totalMin = Math.floor(ms / MS_MIN);
  return `${Math.floor(totalMin / 60)}:${pad(totalMin % 60)}`;
}

/** HH:MM:SS for the live timer. */
export function formatHMS(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Decimal hours based on whole minutes, e.g. 4:45 -> "4.75". */
export function formatDecimalHours(ms: number): string {
  const minutes = Math.floor(ms / MS_MIN);
  return (minutes / 60).toFixed(2);
}

/** "4 שעות ו־45 דקות" */
export function formatHoursWords(ms: number): string {
  const totalMin = Math.floor(ms / MS_MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} דקות`;
  if (m === 0) return `${h} שעות`;
  return `${h} שעות ו־${m} דקות`;
}

export function wage(shift: Pick<Shift, 'start' | 'end' | 'rate'>, now = Date.now()): number {
  return msToHours(durationMs(shift, now)) * shift.rate;
}

const currency = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 });
export function formatMoney(n: number): string {
  return currency.format(Math.round(n * 100) / 100);
}

export function sortRates(rates: RateEntry[]): RateEntry[] {
  return [...rates].sort((a, b) => a.from.localeCompare(b.from));
}

/** The rate in effect on a given date (falls back to the earliest rate). */
export function rateOn(employer: Pick<Employer, 'rates'>, dateKey: string): number {
  const rates = sortRates(employer.rates);
  if (rates.length === 0) return 0;
  let current = rates[0].rate;
  for (const r of rates) {
    if (r.from <= dateKey) current = r.rate;
    else break;
  }
  return current;
}

export function currentRate(employer: Pick<Employer, 'rates'>): number {
  return rateOn(employer, toDateKey(Date.now()));
}

/** Set a rate effective from `from`, replacing an entry on the same date. */
export function withRate(rates: RateEntry[], from: string, rate: number): RateEntry[] {
  return sortRates([...rates.filter((r) => r.from !== from), { from, rate }]);
}

/** Shifts (not deleted, not `self`) whose interval intersects the given one. Open shifts extend to `now`. */
export function findOverlaps(
  interval: { id?: string; start: number; end: number | null },
  shifts: Shift[],
  now = Date.now(),
): Shift[] {
  const aStart = interval.start;
  const aEnd = interval.end ?? now;
  return shifts.filter((s) => {
    if (s.deleted || s.id === interval.id) return false;
    const bEnd = s.end ?? now;
    return aStart < bEnd && s.start < aEnd;
  });
}

export function inPeriod(shift: Shift, period: Period): boolean {
  const key = toDateKey(shift.start);
  return key >= period.from && key <= period.to;
}

export interface Totals {
  count: number;
  /** Distinct work days (by start date). */
  days: number;
  ms: number;
  wage: number;
}

/** Totals over closed shifts only. */
export function totals(shifts: Shift[]): Totals {
  let ms = 0;
  let w = 0;
  let count = 0;
  const days = new Set<string>();
  for (const s of shifts) {
    if (s.deleted || s.end === null) continue;
    count++;
    days.add(toDateKey(s.start));
    ms += durationMs(s);
    w += wage(s);
  }
  return { count, days: days.size, ms, wage: w };
}

export function monthPeriod(year: number, month0: number): Period {
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  return { from: toDateKey(first.getTime()), to: toDateKey(last.getTime()) };
}

export function currentMonthPeriod(now = Date.now()): Period {
  const d = new Date(now);
  return monthPeriod(d.getFullYear(), d.getMonth());
}

export function previousMonthPeriod(now = Date.now()): Period {
  const d = new Date(now);
  return monthPeriod(d.getFullYear(), d.getMonth() - 1);
}

export function todayPeriod(now = Date.now()): Period {
  const k = toDateKey(now);
  return { from: k, to: k };
}

export const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function periodLabel(p: Period): string {
  const [fy, fm] = p.from.split('-').map(Number);
  const m = monthPeriod(fy, fm - 1);
  if (m.from === p.from && m.to === p.to) return `${HEB_MONTHS[fm - 1]} ${fy}`;
  return `${dateKeyToDisplay(p.from)} – ${dateKeyToDisplay(p.to)}`;
}

export interface DayRow {
  shift: Shift;
  /** First entry of its day (show the date). */
  firstOfDay: boolean;
  /** Set on the last entry of its day: total for that day (closed entries + open entry up to now). */
  dayTotalMs?: number;
  dayWage?: number;
}

/** Entries sorted by start, grouped by day, with a daily total on each day's last row. */
export function groupByDay(shifts: Shift[], order: 'asc' | 'desc' = 'asc', now = Date.now()): DayRow[] {
  const sorted = shifts.filter((s) => !s.deleted).sort((a, b) => a.start - b.start);
  const byDay = new Map<string, Shift[]>();
  for (const s of sorted) {
    const k = toDateKey(s.start);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const keys = [...byDay.keys()];
  if (order === 'desc') keys.reverse();
  const rows: DayRow[] = [];
  for (const k of keys) {
    const list = byDay.get(k)!;
    list.forEach((s, i) => {
      const last = i === list.length - 1;
      rows.push({
        shift: s,
        firstOfDay: i === 0,
        dayTotalMs: last ? list.reduce((a, x) => a + durationMs(x, now), 0) : undefined,
        dayWage: last ? list.reduce((a, x) => a + wage(x, now), 0) : undefined,
      });
    });
  }
  return rows;
}

export { MS_DAY, MS_HOUR };
