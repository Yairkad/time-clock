import { formatDecimalHours, formatHM, formatMoney, type Totals } from '../domain/calc';

export function SummaryCards({ t, showWage = true }: { t: Totals; showWage?: boolean }) {
  return (
    <div className="cards">
      <div className="card stat">
        <div className="stat-label">משמרות</div>
        <div className="stat-value">{t.count}</div>
      </div>
      <div className="card stat">
        <div className="stat-label">שעות</div>
        <div className="stat-value">{formatHM(t.ms)}</div>
        <div className="stat-sub">{formatDecimalHours(t.ms)} שעות</div>
      </div>
      {showWage && (
        <div className="card stat">
          <div className="stat-label">שכר</div>
          <div className="stat-value">{formatMoney(t.wage)}</div>
        </div>
      )}
    </div>
  );
}
