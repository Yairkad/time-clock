import { useState } from 'react';
import { OverlapList, ShiftForm } from '../components/ShiftForm';
import { SummaryCards } from '../components/SummaryCards';
import { useDialogs } from '../components/Dialogs';
import { useActiveEmployer, useData, useNow } from '../data/context';
import {
  currentMonthPeriod, currentRate, durationMs, formatDecimalHours, formatHM, formatHMS, formatMoney, inPeriod,
  todayPeriod, toTimeStr, totals, wage,
} from '../domain/calc';

export function Home({ goEmployers }: { goEmployers: () => void }) {
  const { service } = useData();
  const { toast, confirm } = useDialogs();
  const employer = useActiveEmployer();
  const active = service.activeShift();
  const now = useNow(1000, !!active);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!employer) {
    return (
      <div className="empty">
        <h2>ברוך הבא 👋</h2>
        <p>כדי להתחיל, יש להוסיף מעביד ראשון.</p>
        <button className="btn primary" onClick={goEmployers}>הוספת מעביד</button>
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
      toast(`קיימת משמרת פעילה אצל "${otherEmployer?.name}". יש לסיים אותה קודם.`, 'error');
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
    if (overlaps.length && !(await confirm({ title: 'חפיפה בין משמרות', message: <OverlapList shifts={overlaps} />, confirmText: 'סיים בכל זאת' }))) return;
    setBusy(true);
    try {
      await service.endShift(activeHere.id);
      const ms = Date.now() - activeHere.start;
      toast(`המשמרת הסתיימה: ${formatHM(ms)} שעות`);
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
              התחלת: <b>{toTimeStr(activeHere.start)}</b>{' '}
              <button className="link" onClick={() => setEditing(true)}>תיקון</button>
            </div>
            <div className="timer" aria-live="off">{formatHMS(durationMs(activeHere, now))}</div>
            <div className="clock-wage">
              שכר מצטבר: <b>{formatMoney(wage(activeHere, now))}</b>
            </div>
            <button className="big-btn stop" onClick={end} disabled={busy}>סיים משמרת</button>
          </>
        ) : (
          <>
            <div className="clock-idle">אין משמרת פעילה</div>
            <div className="clock-rate">תעריף: {formatMoney(currentRate(employer))} לשעה</div>
            {activeElsewhere && (
              <div className="warn">
                ⚠️ קיימת משמרת פעילה אצל <b>{otherEmployer?.name}</b> מ־{toTimeStr(activeElsewhere.start)}
                <button className="btn small" onClick={() => service.updateSettings({ activeEmployerId: activeElsewhere.employerId })}>
                  מעבר למעביד זה
                </button>
              </div>
            )}
            <button className="big-btn go" onClick={start} disabled={busy || !!activeElsewhere}>התחל משמרת</button>
          </>
        )}
      </section>

      <h3 className="section-title">היום</h3>
      <div className="cards compact">
        <div className="card stat">
          <div className="stat-label">שעות היום</div>
          <div className="stat-value">{formatHM(today.ms)}</div>
          <div className="stat-sub">{formatDecimalHours(today.ms)} שעות</div>
        </div>
        <div className="card stat">
          <div className="stat-label">שכר היום</div>
          <div className="stat-value">{formatMoney(today.wage)}</div>
        </div>
      </div>

      <h3 className="section-title">החודש</h3>
      <SummaryCards t={month} />
      {activeHere && <p className="muted small-text">* משמרת פעילה אינה נכללת בסיכומים עד לסיומה.</p>}

      {editing && activeHere && <ShiftForm employerId={employer.id} shift={activeHere} onClose={() => setEditing(false)} />}
    </div>
  );
}
