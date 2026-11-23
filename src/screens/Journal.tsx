import { useState } from 'react';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { ShiftForm } from '../components/ShiftForm';
import { SummaryLine } from '../components/SummaryLine';
import { useActiveEmployer, useData, useNow } from '../data/context';
import { findOverlaps, formatDate, formatHM, groupByDay, inPeriod, toDateKey, toTimeStr, totals } from '../domain/calc';
import type { Shift } from '../domain/types';

export function Journal() {
  const { service } = useData();
  const employer = useActiveEmployer();
  const [period, setPeriod] = usePeriod();
  const [form, setForm] = useState<{ shift?: Shift } | null>(null);
  const hasActive = !!service.activeShift();
  const now = useNow(30_000, hasActive);

  if (!employer) return <div className="empty">אין מעבידים עדיין.</div>;

  const all = service.shifts();
  const shifts = service.shifts(employer.id).filter((s) => inPeriod(s, period));
  const rows = groupByDay(shifts, 'desc', now);

  return (
    <div>
      <div className="toolbar">
        <h2>יומן שעות</h2>
        <button className="btn primary" onClick={() => setForm({})}>+ הוספה ידנית</button>
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
            {rows.map(({ shift: s, firstOfDay, dayTotalMs }) => {
              const open = s.end === null;
              const overlap = findOverlaps(s, all, now).length > 0;
              const nextDay = s.end !== null && toDateKey(s.end - 1) !== toDateKey(s.start);
              return (
                <tr
                  key={s.id}
                  className={`${open ? 'open' : ''} ${firstOfDay ? 'day-start' : ''}`}
                  onClick={() => setForm({ shift: s })}
                  title="לחיצה לעריכה"
                >
                  <td>{firstOfDay ? formatDate(s.start) : ''}</td>
                  <td>
                    {toTimeStr(s.start)}
                    {overlap && <span className="dot-warn" title="חופף לרישום אחר">⚠</span>}
                  </td>
                  <td>
                    {open ? <span className="live">עובד…</span> : toTimeStr(s.end!)}
                    {nextDay && <sup>+1</sup>}
                  </td>
                  <td className="total">{dayTotalMs !== undefined ? formatHM(dayTotalMs) : ''}</td>
                </tr>
              );
            })}
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
      {form && <ShiftForm employerId={employer.id} shift={form.shift} onClose={() => setForm(null)} />}
    </div>
  );
}
