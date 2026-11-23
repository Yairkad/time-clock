import { useState } from 'react';
import { Modal, useDialogs } from '../components/Dialogs';
import { useData } from '../data/context';
import { currentRate, dateKeyToDisplay, formatMoney, sortRates, toDateKey } from '../domain/calc';
import type { Employer } from '../domain/types';

export function Employers({ autoOpen = false }: { autoOpen?: boolean }) {
  const { service } = useData();
  const { confirm, toast } = useDialogs();
  const employers = service.employers();
  const activeId = service.settings().activeEmployerId;
  const [form, setForm] = useState<{ employer?: Employer } | null>(autoOpen && employers.length === 0 ? {} : null);

  const remove = async (e: Employer) => {
    const count = service.shifts(e.id).length;
    const active = service.activeShift()?.employerId === e.id;
    const ok = await confirm({
      title: `מחיקת "${e.name}"`,
      message: (
        <>
          <p>פעולה זו תמחק את המעביד ואת כל היסטוריית השעות שלו ({count} רישומים).</p>
          {active && <p className="warn">⚠️ קיים רישום פעיל אצל מעביד זה.</p>}
          <p>מומלץ לייצא גיבוי לפני המחיקה.</p>
        </>
      ),
      checkboxLabel: 'אני מבין/ה שכל השעות של מעביד זה יימחקו',
      confirmText: 'מחיקה סופית',
      danger: true,
    });
    if (ok) {
      await service.deleteEmployer(e.id);
      toast('המעביד נמחק');
    }
  };

  return (
    <div>
      <div className="toolbar">
        <h2>מעבידים</h2>
        <button className="btn primary" onClick={() => setForm({})}>+ מעביד חדש</button>
      </div>
      {employers.length === 0 && <div className="empty small">עדיין לא הוגדרו מעבידים.</div>}
      <ul className="list">
        {employers.map((e) => (
          <li key={e.id} className={`card list-item ${e.id === activeId ? 'active' : ''}`}>
            <button className="list-main" onClick={() => service.updateSettings({ activeEmployerId: e.id })}>
              <div className="list-title">{e.name} {e.id === activeId && <span className="badge">פעיל</span>}</div>
              <div className="muted">
                {e.employeeName || 'ללא שם עובד'} · {formatMoney(currentRate(e))} לשעה
              </div>
            </button>
            <button className="icon-btn" onClick={() => setForm({ employer: e })} aria-label="עריכה">✏️</button>
            <button className="icon-btn" onClick={() => remove(e)} aria-label="מחיקה">🗑️</button>
          </li>
        ))}
      </ul>
      {form && <EmployerForm employer={form.employer} onClose={() => setForm(null)} />}
    </div>
  );
}

function EmployerForm({ employer, onClose }: { employer?: Employer; onClose: () => void }) {
  const { service } = useData();
  const { toast, confirm } = useDialogs();
  const today = toDateKey(Date.now());
  const [name, setName] = useState(employer?.name ?? '');
  const [employeeName, setEmployeeName] = useState(employer?.employeeName ?? service.settings().defaultEmployeeName);
  const [rate, setRate] = useState(employer ? String(currentRate(employer)) : '');
  const [rateFrom, setRateFrom] = useState(today);

  const save = async () => {
    const r = Number(rate);
    if (!name.trim()) return toast('יש להזין שם מעביד', 'error');
    if (!rate || !(r >= 0)) return toast('יש להזין תעריף תקין', 'error');
    if (employer) await service.updateEmployer(employer.id, { name, employeeName, rate: r, rateFrom: rateFrom || today });
    else await service.addEmployer({ name, employeeName, rate: r });
    toast('נשמר');
    onClose();
  };

  const rateChanged = employer && Number(rate) !== currentRate(employer);

  return (
    <Modal title={employer ? 'עריכת מעביד' : 'מעביד חדש'} onClose={onClose}>
      <div className="form">
        <label>
          שם המעביד / העסק
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          שם העובד
          <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
        </label>
        <label>
          תעריף שעתי (₪)
          <input type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        {rateChanged && (
          <label>
            התעריף החדש בתוקף מתאריך
            <input type="date" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} />
            <span className="muted small-text">רישומים שכבר נשמרו ישמרו על התעריף המקורי שלהן.</span>
          </label>
        )}
        {employer && employer.rates.length > 1 && (
          <div className="rate-history">
            <div className="muted">היסטוריית תעריפים</div>
            <ul>
              {sortRates(employer.rates).map((r, i) => (
                <li key={r.from}>
                  {i === 0 ? 'מההתחלה' : `מ־${dateKeyToDisplay(r.from)}`}: {formatMoney(r.rate)}
                  {i > 0 && (
                    <button
                      className="link"
                      onClick={async () => {
                        if (await confirm({ title: 'הסרת תעריף', message: 'להסיר את התעריף מההיסטוריה? רישומים קיימים לא ישתנו.' })) {
                          await service.removeRate(employer.id, r.from);
                          onClose();
                        }
                      }}
                    >
                      הסר
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={save}>שמירה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  );
}
