import { formatDecimalHours, formatHM, formatMoney, type Totals } from '../domain/calc';

/** One-line period summary: hours · work days · wage. */
export function SummaryLine({
  t, showWage = true, showDays = true, label = 'סה"כ',
}: { t: Totals; showWage?: boolean; showDays?: boolean; label?: string }) {
  return (
    <div className="summary-line">
      <span>
        {label} <b>{formatHM(t.ms)}</b> שעות <span className="muted">({formatDecimalHours(t.ms)})</span>
      </span>
      {showDays && <span>· {t.days} ימי עבודה</span>}
      {showWage && (
        <span>
          · <b>{formatMoney(t.wage)}</b>
        </span>
      )}
    </div>
  );
}
