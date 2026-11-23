import {
  durationMs, formatDate, formatDecimalHours, formatHM, formatMoney, msToHours, periodLabel, toDateKey, toTimeStr,
  totals, wage,
} from '../domain/calc';
import type { Employer, Period, Shift } from '../domain/types';

export interface ReportInput {
  employer: Employer;
  period: Period;
  /** Closed shifts in the period. */
  shifts: Shift[];
  includeWage: boolean;
}

export function reportRows(input: ReportInput) {
  return [...input.shifts]
    .filter((s) => s.end !== null)
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const ms = durationMs(s);
      return {
        date: formatDate(s.start),
        dateKey: toDateKey(s.start),
        start: toTimeStr(s.start),
        end: toTimeStr(s.end!) + (toDateKey(s.end!) !== toDateKey(s.start) ? ' (+1)' : ''),
        duration: formatHM(ms),
        decimal: Number(formatDecimalHours(ms)),
        hours: msToHours(ms),
        rate: s.rate,
        wage: Math.round(wage(s) * 100) / 100,
        note: s.note ?? '',
      };
    });
}

export function fileBase(input: ReportInput) {
  const safe = input.employer.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'report';
  return `${safe}_${input.period.from}_${input.period.to}`;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const HEADERS = (w: boolean) => ['תאריך', 'כניסה', 'יציאה', 'משך', 'שעות עשרוניות', ...(w ? ['תעריף', 'שכר'] : []), 'הערה'];

function tableRows(input: ReportInput): (string | number)[][] {
  return reportRows(input).map((r) => [
    r.date, r.start, r.end, r.duration, r.decimal, ...(input.includeWage ? [r.rate, r.wage] : []), r.note,
  ]);
}

function summaryRows(input: ReportInput): (string | number)[][] {
  const t = totals(input.shifts);
  return [
    ['מספר משמרות', t.count],
    ['סך שעות', formatHM(t.ms)],
    ['סך שעות עשרוניות', Number(formatDecimalHours(t.ms))],
    ...(input.includeWage ? [['סך לתשלום', Math.round(t.wage * 100) / 100]] : []),
  ];
}

function headerRows(input: ReportInput): (string | number)[][] {
  return [
    ['מעביד', input.employer.name],
    ['עובד', input.employer.employeeName],
    ['תקופה', periodLabel(input.period)],
  ];
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(input: ReportInput) {
  const lines = [
    ...headerRows(input),
    [],
    HEADERS(input.includeWage),
    ...tableRows(input),
    [],
    ...summaryRows(input),
  ].map((r) => r.map(csvCell).join(','));
  // UTF-8 BOM so Excel detects Hebrew correctly.
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase(input)}.csv`);
}

export async function exportXlsx(input: ReportInput) {
  const XLSX = await import('xlsx');
  const aoa = [...headerRows(input), [], HEADERS(input.includeWage), ...tableRows(input), [], ...summaryRows(input)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = HEADERS(input.includeWage).map((h) => ({ wch: h === 'הערה' ? 24 : 14 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'דוח שעות');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(input)}.xlsx`,
  );
}

const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ROWS_FIRST_PAGE = 22;
const ROWS_PER_PAGE = 30;

/** Builds printable A4 page elements (RTL HTML) for the report. */
function buildPages(input: ReportInput): HTMLElement[] {
  const rows = reportRows(input);
  const t = totals(input.shifts);
  const w = input.includeWage;
  const chunks: typeof rows[] = [];
  let i = 0;
  chunks.push(rows.slice(0, ROWS_FIRST_PAGE));
  i = ROWS_FIRST_PAGE;
  while (i < rows.length) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
    i += ROWS_PER_PAGE;
  }
  const generated = new Date();
  return chunks.map((chunk, idx) => {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    const last = idx === chunks.length - 1;
    page.innerHTML = `
      ${idx === 0 ? `
        <h1>דוח שעות עבודה</h1>
        <table class="pdf-meta">
          <tr><th>מעביד</th><td>${esc(input.employer.name)}</td></tr>
          <tr><th>עובד</th><td>${esc(input.employer.employeeName || '—')}</td></tr>
          <tr><th>תקופה</th><td>${esc(periodLabel(input.period))}</td></tr>
        </table>` : ''}
      <table class="pdf-table">
        <thead><tr>
          <th>תאריך</th><th>כניסה</th><th>יציאה</th><th>משך</th><th>עשרוני</th>
          ${w ? '<th>תעריף</th><th>שכר</th>' : ''}
        </tr></thead>
        <tbody>
          ${chunk.map((r) => `<tr>
            <td>${esc(r.date)}</td><td>${esc(r.start)}</td><td>${esc(r.end)}</td>
            <td>${esc(r.duration)}</td><td>${r.decimal.toFixed(2)}</td>
            ${w ? `<td>${esc(formatMoney(r.rate))}</td><td>${esc(formatMoney(r.wage))}</td>` : ''}
          </tr>`).join('')}
          ${chunk.length === 0 ? `<tr><td colspan="${w ? 7 : 5}">אין משמרות בתקופה</td></tr>` : ''}
        </tbody>
      </table>
      ${last ? `
        <table class="pdf-summary">
          <tr><th>מספר משמרות</th><td>${t.count}</td></tr>
          <tr><th>סך שעות</th><td>${formatHM(t.ms)}</td></tr>
          <tr><th>סך שעות עשרוניות</th><td>${formatDecimalHours(t.ms)}</td></tr>
          ${w ? `<tr class="total"><th>סך לתשלום</th><td>${esc(formatMoney(t.wage))}</td></tr>` : ''}
        </table>` : ''}
      <div class="pdf-footer">
        <span>הופק ב־${formatDate(generated.getTime())} ${toTimeStr(generated.getTime())}</span>
        <span>עמוד ${idx + 1} מתוך ${chunks.length}</span>
      </div>`;
    return page;
  });
}

/**
 * Generates a PDF by rendering RTL HTML pages to canvas, which keeps
 * Hebrew shaping and direction correct without embedding fonts.
 */
export async function exportPdf(input: ReportInput) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const host = document.createElement('div');
  host.className = 'pdf-host';
  document.body.appendChild(host);
  try {
    const pages = buildPages(input);
    pages.forEach((p) => host.appendChild(p));
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff' });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
    pdf.save(`${fileBase(input)}.pdf`);
  } finally {
    host.remove();
  }
}
