import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Modal, useDialogs } from '../components/Dialogs';
import { useData } from '../data/context';
import { currentRate, dateKeyToDisplay, formatMoney, sortRates, toDateKey } from '../domain/calc';
import type { Employer } from '../domain/types';

export function Employers() {
  const { service } = useData();
  const { confirm, toast } = useDialogs();
  const employers = service.employers();
  const activeId = service.settings().activeEmployerId;
  const [form, setForm] = useState<{ employer?: Employer } | null>(null);

  const remove = async (e: Employer) => {
    const count = service.shifts(e.id).length;
    const active = service.activeShift()?.employerId === e.id;
    const ok = await confirm({
      title: `מחיקת "${e.name}"`,
      message: (
        <>
          <p>פעולה זו תמחק את המעסיק ואת כל היסטוריית השעות שלו ({count} רישומים).</p>
          {active && <p className="warn"><TriangleAlert size={16} /> קיים רישום פעיל אצל מעסיק זה.</p>}
          <p>מומלץ לייצא גיבוי לפני המחיקה.</p>
        </>
      ),
      checkboxLabel: 'אני מבין/ה שכל השעות של מעסיק זה יימחקו',
      confirmText: 'מחיקה סופית',
      danger: true,
    });
    if (ok) {
      await service.deleteEmployer(e.id);
      toast('המעסיק נמחק');
    }
  };

  return (
    <section className="card">
      <div className="toolbar">
        <h3>מעסיקים ותעריפים</h3>
        <button className="btn primary small-btn" onClick={() => setForm({})}><Plus size={16} /> מעסיק חדש</button>
      </div>
      {employers.length === 0 && <div className="empty small">עדיין לא הוגדרו מעסיקים.</div>}
      <ul className="list">
        {employers.map((e) => (
          <li key={e.id} className={`card list-item ${e.id === activeId ? 'active' : ''}`}>
            <button className="list-main" onClick={() => service.updateSettings({ activeEmployerId: e.id })}>
              <div className="list-title">{e.name} {e.id === activeId && <span className="badge">פעיל</span>}</div>
              <div className="muted">
                {e.employeeName || 'ללא שם עובד'} · {formatMoney(currentRate(e))} לשעה
              </div>
            </button>
            <button className="icon-btn" onClick={() => setForm({ employer: e })} aria-label="עריכה"><Pencil size={18} /></button>
            <button className="icon-btn" onClick={() => remove(e)} aria-label="מחיקה"><Trash2 size={18} /></button>
          </li>
        ))}
      </ul>
      {form && <EmployerForm employer={form.employer} onClose={() => setForm(null)} />}
    </section>
  );
}

export function EmployerForm({ employer, onClose }: { employer?: Employer; onClose: () => void }) {
  const { service } = useData();
  const { toast, confirm } = useDialogs();
  const today = toDateKey(Date.now());
  const [name, setName] = useState(employer?.name ?? '');
  const [employeeName, setEmployeeName] = useState(employer?.employeeName ?? service.settings().defaultEmployeeName);
  const [rate, setRate] = useState(employer ? String(currentRate(employer)) : '');
  const [rateFrom, setRateFrom] = useState(today);

  const save = async () => {
    const r = Number(rate);
    if (!name.trim()) return toast('יש להזין שם מעסיק', 'error');
    if (!rate || !(r >= 0)) return toast('יש להזין תעריף תקין', 'error');
    if (employer) await service.updateEmployer(employer.id, { name, employeeName, rate: r, rateFrom: rateFrom || today });
    else await service.addEmployer({ name, employeeName, rate: r });
    toast('נשמר');
    onClose();
  };

  const rateChanged = employer && Number(rate) !== currentRate(employer);
  const affected = employer && rateChanged && rateFrom ? service.entriesFrom(employer.id, rateFrom) : 0;

  return (
    <Modal title={employer ? 'עריכת מעסיק' : 'מעסיק חדש'} onClose={onClose}>
      <div className="form">
        <label>
          שם המעסיק / העסק
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
            <span className="muted small-text">
              רישומים לפני {rateFrom ? dateKeyToDisplay(rateFrom) : 'התאריך'} נשארים בתעריף הקודם.
              {affected > 0 && ` ${affected} רישומים מתאריך זה ואילך יעודכנו לתעריף החדש.`}
            </span>
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
                        if (await confirm({ title: 'הסרת תעריף', message: 'להסיר את התעריף מההיסטוריה? הרישומים בתקופה שלו יחושבו לפי התעריף הקודם.' })) {
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
