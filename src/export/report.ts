import { saveFile } from '../native/files';
import {
  formatDate, formatDecimalHours, formatHM, formatMoney, groupByDay, periodLabel, toDateKey, toTimeStr, totals,
  weekdayHe,
} from '../domain/calc';
import type { Employer, Period, Shift } from '../domain/types';

export interface ReportInput {
  employer: Employer;
  period: Period;
  /** Closed shifts in the period. */
  shifts: Shift[];
  includeWage: boolean;
  /** true: every start/end entry; false: one row per day. */
  detailed: boolean;
}

type Cell = string | number;
type Col = { title: string; kind?: 'decimal' | 'money' | 'strong' };
interface Table {
  cols: Col[];
  rows: Cell[][];
  /** Row starts a new day (for the PDF divider). */
  dayStart: boolean[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The report table, in detailed (entry) or daily-summary form. */
export function reportTable(input: ReportInput): Table {
  const w = input.includeWage;
  const grouped = groupByDay(input.shifts.filter((s) => s.end !== null), 'asc');
  if (!input.detailed) {
    const days = grouped.filter((g) => g.dayTotalMs !== undefined);
    return {
      cols: [
        { title: 'תאריך' }, { title: 'יום' }, { title: 'סה"כ שעות', kind: 'strong' }, { title: 'שעות עשרוניות', kind: 'decimal' },
        ...(w ? [{ title: 'שכר', kind: 'money' } as Col] : []),
      ],
      rows: days.map((g) => [
        formatDate(g.shift.start), weekdayHe(g.shift.start), formatHM(g.dayTotalMs!), Number(formatDecimalHours(g.dayTotalMs!)),
        ...(w ? [round2(g.dayWage!)] : []),
      ]),
      dayStart: days.map(() => true),
    };
  }
  return {
    cols: [
      { title: 'תאריך' }, { title: 'התחלה' }, { title: 'סיום' }, { title: 'סה"כ ליום', kind: 'strong' },
      { title: 'שעות עשרוניות', kind: 'decimal' }, ...(w ? [{ title: 'שכר ליום', kind: 'money' } as Col] : []),
    ],
    rows: grouped.map(({ shift: s, firstOfDay, dayTotalMs, dayWage }) => [
      firstOfDay ? `${weekdayHe(s.start)} ${formatDate(s.start)}` : '',
      toTimeStr(s.start),
      toTimeStr(s.end!) + (toDateKey(s.end! - 1) !== toDateKey(s.start) ? ' (+1)' : ''),
      dayTotalMs !== undefined ? formatHM(dayTotalMs) : '',
      dayTotalMs !== undefined ? Number(formatDecimalHours(dayTotalMs)) : '',
      ...(w ? [dayWage !== undefined ? round2(dayWage) : ''] : []),
    ]),
    dayStart: grouped.map((g) => g.firstOfDay),
  };
}

export function fileBase(input: ReportInput) {
  const safe = input.employer.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'report';
  return `${safe}_${input.period.from}_${input.period.to}`;
}

export function download(blob: Blob, filename: string) {
  return saveFile(blob, filename);
}

function sheetRows(input: ReportInput): Cell[][] {
  const t = reportTable(input);
  return [t.cols.map((c) => c.title), ...t.rows];
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

export async function exportCsv(input: ReportInput) {
  const lines = [
    ...headerRows(input),
    [],
    ...sheetRows(input),
    [],
    ...summaryRows(input),
  ].map((r) => r.map(csvCell).join(','));
  // UTF-8 BOM so Excel detects Hebrew correctly.
  await download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase(input)}.csv`);
}

export async function exportXlsx(input: ReportInput) {
  const XLSX = await import('xlsx');
  const aoa = [...headerRows(input), [], ...sheetRows(input), [], ...summaryRows(input)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = reportTable(input).cols.map(() => ({ wch: 15 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'דוח שעות');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await download(
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
  const table = reportTable(input);
  const rows = table.rows.map((cells, i) => ({ cells, dayStart: table.dayStart[i] }));
  const t = totals(input.shifts);
  const w = input.includeWage;
  const fmt = (v: Cell, col: Col) => {
    if (v === '') return '';
    if (col.kind === 'money') return esc(formatMoney(Number(v)));
    if (col.kind === 'decimal') return Number(v).toFixed(2);
    if (col.kind === 'strong') return `<b>${esc(v)}</b>`;
    return esc(v);
  };
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
        <thead><tr>${table.cols.map((c) => `<th>${esc(c.title)}</th>`).join('')}</tr></thead>
        <tbody>
          ${chunk.map((r) => `<tr class="${r.dayStart ? 'day-start' : ''}">
            ${r.cells.map((v, ci) => `<td>${fmt(v, table.cols[ci])}</td>`).join('')}
          </tr>`).join('')}
          ${chunk.length === 0 ? `<tr><td colspan="${table.cols.length}">אין רישומים בתקופה</td></tr>` : ''}
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
    await download(pdf.output('blob'), `${fileBase(input)}.pdf`);
  } finally {
    host.remove();
  }
}
