import { Download, Plus, TriangleAlert } from 'lucide-react';
import { Fragment, useState } from 'react';
import { ExportDialog } from '../components/ExportDialog';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { ShiftForm } from '../components/ShiftForm';
import { SummaryLine } from '../components/SummaryLine';
import { useActiveEmployer, useData, useNow } from '../data/context';
import { findOverlaps, formatDate, formatHM, groupByDay, inPeriod, toDateKey, toTimeStr, totals, weekdayHe } from '../domain/calc';
import type { Shift } from '../domain/types';

export function Journal() {
  const { service } = useData();
  const employer = useActiveEmployer();
  const [period, setPeriod] = usePeriod();
  const [form, setForm] = useState<{ shift?: Shift } | null>(null);
  const [exporting, setExporting] = useState(false);
  const hasActive = !!service.activeShift();
  const now = useNow(30_000, hasActive);

  if (!employer) return <div className="empty">אין מעסיקים עדיין.</div>;

  const all = service.shifts();
  const shifts = service.shifts(employer.id).filter((s) => inPeriod(s, period));
  const rows = groupByDay(shifts, 'desc', now);
  // Day blocks, newest day first; entries inside a day in time order.
  const days: { key: string; totalMs: number; entries: Shift[] }[] = [];
  for (const g of rows) {
    if (g.firstOfDay) days.push({ key: toDateKey(g.shift.start), totalMs: 0, entries: [] });
    const d = days[days.length - 1];
    d.entries.push(g.shift);
    if (g.dayTotalMs !== undefined) d.totalMs = g.dayTotalMs;
  }

  return (
    <div>
      <div className="toolbar">
        <h2>יומן שעות</h2>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => setExporting(true)}>
            <Download size={18} /> ייצוא
          </button>
          <button className="btn primary" onClick={() => setForm({})}>
            <Plus size={18} /> הוספה ידנית
          </button>
        </div>
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />

      {rows.length === 0 ? (
        <div className="empty small">אין רישומים בתקופה זו.</div>
      ) : (
        <table className="hours">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>התחלה</th>
              <th>סיום</th>
              <th>סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <Fragment key={day.key}>
                <tr className="day-head">
                  <td colSpan={3}>
                    {weekdayHe(day.entries[0].start)} {formatDate(day.entries[0].start)}
                  </td>
                  <td className="total">{formatHM(day.totalMs)}</td>
                </tr>
                {day.entries.map((s) => {
                  const open = s.end === null;
                  const overlap = findOverlaps(s, all, now).length > 0;
                  const nextDay = s.end !== null && toDateKey(s.end - 1) !== toDateKey(s.start);
                  return (
                    <tr key={s.id} className={`entry ${open ? 'open' : ''}`} onClick={() => setForm({ shift: s })} title="לחיצה לעריכה">
                      <td></td>
                      <td>
                        {toTimeStr(s.start)}
                        {overlap && <TriangleAlert className="dot-warn" size={15} aria-label="חופף לרישום אחר" />}
                      </td>
                      <td>
                        {open ? <span className="live">עובד…</span> : toTimeStr(s.end!)}
                        {nextDay && <sup>+1</sup>}
                      </td>
                      <td></td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <SummaryLine t={totals(shifts)} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      {rows.length > 0 && <p className="muted small-text">לחיצה על שורה לעריכה או מחיקה.</p>}
      {exporting && <ExportDialog employer={employer} period={period} shifts={shifts} onClose={() => setExporting(false)} />}
      {form && <ShiftForm employerId={employer.id} shift={form.shift} onClose={() => setForm(null)} />}
    </div>
  );
}
