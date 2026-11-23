import { Moon, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../data/context';
import {
  buildInterval, combine, splitAtMidnight, formatDate, formatDecimalHours, formatHM, formatMoney, msToHours, toDateKey, toTimeStr,
} from '../domain/calc';
import type { Shift } from '../domain/types';
import { Modal, useDialogs } from './Dialogs';
import { TimeInput } from './TimeInput';

interface Props {
  employerId: string;
  /** Existing shift to edit; omit to add a new one. */
  shift?: Shift;
  onClose: () => void;
}

export function ShiftForm({ employerId, shift, onClose }: Props) {
  const { service } = useData();
  const { confirm, toast } = useDialogs();
  const isActive = shift?.end === null;
  const now = Date.now();

  const [date, setDate] = useState(toDateKey(shift?.start ?? now));
  const [startTime, setStartTime] = useState(shift ? toTimeStr(shift.start) : '');
  const [endTime, setEndTime] = useState(shift?.end ? toTimeStr(shift.end) : '');
  const [note, setNote] = useState(shift?.note ?? '');

  const onDate = (d: string) => {
    setDate(d);
  };

  const interval = useMemo(() => {
    if (!date || !startTime) return null;
    if (isActive) return { start: combine(date, startTime), end: null as number | null };
    if (!endTime) return null;
    return buildInterval(date, startTime, endTime);
  }, [date, startTime, endTime, isActive]);

  const crossesMidnight = interval?.end != null && toDateKey(interval.end - 1) !== toDateKey(interval.start);
  const duration = interval ? (interval.end ?? now) - interval.start : 0;
  // Rate comes from the employer's settings by date; midnight-split parts use their own day's rate.
  const previewWage = interval
    ? (interval.end === null ? [{ start: interval.start, end: now }] : splitAtMidnight(interval.start, interval.end)).reduce(
        (sum, p) => sum + msToHours(p.end - p.start) * service.suggestedRate(employerId, toDateKey(p.start)),
        0,
      )
    : 0;
  const overlaps = interval ? service.overlaps({ id: shift?.id, ...interval }) : [];

  const save = async () => {
    if (!interval) return toast('יש למלא תאריך ושעות', 'error');
    if (overlaps.length) {
      const ok = await confirm({
        title: 'חפיפה בין רישומים',
        message: <OverlapList shifts={overlaps} />,
        confirmText: 'שמור בכל זאת',
      });
      if (!ok) return;
    }
    try {
      if (shift) await service.updateShift(shift.id, { ...interval, note });
      else await service.addShift({ employerId, start: interval.start, end: interval.end!, note });
      toast(shift ? 'הרישום עודכן' : 'הרישום נוסף');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    if (!shift) return;
    const ok = await confirm({
      title: 'מחיקת רישום',
      message: `למחוק את הרישום מ־${formatDate(shift.start)} ${toTimeStr(shift.start)}?`,
      confirmText: 'מחיקה',
      danger: true,
    });
    if (!ok) return;
    await service.deleteShift(shift.id);
    toast('הרישום נמחק');
    onClose();
  };

  return (
    <Modal title={shift ? 'עריכת רישום' : 'הוספת רישום'} onClose={onClose}>
      <div className="form">
        <label>
          תאריך
          <input type="date" value={date} max={toDateKey(now)} onChange={(e) => onDate(e.target.value)} />
        </label>
        <div className="row2">
          <label>
            שעת כניסה
            <TimeInput value={startTime} onChange={setStartTime} />
          </label>
          <label>
            שעת יציאה
            {isActive ? (
              <input type="text" value="עדיין עובד" disabled />
            ) : (
              <TimeInput value={endTime} onChange={setEndTime} />
            )}
          </label>
        </div>
        <label>
          הערה
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="אופציונלי" />
        </label>

        {interval && (
          <div className="preview">
            {crossesMidnight && (
              <div className="hint">
                <Moon size={16} /> עובר חצות — יישמר כשני רישומים: {formatDate(interval.start)} {toTimeStr(interval.start)}–00:00
                {' '}ו־{formatDate(interval.end!)} 00:00–{toTimeStr(interval.end!)}
              </div>
            )}
            <div>
              משך: <b>{formatHM(duration)}</b> ({formatDecimalHours(duration)} שעות)
            </div>
            <div>
              שכר: <b>{formatMoney(previewWage)}</b>
            </div>
            {overlaps.length > 0 && <div className="warn"><TriangleAlert size={16} /> חופף ל־{overlaps.length} רישומים אחרים</div>}
          </div>
        )}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={save}>שמירה</button>
        {shift && !isActive && (
          <button className="btn danger-outline" onClick={remove}>מחיקה</button>
        )}
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  );
}

export function OverlapList({ shifts }: { shifts: Shift[] }) {
  const { service } = useData();
  return (
    <div>
      <p>הרישום חופף לרישומים הבאים:</p>
      <ul className="overlap-list">
        {shifts.map((s) => (
          <li key={s.id}>
            {service.employer(s.employerId)?.name}: {formatDate(s.start)} {toTimeStr(s.start)}–
            {s.end ? toTimeStr(s.end) : 'פעילה'}
          </li>
        ))}
      </ul>
    </div>
  );
}
