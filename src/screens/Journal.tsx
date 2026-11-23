import { useState } from 'react';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { ShiftForm } from '../components/ShiftForm';
import { SummaryCards } from '../components/SummaryCards';
import { useDialogs } from '../components/Dialogs';
import { useActiveEmployer, useData, useNow } from '../data/context';
import {
  durationMs, findOverlaps, formatDate, formatDecimalHours, formatHM, formatMoney, inPeriod, toDateKey, toTimeStr,
  totals, wage,
} from '../domain/calc';
import type { Shift } from '../domain/types';

export function Journal() {
  const { service } = useData();
  const { confirm, toast } = useDialogs();
  const employer = useActiveEmployer();
  const [period, setPeriod] = usePeriod();
  const [form, setForm] = useState<{ shift?: Shift } | null>(null);
  const hasActive = !!service.activeShift();
  const now = useNow(30_000, hasActive);

  if (!employer) return <div className="empty">אין מעבידים עדיין.</div>;

  const all = service.shifts();
  const shifts = service.shifts(employer.id).filter((s) => inPeriod(s, period));
  const t = totals(shifts);

  const remove = async (s: Shift) => {
    const ok = await confirm({
      title: 'מחיקת משמרת',
      message: `למחוק את המשמרת מ־${formatDate(s.start)} ${toTimeStr(s.start)}?`,
      confirmText: 'מחיקה',
      danger: true,
    });
    if (ok) {
      await service.deleteShift(s.id);
      toast('המשמרת נמחקה');
    }
  };

  return (
    <div>
      <div className="toolbar">
        <h2>יומן שעות</h2>
        <button className="btn primary" onClick={() => setForm({})}>+ הוספה ידנית</button>
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      <SummaryCards t={t} />

      {shifts.length === 0 ? (
        <div className="empty small">אין משמרות בתקופה זו.</div>
      ) : (
        <table className="shifts">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>כניסה</th>
              <th>יציאה</th>
              <th>משך</th>
              <th>תעריף</th>
              <th>שכר</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const open = s.end === null;
              const ms = durationMs(s, now);
              const overlap = findOverlaps(s, all, now).length > 0;
              const nextDay = s.end !== null && toDateKey(s.end) !== toDateKey(s.start);
              return (
                <tr key={s.id} className={open ? 'open' : ''}>
                  <td data-label="תאריך"><span className="v">
                    {formatDate(s.start)}
                    {overlap && <span className="badge warn-badge" title="חופפת למשמרת אחרת">חפיפה</span>}
                  </span></td>
                  <td data-label="כניסה"><span className="v">{toTimeStr(s.start)}</span></td>
                  <td data-label="יציאה"><span className="v">
                    {open ? <span className="badge live">עדיין עובד</span> : <>{toTimeStr(s.end!)}{nextDay && <sup> +1</sup>}</>}
                  </span></td>
                  <td data-label="משך"><span className="v">
                    {formatHM(ms)} <span className="muted">({formatDecimalHours(ms)})</span>
                  </span></td>
                  <td data-label="תעריף"><span className="v">{formatMoney(s.rate)}</span></td>
                  <td data-label="שכר"><span className="v">{open ? <span className="muted">{formatMoney(wage(s, now))}</span> : formatMoney(wage(s))}</span></td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => setForm({ shift: s })} aria-label="עריכה">✏️</button>
                    {!open && <button className="icon-btn" onClick={() => remove(s)} aria-label="מחיקה">🗑️</button>}
                    {s.note && <div className="note">{s.note}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {form && <ShiftForm employerId={employer.id} shift={form.shift} onClose={() => setForm(null)} />}
    </div>
  );
}
