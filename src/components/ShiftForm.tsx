import { useMemo, useState } from 'react';
import { useData } from '../data/context';
import {
  buildInterval, combine, formatDate, formatDecimalHours, formatHM, formatMoney, msToHours, toDateKey, toTimeStr,
} from '../domain/calc';
import type { Shift } from '../domain/types';
import { Modal, useDialogs } from './Dialogs';

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
  const [rate, setRate] = useState(String(shift?.rate ?? service.suggestedRate(employerId, date)));
  const [rateTouched, setRateTouched] = useState(false);
  const [note, setNote] = useState(shift?.note ?? '');

  const onDate = (d: string) => {
    setDate(d);
    // A new date may fall under a different historical rate.
    if (!rateTouched && d) setRate(String(service.suggestedRate(employerId, d)));
  };

  const interval = useMemo(() => {
    if (!date || !startTime) return null;
    if (isActive) return { start: combine(date, startTime), end: null as number | null };
    if (!endTime) return null;
    return buildInterval(date, startTime, endTime);
  }, [date, startTime, endTime, isActive]);

  const crossesMidnight = interval?.end != null && toDateKey(interval.end) !== toDateKey(interval.start);
  const duration = interval ? (interval.end ?? now) - interval.start : 0;
  const rateNum = Number(rate);
  const overlaps = interval ? service.overlaps({ id: shift?.id, ...interval }) : [];

  const save = async () => {
    if (!interval) return toast('יש למלא תאריך ושעות', 'error');
    if (!(rateNum >= 0)) return toast('תעריף לא תקין', 'error');
    if (overlaps.length) {
      const ok = await confirm({
        title: 'חפיפה בין משמרות',
        message: <OverlapList shifts={overlaps} />,
        confirmText: 'שמור בכל זאת',
      });
      if (!ok) return;
    }
    try {
      if (shift) await service.updateShift(shift.id, { ...interval, rate: rateNum, note });
      else await service.addShift({ employerId, start: interval.start, end: interval.end!, rate: rateNum, note });
      toast(shift ? 'המשמרת עודכנה' : 'המשמרת נוספה');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Modal title={shift ? 'עריכת משמרת' : 'הוספת משמרת'} onClose={onClose}>
      <div className="form">
        <label>
          תאריך
          <input type="date" value={date} max={toDateKey(now)} onChange={(e) => onDate(e.target.value)} />
        </label>
        <div className="row2">
          <label>
            שעת כניסה
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            שעת יציאה
            {isActive ? (
              <input type="text" value="עדיין עובד" disabled />
            ) : (
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            )}
          </label>
        </div>
        <label>
          תעריף לשעה (₪)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setRateTouched(true);
            }}
          />
        </label>
        <label>
          הערה
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="אופציונלי" />
        </label>

        {interval && (
          <div className="preview">
            {crossesMidnight && <div className="hint">🌙 המשמרת עוברת חצות ומסתיימת ב־{formatDate(interval.end!)}</div>}
            <div>
              משך: <b>{formatHM(duration)}</b> ({formatDecimalHours(duration)} שעות)
            </div>
            <div>
              שכר: <b>{formatMoney(msToHours(duration) * (rateNum || 0))}</b>
            </div>
            {overlaps.length > 0 && <div className="warn">⚠️ חופפת ל־{overlaps.length} משמרות אחרות</div>}
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

export function OverlapList({ shifts }: { shifts: Shift[] }) {
  const { service } = useData();
  return (
    <div>
      <p>המשמרת חופפת למשמרות הבאות:</p>
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
