import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { OverlapList } from '../components/ShiftForm';
import { EmployerForm } from './Employers';
import { SummaryLine } from '../components/SummaryLine';
import { useDialogs } from '../components/Dialogs';
import { useActiveEmployer, useData, useNow } from '../data/context';
import {
  currentMonthPeriod, currentRate, durationMs, formatHM, formatHMS, formatMoney, inPeriod,
  todayPeriod, toTimeStr, totals, wage,
} from '../domain/calc';

export function Home({ goEmployers }: { goEmployers: () => void }) {
  const { service } = useData();
  const { toast, confirm } = useDialogs();
  const employer = useActiveEmployer();
  const active = service.activeShift();
  const now = useNow(1000, !!active);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!employer) {
    return (
      <div className="empty">
        <h2>ברוך הבא</h2>
        <p>כדי להתחיל, יש להוסיף מעסיק ראשון.</p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>הוספת מעסיק</button>
          <button className="btn" onClick={goEmployers}>יש לי חשבון — התחברות</button>
        </div>
        {adding && <EmployerForm onClose={() => setAdding(false)} />}
      </div>
    );
  }

  const activeHere = active?.employerId === employer.id ? active : undefined;
  const activeElsewhere = active && !activeHere ? active : undefined;
  const otherEmployer = activeElsewhere && service.employer(activeElsewhere.employerId);
  const shifts = service.shifts(employer.id);
  const today = totals(shifts.filter((s) => inPeriod(s, todayPeriod())));
  const month = totals(shifts.filter((s) => inPeriod(s, currentMonthPeriod())));

  const start = async () => {
    if (activeElsewhere) {
      toast(`בעבודה כרגע אצל "${otherEmployer?.name}". יש לסיים אותה קודם.`, 'error');
      return;
    }
    setBusy(true);
    try {
      await service.startShift(employer.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!activeHere) return;
    const overlaps = service.overlaps({ id: activeHere.id, start: activeHere.start, end: Date.now() });
    if (overlaps.length && !(await confirm({ title: 'חפיפה בין רישומים', message: <OverlapList shifts={overlaps} />, confirmText: 'סיום בכל זאת' }))) return;
    setBusy(true);
    try {
      await service.endShift(activeHere.id);
      const ms = Date.now() - activeHere.start;
      toast(`הרישום הסתיים: ${formatHM(ms)} שעות`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <section className="clock card">
        <div className="clock-employer">{employer.name}</div>
        {activeHere ? (
          <>
            <div className="clock-start">
              התחלת: <b>{toTimeStr(activeHere.start)}</b>
            </div>
            <div className="timer" aria-live="off">{formatHMS(durationMs(activeHere, now))}</div>
            <div className="clock-wage">
              שכר מצטבר: <b>{formatMoney(wage(activeHere, now))}</b>
            </div>
            <button className="big-btn stop" onClick={end} disabled={busy}>סיום</button>
          </>
        ) : (
          <>
            <div className="clock-idle">לא בעבודה כרגע</div>
            <div className="clock-rate">תעריף: {formatMoney(currentRate(employer))} לשעה</div>
            {activeElsewhere && (
              <div className="warn">
                <TriangleAlert size={16} /> בעבודה כרגע אצל <b>{otherEmployer?.name}</b> מ־{toTimeStr(activeElsewhere.start)}
                <button className="btn small" onClick={() => service.updateSettings({ activeEmployerId: activeElsewhere.employerId })}>
                  מעבר למעסיק זה
                </button>
              </div>
            )}
            <button className="big-btn go" onClick={start} disabled={busy || !!activeElsewhere}>התחלה</button>
          </>
        )}
      </section>

      <div className="card home-summary">
        <SummaryLine t={today} label="היום:" showDays={false} />
        <SummaryLine t={month} label="החודש:" />
        {activeHere && <p className="muted small-text">* רישום פעיל ייכלל בסיכום לאחר הסיום.</p>}
      </div>

    </div>
  );
}
