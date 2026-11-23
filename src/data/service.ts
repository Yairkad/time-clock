import { combine, findOverlaps, rateOn, splitAtMidnight, toDateKey, uuid, withRate } from '../domain/calc';
import type { BackupFile, Employer, Settings, Shift, Snapshot } from '../domain/types';
import type { DataAdapter } from './adapter';

export class ServiceError extends Error {}

/** Business operations on top of a DataAdapter. */
export class TimeClockService {
  constructor(private adapter: DataAdapter) {}

  private get s() {
    return this.adapter.getSnapshot();
  }

  employers(): Employer[] {
    return this.s.employers.filter((e) => !e.deleted).sort((a, b) => a.createdAt - b.createdAt);
  }

  shifts(employerId?: string): Shift[] {
    return this.s.shifts
      .filter((x) => !x.deleted && (!employerId || x.employerId === employerId))
      .sort((a, b) => b.start - a.start);
  }

  activeShift(): Shift | undefined {
    return this.s.shifts.find((x) => !x.deleted && x.end === null);
  }

  employer(id: string | null | undefined): Employer | undefined {
    return this.s.employers.find((e) => e.id === id && !e.deleted);
  }

  settings(): Settings {
    return this.s.settings;
  }

  async updateSettings(patch: Partial<Settings>) {
    await this.adapter.putSettings({ ...this.s.settings, ...patch, updatedAt: Date.now() });
  }

  // ---- Employers ----

  async addEmployer(input: { name: string; employeeName: string; rate: number }): Promise<Employer> {
    const now = Date.now();
    const e: Employer = {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      name: input.name.trim(),
      employeeName: input.employeeName.trim(),
      // The first rate applies to all past dates too (useful for retroactive entries).
      rates: [{ from: '1970-01-01', rate: input.rate }],
    };
    await this.adapter.putEmployers([e]);
    if (!this.employer(this.s.settings.activeEmployerId)) await this.updateSettings({ activeEmployerId: e.id });
    return e;
  }

  async updateEmployer(
    id: string,
    input: { name: string; employeeName: string; rate: number; rateFrom: string },
  ) {
    const e = this.employer(id);
    if (!e) throw new ServiceError('המעביד לא נמצא');
    const rates = rateOn(e, input.rateFrom) === input.rate ? e.rates : withRate(e.rates, input.rateFrom, input.rate);
    await this.adapter.putEmployers([
      { ...e, name: input.name.trim(), employeeName: input.employeeName.trim(), rates, updatedAt: Date.now() },
    ]);
  }

  async removeRate(id: string, from: string) {
    const e = this.employer(id);
    if (!e || e.rates.length <= 1) return;
    await this.adapter.putEmployers([{ ...e, rates: e.rates.filter((r) => r.from !== from), updatedAt: Date.now() }]);
  }

  /** Deletes the employer and all its shifts. */
  async deleteEmployer(id: string) {
    const e = this.employer(id);
    if (!e) return;
    const now = Date.now();
    const shifts = this.shifts(id).map((x) => ({ ...x, deleted: true, updatedAt: now }));
    if (shifts.length) await this.adapter.putShifts(shifts);
    await this.adapter.putEmployers([{ ...e, deleted: true, updatedAt: now }]);
    if (this.s.settings.activeEmployerId === id) {
      await this.updateSettings({ activeEmployerId: this.employers()[0]?.id ?? null });
    }
  }

  // ---- Shifts ----

  /** Starts a shift now. Only one active shift is allowed overall. */
  async startShift(employerId: string): Promise<Shift> {
    const e = this.employer(employerId);
    if (!e) throw new ServiceError('יש לבחור מעביד');
    const active = this.activeShift();
    if (active) {
      const other = this.employer(active.employerId);
      throw new ServiceError(
        active.employerId === employerId
          ? 'כבר קיים רישום פעיל אצל מעביד זה'
          : `בעבודה כרגע אצל "${other?.name ?? 'מעביד אחר'}". יש לסיים אותה קודם.`,
      );
    }
    const now = Date.now();
    const shift: Shift = {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      employerId,
      start: now,
      end: null,
      rate: rateOn(e, toDateKey(now)),
    };
    await this.adapter.putShifts([shift]);
    return shift;
  }

