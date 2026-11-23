import {
  formatDate, formatDecimalHours, formatHM, formatMoney, groupByDay, periodLabel, toDateKey, toTimeStr, totals,
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
  return groupByDay(input.shifts.filter((s) => s.end !== null), 'asc').map(({ shift: s, firstOfDay, dayTotalMs, dayWage }) => ({
    date: firstOfDay ? formatDate(s.start) : '',
    start: toTimeStr(s.start),
    end: toTimeStr(s.end!) + (toDateKey(s.end! - 1) !== toDateKey(s.start) ? ' (+1)' : ''),
    dayTotal: dayTotalMs !== undefined ? formatHM(dayTotalMs) : '',
    dayDecimal: dayTotalMs !== undefined ? Number(formatDecimalHours(dayTotalMs)) : '',
    dayWage: dayWage !== undefined ? Math.round(dayWage * 100) / 100 : '',
  }));
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

const HEADERS = (w: boolean) => ['תאריך', 'התחלה', 'סיום', 'סה"כ ליום', 'שעות עשרוניות', ...(w ? ['שכר ליום'] : [])];

function tableRows(input: ReportInput): (string | number)[][] {
  return reportRows(input).map((r) => [
    r.date, r.start, r.end, r.dayTotal, r.dayDecimal, ...(input.includeWage ? [r.dayWage] : []),
  ]);
}

function summaryRows(input: ReportInput): (string | number)[][] {
  const t = totals(input.shifts);
  return [
    ['ימי עבודה', t.days],
    ['סך שעות', formatHM(t.ms)],
    ['סך שעות עשרוניות', Number(formatDecimalHours(t.ms))],
    ...(input.includeWage ? [['סך לתשלום', Math.round(t.wage * 100) / 100]] : []),
  ];
}

function headerRows(input: ReportInput): (string | number)[][] {
  return [
    ['מעסיק', input.employer.name],
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
  ws['!cols'] = HEADERS(input.includeWage).map(() => ({ wch: 14 }));
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
          <tr><th>מעסיק</th><td>${esc(input.employer.name)}</td></tr>
          <tr><th>עובד</th><td>${esc(input.employer.employeeName || '—')}</td></tr>
          <tr><th>תקופה</th><td>${esc(periodLabel(input.period))}</td></tr>
        </table>` : ''}
      <table class="pdf-table">
        <thead><tr>
          <th>תאריך</th><th>התחלה</th><th>סיום</th><th>סה"כ ליום</th><th>עשרוני</th>
          ${w ? '<th>שכר ליום</th>' : ''}
        </tr></thead>
        <tbody>
          ${chunk.map((r) => `<tr class="${r.date ? 'day-start' : ''}">
            <td>${esc(r.date)}</td><td>${esc(r.start)}</td><td>${esc(r.end)}</td>
            <td><b>${esc(r.dayTotal)}</b></td><td>${typeof r.dayDecimal === 'number' ? r.dayDecimal.toFixed(2) : ''}</td>
            ${w ? `<td>${typeof r.dayWage === 'number' ? esc(formatMoney(r.dayWage)) : ''}</td>` : ''}
          </tr>`).join('')}
          ${chunk.length === 0 ? `<tr><td colspan="${w ? 6 : 5}">אין רישומים בתקופה</td></tr>` : ''}
        </tbody>
      </table>
      ${last ? `
        <table class="pdf-summary">
          <tr><th>ימי עבודה</th><td>${t.days}</td></tr>
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
    download(pdf.output('blob'), `${fileBase(input)}.pdf`);
  } finally {
    host.remove();
  }
}
