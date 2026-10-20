/**
 * Multi-year export for the Dashboard (a range over a year is not drawn as bars): a CSV of the months and
 * a print view with one calendar year per landscape page. Pure functions; the component fetches the data.
 */

/** Most months the Dashboard chart draws. */
export const MAX_CHART_MONTHS = 12;

export interface YearChunk {
  /** The calendar year, "2026". */
  label: string;
  from: string;
  to: string;
}

export interface MonthRow {
  /** "yyyy-MM". */
  month: string;
  total: number;
}

export interface PrintCategory {
  name: string;
  total: string;
}

export interface PrintYear {
  label: string;
  total: string;
  months: { name: string; total: number; text: string }[];
  categories: PrintCategory[];
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthIndex(day: string): number {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

/** Calendar months a range touches, first and last included. */
export function monthsSpanned(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from) + 1;
}

/** Whole days between two "yyyy-MM-dd" days, first and last included. */
function daysSpanned(from: string, to: string): number {
  const toUtc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}

/** True when a range is longer than a year, so it is exported instead of drawn. */
export function exceedsOneYear(from: string, to: string): boolean {
  return monthsSpanned(from, to) > MAX_CHART_MONTHS && daysSpanned(from, to) > 366;
}

/** The range cut at calendar years: 2024-03-10..2026-02-01 is 2024 (from March 10), 2025, 2026 (to Feb 1). */
export function splitIntoYears(from: string, to: string): YearChunk[] {
  const chunks: YearChunk[] = [];
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year++) {
    chunks.push({
      label: String(year),
      from: year === firstYear ? from : `${year}-01-01`,
      to: year === lastYear ? to : `${year}-12-31`,
    });
  }
  return chunks;
}

/** The "yyyy-MM" months from a range's first to its last, so months without spending are still listed. */
export function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let index = monthIndex(from); index <= monthIndex(to); index++) {
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Month, Total Spent, Goal, Difference (spent minus goal, so positive is over). Plain dot decimals, so a
 * spreadsheet reads them whatever the app's currency display is. Goal and Difference are empty without a goal.
 */
export function buildMonthlyCsv(rows: MonthRow[], goal: number): string {
  const hasGoal = goal > 0;
  const lines = ["Month,Total Spent,Goal,Difference"];
  for (const row of rows) {
    lines.push(
      [
        csvField(row.month),
        row.total.toFixed(2),
        hasGoal ? goal.toFixed(2) : "",
        hasGoal ? (row.total - goal).toFixed(2) : "",
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Oct" for "2026-10". */
export function shortMonthName(month: string): string {
  return SHORT_MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

const PRINT_STYLES = `
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #1e293b; }
header { margin-bottom: 8mm; }
header h1 { margin: 0; font-size: 20px; }
header p { margin: 2px 0 0; color: #64748b; font-size: 12px; }
.page { break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
h2 { display: flex; justify-content: space-between; font-size: 18px; margin: 0 0 6mm; }
h2 span { font-weight: 600; }
h3 { font-size: 14px; margin: 8mm 0 3mm; }
.chart { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px; height: 85mm; }
.col { display: flex; flex-direction: column; min-width: 0; }
.val { font-size: 10px; font-weight: 600; text-align: center; white-space: nowrap; height: 14px; }
.val.zero { color: #94a3b8; font-weight: 400; }
.plot { flex: 1; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid #cbd5e1; }
.bar { width: 60%; max-width: 28px; background: #0086d4; border-radius: 3px 3px 0 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.lab { font-size: 11px; text-align: center; color: #475569; padding-top: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
td { padding: 3px 0; border-bottom: 1px solid #e2e8f0; }
td.num { text-align: right; }
.muted { color: #64748b; font-size: 12px; }
`;

/** The print document: A4 landscape, one year per page (bars, monthly totals, categories). */
export function buildPrintHtml(title: string, subtitle: string, years: PrintYear[]): string {
  const pages = years
    .map((year) => {
      const tallest = Math.max(0, ...year.months.map((month) => month.total));
      const columns = year.months
        .map((month) => {
          const height = tallest > 0 && month.total > 0 ? Math.max(2, Math.round((month.total / tallest) * 100)) : 0;
          return (
            `<div class="col"><div class="val${month.total > 0 ? "" : " zero"}">${escapeHtml(month.text)}</div>` +
            `<div class="plot"><div class="bar" style="height:${height}%"></div></div>` +
            `<div class="lab">${escapeHtml(month.name)}</div></div>`
          );
        })
        .join("");
      const categories = year.categories
        .map((category) => `<tr><td>${escapeHtml(category.name)}</td><td class="num">${escapeHtml(category.total)}</td></tr>`)
        .join("");

      return (
        `<section class="page"><h2>${escapeHtml(year.label)} <span>${escapeHtml(year.total)}</span></h2>` +
        `<div class="chart">${columns}</div><h3>Spending by category</h3>` +
        (categories ? `<table>${categories}</table>` : `<p class="muted">No spending this year.</p>`) +
        `</section>`
      );
    })
    .join("");

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head>` +
    `<body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header>${pages}</body></html>`
  );
}
