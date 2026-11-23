import { useState } from 'react';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { SummaryCards } from '../components/SummaryCards';
import { useDialogs } from '../components/Dialogs';
import { useActiveEmployer, useData } from '../data/context';
import { inPeriod, totals } from '../domain/calc';
import { exportCsv, exportPdf, exportXlsx, type ReportInput } from '../export/report';

export function Reports() {
  const { service } = useData();
  const { toast } = useDialogs();
  const employer = useActiveEmployer();
  const [period, setPeriod] = usePeriod();
  const [includeWage, setIncludeWage] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  if (!employer) return <div className="empty">אין מעבידים עדיין.</div>;

  const shifts = service.shifts(employer.id).filter((s) => inPeriod(s, period) && s.end !== null);
  const input: ReportInput = { employer, period, shifts, includeWage };

  const run = async (kind: string, fn: () => unknown) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast('שגיאה בהפקת הקובץ', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h2>דוחות — {employer.name}</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
      <SummaryCards t={totals(shifts)} showWage={includeWage} />
      <label className="check">
        <input type="checkbox" checked={includeWage} onChange={(e) => setIncludeWage(e.target.checked)} />
        כולל חישוב שכר
      </label>
      <div className="export-buttons">
        <button className="btn primary" disabled={!!busy} onClick={() => run('pdf', () => exportPdf(input))}>
          {busy === 'pdf' ? 'מפיק…' : '📄 PDF'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => run('xlsx', () => exportXlsx(input))}>
          {busy === 'xlsx' ? 'מפיק…' : '📊 Excel (XLSX)'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => run('csv', () => exportCsv(input))}>
          📋 CSV
        </button>
      </div>
      {shifts.length === 0 && <p className="muted">אין משמרות סגורות בתקופה שנבחרה.</p>}
    </div>
  );
}
