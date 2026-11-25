import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { useState } from 'react';
import { periodLabel } from '../domain/calc';
import type { Employer, Period, Shift } from '../domain/types';
import { exportCsv, exportPdf, exportXlsx, type ReportInput } from '../export/report';
import { Modal, useDialogs } from './Dialogs';

/** Export the journal's current period as PDF / Excel / CSV. */
export function ExportDialog({ employer, period, shifts, onClose }: {
  employer: Employer; period: Period; shifts: Shift[]; onClose: () => void;
}) {
  const { toast } = useDialogs();
  const [includeWage, setIncludeWage] = useState(true);
  const [detailed, setDetailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const closed = shifts.filter((s) => s.end !== null);
  const input: ReportInput = { employer, period, shifts: closed, includeWage, detailed };

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
    <Modal title="ייצוא דוח" onClose={onClose}>
      <p className="muted">
        {employer.name} · {periodLabel(period)} · {closed.length} רישומים
      </p>
      <label className="check">
        <input type="checkbox" checked={includeWage} onChange={(e) => setIncludeWage(e.target.checked)} />
        כולל חישוב שכר
      </label>
      <label className="check">
        <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
        כולל פירוט כניסה/יציאה
      </label>
      <p className="muted small-text">{detailed ? 'כל רישום בשורה, עם סה"כ ליום.' : 'שורה אחת לכל יום: סה"כ שעות.'}</p>
      <div className="export-buttons">
        <button className="btn primary" disabled={!!busy} onClick={() => run('pdf', () => exportPdf(input))}>
          <FileText size={18} /> {busy === 'pdf' ? 'מפיק…' : 'PDF'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => run('xlsx', () => exportXlsx(input))}>
          <FileSpreadsheet size={18} /> {busy === 'xlsx' ? 'מפיק…' : 'Excel'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => run('csv', () => exportCsv(input))}>
          <Sheet size={18} /> CSV
        </button>
      </div>
    </Modal>
  );
}