  async endShift(id: string) {
    const shift = this.s.shifts.find((x) => x.id === id);
    if (!shift || shift.end !== null) return;
    const now = Date.now();
    await this.adapter.putShifts(this.splitRecord(shift, shift.start, Math.max(now, shift.start), shift.rate, shift.note, now));
  }

  /**
   * Builds the records for an interval, split at midnight: the first piece keeps
   * `base` (its id), the following days become new records.
   */
  private splitRecord(base: Shift, start: number, end: number, rate: number, note: string | undefined, now: number): Shift[] {
    const parts = splitAtMidnight(start, end);
    if (parts.length === 0) parts.push({ start, end });
    return parts.map((p, i) => ({
      ...base,
      ...(i > 0 ? { id: uuid(), createdAt: now } : {}),
      start: p.start,
      end: p.end,
      rate,
      note,
      updatedAt: now,
    }));
  }

  /** Overlapping shifts (across all employers) for a proposed interval. */
  overlaps(interval: { id?: string; start: number; end: number | null }): Shift[] {
    return findOverlaps(interval, this.shifts());
  }

  validateInterval(start: number, end: number | null) {
    if (Number.isNaN(start) || (end !== null && Number.isNaN(end))) throw new ServiceError('תאריך או שעה לא תקינים');
    if (end !== null && end <= start) throw new ServiceError('שעת היציאה חייבת להיות אחרי שעת הכניסה');
    if (end !== null && end - start > 24 * 3_600_000) throw new ServiceError('רישום לא יכול להיות ארוך מ־24 שעות');
    if (start > Date.now() + 60_000) throw new ServiceError('לא ניתן להזין רישום שמתחיל בעתיד');
  }

  async addShift(input: { employerId: string; start: number; end: number; rate?: number; note?: string }) {
    const e = this.employer(input.employerId);
    if (!e) throw new ServiceError('יש לבחור מעביד');
    this.validateInterval(input.start, input.end);
    const now = Date.now();
    const base: Shift = {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      employerId: e.id,
      start: input.start,
      end: input.end,
      rate: 0,
      note: undefined,
    };
    const records = this.splitRecord(
      base, input.start, input.end, input.rate ?? rateOn(e, toDateKey(input.start)), input.note?.trim() || undefined, now,
    );
    await this.adapter.putShifts(records);
    return records[0];
  }

  async updateShift(id: string, patch: { start: number; end: number | null; rate: number; note?: string }) {
    const shift = this.s.shifts.find((x) => x.id === id && !x.deleted);
    if (!shift) throw new ServiceError('הרישום לא נמצא');
    if (patch.end === null && shift.end !== null) throw new ServiceError('יש להזין שעת יציאה');
    this.validateInterval(patch.start, patch.end);
    const note = patch.note?.trim() || undefined;
    const now = Date.now();
    await this.adapter.putShifts(
      patch.end === null
        ? [{ ...shift, start: patch.start, end: null, rate: patch.rate, note, updatedAt: now }]
        : this.splitRecord(shift, patch.start, patch.end, patch.rate, note, now),
    );
  }

  async deleteShift(id: string) {
    const shift = this.s.shifts.find((x) => x.id === id);
    if (!shift) return;
    await this.adapter.putShifts([{ ...shift, deleted: true, updatedAt: Date.now() }]);
  }

  /** Rate to suggest for a date when adding/editing. */
  suggestedRate(employerId: string, dateKey: string): number {
    const e = this.employer(employerId);
    return e ? rateOn(e, dateKey) : 0;
  }

  // ---- Backup ----

  exportBackup(): BackupFile {
    return { app: 'time-clock', version: 1, exportedAt: new Date().toISOString(), data: this.s };
  }

  async importBackup(raw: unknown) {
    const b = raw as Partial<BackupFile>;
    const d = b?.data as Snapshot | undefined;
    if (b?.app !== 'time-clock' || !d || !Array.isArray(d.employers) || !Array.isArray(d.shifts) || !d.settings) {
      throw new ServiceError('קובץ הגיבוי אינו תקין');
    }
    await this.adapter.replaceAll(d);
  }
}

export { combine };
