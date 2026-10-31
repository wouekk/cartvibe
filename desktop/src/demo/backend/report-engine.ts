import { Receipt, ReceiptProduct, ReportColumn, ReportRequestCommand } from "../../open-api";
import { monthEnd, monthStart } from "./dates";
import { DemoDb } from "./db";
import { averageCents, formatCents, parseCents } from "./money";
import { filterReceipts, productsOf } from "./routes/receipts";

/**
 * A small report engine for the demo: it groups the sample receipts the way the real engine's starter reports do (by
 * category, shop, month, tag, person, health or plan) and sums, counts and averages money in whole cents. It covers the
 * report builder's common cases; the real engine's formula columns are shown as a dash.
 */

export interface ReportTable {
  title: string;
  intro: string;
  footer: string;
  header: string[];
  /** Per column: whether it holds figures (drawn right-aligned). */
  numeric: boolean[];
  rows: string[][];
  /** Rows (by index) that are subtotals or the grand total, drawn bold. */
  emphasised: number[];
  receiptCount: number;
}

interface Entry {
  receipt: Receipt;
  cents: number;
  dims: Record<string, string>;
}

const PRODUCT_DIMS = new Set(["category", "health", "planned", "tag"]);
const UNCATEGORIZED = "Uncategorized";

export function periodOf(db: DemoDb, command: ReportRequestCommand): { from: string; to: string } {
  const period = command.period;
  const today = db.today;
  switch (period?.preset) {
    case "last_month":
      return { from: monthStart(today, -1), to: monthEnd(today, -1) };
    case "mtd":
      return { from: monthStart(today), to: today };
    case "qtd": {
      const quarterFirstMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(quarterFirstMonth).padStart(2, "0")}-01`, to: today };
    }
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return { from: period.startDate?.slice(0, 10) ?? monthStart(today), to: period.endDate?.slice(0, 10) ?? today };
    default:
      return { from: monthStart(today), to: monthEnd(today) };
  }
}

function dimsFor(db: DemoDb, receipt: Receipt, product: ReceiptProduct | undefined, tag: string | undefined): Record<string, string> {
  const day = receipt.date.slice(0, 10);
  return {
    date: day,
    date_month: day.slice(0, 7),
    date_year: day.slice(0, 4),
    shop: receipt.shopName || receipt.name,
    name: receipt.name,
    status: receipt.status,
    paid_by: db.users.find((user) => user.id === receipt.paidByUserId)?.displayName ?? "",
    group: db.groups.find((group) => group.id === receipt.groupId)?.name ?? "",
    category: product ? ((db.categories.find((category) => category.id === product.categoryId)?.name ?? UNCATEGORIZED) as string) : UNCATEGORIZED,
    health: product ? product.health || "Unknown" : "Unknown",
    planned: product ? (product.planned === undefined ? "Unknown" : product.planned ? "Planned" : "Not planned") : "Unknown",
    tag: tag ?? "No tag",
  };
}

function entriesFor(db: DemoDb, receipts: Receipt[], productLevel: boolean): Entry[] {
  const entries: Entry[] = [];
  for (const receipt of receipts) {
    if (!productLevel) {
      entries.push({ receipt, cents: parseCents(receipt.amount), dims: dimsFor(db, receipt, undefined, undefined) });
      continue;
    }

    const products = productsOf(db, receipt.id);
    let accounted = 0;
    for (const product of products) {
      if (product.amount === undefined || product.amount === "") {
        continue;
      }
      const cents = parseCents(product.amount);
      accounted += cents;
      const tags = product.tags.length > 0 ? product.tags.map((tag) => tag.name) : [undefined];
      tags.forEach((tag) => entries.push({ receipt, cents, dims: dimsFor(db, receipt, product, tag) }));
    }
    const rest = parseCents(receipt.amount) - accounted;
    if (products.length === 0 || rest > 0) {
      entries.push({ receipt, cents: rest, dims: dimsFor(db, receipt, undefined, undefined) });
    }
  }
  return entries;
}

function aggregate(column: ReportColumn, entries: Entry[]): string {
  const cents = entries.map((entry) => entry.cents);
  switch (column.aggFunc) {
    case "COUNT":
      return String(new Set(entries.map((entry) => entry.receipt.id)).size);
    case "AVG":
      return formatCents(averageCents(cents.reduce((sum, value) => sum + value, 0), cents.length));
    case "MIN":
      return cents.length ? formatCents(Math.min(...cents)) : "0.00";
    case "MAX":
      return cents.length ? formatCents(Math.max(...cents)) : "0.00";
    default:
      return formatCents(cents.reduce((sum, value) => sum + value, 0));
  }
}

const label = (column: ReportColumn): string => column.label || column.name;

/** The receipts a report covers: its groups, its period (on the chosen date) and its filter. */
export function reportReceipts(db: DemoDb, command: ReportRequestCommand): Receipt[] {
  const { from, to } = periodOf(db, command);
  const groupIds = (command.groupIds ?? []).map(Number);
  const useCreatedAt = command.period?.dateField === "created_at";
  return filterReceipts(db, undefined, command.filter).filter((receipt) => {
    const day = (useCreatedAt ? (receipt.createdAt ?? receipt.date) : receipt.date).slice(0, 10);
    return (groupIds.length === 0 || groupIds.includes(receipt.groupId)) && day >= from && day <= to;
  });
}

export function runReport(db: DemoDb, command: ReportRequestCommand): ReportTable {
  const { from, to } = periodOf(db, command);
  const base = reportReceipts(db, command);

  const columns = command.columns ?? [];
  const aggregateMode = command.detail?.mode === "aggregate";
  const levels = [...(command.groupBy ?? []), ...(aggregateMode && command.detail?.by ? [command.detail.by] : [])];
  const dimensionFields = columns.filter((column) => column.kind === "dimension").map((column) => column.field ?? "");
  const productLevel = [...levels, ...dimensionFields].some((field) => PRODUCT_DIMS.has(field));
  const entries = entriesFor(db, base, productLevel);
  const period = `${from} - ${to}`;
  const fill = (text: string | undefined): string => (text ?? "").replace("{{period}}", period).replace("{{generatedAt}}", db.today);

  const table: ReportTable = {
    title: command.document?.title || command.name || "Report",
    intro: fill(command.document?.intro),
    footer: fill(command.document?.footer),
    header: [...(aggregateMode ? levels.filter((field) => !dimensionFields.includes(field)).map((field) => command.groupByLabels?.[field] ?? field) : []), ...columns.map(label)],
    numeric: [...(aggregateMode ? levels.filter((field) => !dimensionFields.includes(field)).map(() => false) : []), ...columns.map((column) => column.kind !== "dimension")],
    rows: [],
    emphasised: [],
    receiptCount: new Set(entries.map((entry) => entry.receipt.id)).size,
  };

  const cell = (column: ReportColumn, group: Entry[]): string => {
    if (column.kind === "dimension") {
      return group[0]?.dims[column.field ?? ""] ?? "";
    }
    return column.kind === "aggregate" ? aggregate(column, group) : "-";
  };

  if (!aggregateMode) {
    const sorted = [...base].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const receipt of sorted) {
      const group = entries.filter((entry) => entry.receipt.id === receipt.id);
      table.rows.push(columns.map((column) => cell(column, group)));
    }
    return table;
  }

  const leading = levels.filter((field) => !dimensionFields.includes(field));
  const buckets = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = levels.map((field) => entry.dims[field] ?? "").join("\u0000");
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  const keys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  let previousFirst: string | undefined;
  let subtotalGroup: Entry[] = [];
  const flushSubtotal = (): void => {
    if (command.subtotals && levels.length > 1 && subtotalGroup.length > 0) {
      table.rows.push([...leading.map((_, index) => (index === 0 ? `Total ${previousFirst}` : "")), ...columns.map((column) => (column.kind === "aggregate" ? aggregate(column, subtotalGroup) : ""))]);
      table.emphasised.push(table.rows.length - 1);
    }
    subtotalGroup = [];
  };

  for (const key of keys) {
    const group = buckets.get(key) ?? [];
    const first = key.split("\u0000")[0];
    if (previousFirst !== undefined && first !== previousFirst) {
      flushSubtotal();
    }
    previousFirst = first;
    subtotalGroup.push(...group);
    table.rows.push([...leading.map((field) => group[0].dims[field] ?? ""), ...columns.map((column) => cell(column, group))]);
  }
  flushSubtotal();

  if (command.grandTotals && entries.length > 0) {
    table.rows.push([...leading.map((_, index) => (index === 0 ? "Total" : "")), ...columns.map((column) => (column.kind === "aggregate" ? aggregate(column, entries) : ""))]);
    table.emphasised.push(table.rows.length - 1);
  }

  return table;
}

const escapeHtml = (text: string): string => text.replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char] ?? char);

/**
 * The preview document. It is rendered in a sandboxed iframe of its own, so it carries its own plain colours and does
 * not follow the app's theme (a report is paper too).
 */
export function reportHtml(table: ReportTable): string {
  const head = table.header.map((text, i) => `<th class="${table.numeric[i] ? "num" : ""}">${escapeHtml(text)}</th>`).join("");
  const body = table.rows
    .map((row, index) => `<tr${table.emphasised.includes(index) ? ' class="total"' : ""}>${row.map((text, i) => `<td class="${table.numeric[i] ? "num" : ""}">${escapeHtml(text)}</td>`).join("")}</tr>`)
    .join("");

  return (
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{font-family:system-ui,sans-serif;color:#1a1a1a;margin:16px;font-size:13px}` +
    `h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 12px}` +
    `table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;border-bottom:1px solid #e4e4e7;text-align:left}` +
    `th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}td.num,th.num{text-align:right}` +
    `tr.total td{font-weight:700;background:#f4f4f5}.foot{margin-top:12px;font-size:11px;color:#777}` +
    `</style></head><body><h1>${escapeHtml(table.title)}</h1>` +
    (table.intro ? `<p>${escapeHtml(table.intro)}</p>` : "") +
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    (table.footer ? `<div class="foot">${escapeHtml(table.footer)}</div>` : "") +
    `</body></html>`
  );
}

