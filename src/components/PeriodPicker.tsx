import { useState } from 'react';
import { currentMonthPeriod, monthPeriod, periodLabel, previousMonthPeriod } from '../domain/calc';
import type { Period } from '../domain/types';

type Mode = 'current' | 'previous' | 'month' | 'range';

export function usePeriod() {
  return useState<Period>(() => currentMonthPeriod());
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const cur = currentMonthPeriod();
  const prev = previousMonthPeriod();
  const initialMode: Mode =
    value.from === cur.from && value.to === cur.to ? 'current' : value.from === prev.from && value.to === prev.to ? 'previous' : 'range';
  const [mode, setMode] = useState<Mode>(initialMode);

  const pick = (m: Mode) => {
    setMode(m);
    if (m === 'current') onChange(cur);
    if (m === 'previous') onChange(prev);
  };

  return (
    <div className="period">
      <div className="segmented">
        {([
          ['current', 'החודש'],
          ['previous', 'חודש קודם'],
          ['month', 'בחירת חודש'],
          ['range', 'טווח'],
        ] as [Mode, string][]).map(([m, label]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => pick(m)}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'month' && (
        <input
          type="month"
          value={value.from.slice(0, 7)}
          onChange={(e) => {
            if (!e.target.value) return;
            const [y, m] = e.target.value.split('-').map(Number);
            onChange(monthPeriod(y, m - 1));
          }}
        />
      )}
      {mode === 'range' && (
        <div className="range">
          <label>
            מתאריך
            <input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          </label>
          <label>
            עד תאריך
            <input type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}
      <div className="period-label">{periodLabel(value)}</div>
    </div>
  );
}
