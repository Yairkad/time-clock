import { useEffect, useState } from 'react';

/** Parses "8", "830", "0830", "8:30", "08:30" into "HH:MM" (24h), or null if invalid. */
export function parseTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let h: number, m: number;
  if (raw.includes(':')) {
    const [a, b = ''] = raw.split(':');
    h = Number(a.replace(/\D/g, ''));
    m = Number(b.replace(/\D/g, '') || 0);
  } else if (digits.length <= 2) {
    h = Number(digits);
    m = 0;
  } else {
    h = Number(digits.slice(0, digits.length - 2));
    m = Number(digits.slice(-2));
  }
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formats while typing: digits only, colon inserted after the hours. */
function mask(raw: string): string {
  if (raw.includes(':')) return raw.replace(/[^\d:]/g, '').slice(0, 5);
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/** 24-hour time field ("HH:MM"), independent of the device's AM/PM setting. */
export function TimeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = text === '' || parseTime(text) !== null || parseTime(text.replace(/\D/g, '')) !== null;
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      placeholder="00:00"
      maxLength={5}
      className={valid ? 'time-input' : 'time-input invalid'}
      value={text}
      onChange={(e) => {
        const t = mask(e.target.value);
        setText(t);
        // Commit only a complete HH:MM while typing; partial input is resolved on blur.
        onChange(/^\d{2}:\d{2}$/.test(t) ? parseTime(t) ?? '' : '');
      }}
      onBlur={() => {
        // "8" -> 08:00, "83:0" (typed 830) -> 08:30
        const parsed = parseTime(text) ?? parseTime(text.replace(/\D/g, ''));
        if (parsed) {
          setText(parsed);
          onChange(parsed);
        }
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}
