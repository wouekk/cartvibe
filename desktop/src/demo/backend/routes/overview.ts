import {
  GroupOverview,
  GroupOverviewCategory,
  GroupOverviewMonth,
  GroupOverviewProduct,
  GroupOverviewTag,
  Receipt,
  ReceiptProduct,
} from "../../../open-api";
import { addDays, daysBetween, monthEnd, monthKey, monthStart, parseDay } from "../dates";
import { DemoDb } from "../db";
import { DemoContext, badRequest, idParam } from "../http";
import { DemoRouter } from "../router";
import { formatCents, parseCents } from "../money";
import { productsOf } from "./receipts";

const OVERVIEW_MONTHS = 6;
const MAX_TREND_MONTHS = 24;
const DAILY_TREND_BELOW_DAYS = 28;
const MAX_PERIOD_DAYS = 366 * 5;
const UNCATEGORIZED = "Uncategorized";

interface Period {
  from: string;
  to: string;
}

const days = (period: Period): number => daysBetween(period.from, period.to) + 1;

const contains = (period: Period, day: string): boolean => day >= period.from && day <= period.to;

/** The period compared with: the same number of whole months right before a whole-month period, else the same days. */
function previousOf(period: Period): Period {
  const first = parseDay(period.from);
  const last = parseDay(period.to);
  const wholeMonth = first.getUTCDate() === 1 && monthEnd(period.to) === period.to;
  if (wholeMonth) {
    const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
    return { from: monthStart(period.from, -months), to: addDays(period.from, -1) };
  }

  const to = addDays(period.from, -1);
  return { from: addDays(to, -(days(period) - 1)), to };
}

function resolvePeriod(db: DemoDb, query: URLSearchParams): Period | string {
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  if (from || to) {
    const valid = /^\d{4}-\d{2}-\d{2}$/;
    if (!valid.test(from) || !valid.test(to) || to < from || days({ from, to }) > MAX_PERIOD_DAYS) {
      return "from and to must both be yyyy-MM-dd days, from on or before to, at most five years apart";
    }
    return { from, to };
  }

  const month = query.get("month") ?? "";
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return "month must be formatted yyyy-MM";
  }
  const start = month ? `${month}-01` : monthStart(db.today);
  return { from: start, to: monthEnd(start) };
}

function receiptsFor(db: DemoDb, groupId: number): Receipt[] {
  return db.receipts.filter((receipt) => receipt.groupId === groupId || !db.groups.some((group) => group.id === groupId));
}

const dayOfReceipt = (receipt: Receipt): string => receipt.date.slice(0, 10);

const pricedProducts = (db: DemoDb, ids: Set<number>): ReceiptProduct[] =>
  db.products.filter((product) => ids.has(product.receiptId) && product.amount !== undefined && product.amount !== "");

function categoryName(db: DemoDb, product: ReceiptProduct): { id?: number; name: string } {
  if (product.categoryId !== undefined) {
    const found = db.categories.find((category) => category.id === product.categoryId);
    if (found) {
      return { id: found.id, name: found.name ?? "" };
    }
  }
  const label = (product.categoryId === undefined ? product.foodGroup : "").trim();
  return { name: label ? label.replace(/\b\w/g, (letter) => letter.toUpperCase()) : UNCATEGORIZED };
}

/**
 * The API's receiptsource.AllocateToReceipt in cents: lines that fit inside the receipt keep their amounts and leave a
 * rest; otherwise the receipt is divided in proportion to the lines (largest remainder, ties to the earlier line) and
 * nothing is left.
 */
export function allocateToReceipt(amount: number, lines: number[]): { shares: number[]; rest: number } {
  const sum = lines.reduce((total, line) => total + line, 0);
  if (sum === 0 || (Math.sign(sum) === Math.sign(amount) && Math.abs(sum) <= Math.abs(amount))) {
    return { shares: [...lines], rest: amount - sum };
  }

  const parts = lines.map((line) => {
    const exact = (amount * line) / sum;
    const whole = Math.trunc(exact);
    return { whole, residual: Math.abs(exact - whole) };
  });
  let left = amount - parts.reduce((total, part) => total + part.whole, 0);
  const step = Math.sign(left);
  const order = parts.map((_, index) => index).sort((a, b) => parts[b].residual - parts[a].residual || a - b);
  for (const index of order) {
    if (left === 0) {
      break;
    }
    parts[index].whole += step;
    left -= step;
  }
  return { shares: parts.map((part) => part.whole), rest: 0 };
}

function sumCategories(db: DemoDb, receipts: Receipt[]): GroupOverviewCategory[] {
  const totals = new Map<string, { id?: number; name: string; cents: number }>();
  const add = (id: number | undefined, name: string, cents: number): void => {
    const key = `${id ?? 0}:${name}`;
    const row = totals.get(key) ?? { id, name, cents: 0 };
    row.cents += cents;
    totals.set(key, row);
  };

  for (const receipt of receipts) {
    const priced = productsOf(db, receipt.id).filter((product) => product.amount !== undefined && product.amount !== "");
    const { shares, rest } = allocateToReceipt(
      parseCents(receipt.amount),
      priced.map((product) => parseCents(product.amount))
    );
    priced.forEach((product, index) => {
      const { id, name } = categoryName(db, product);
      add(id, name, shares[index]);
    });
    // What the lines do not cover (a refund's rest may be negative) or a receipt with no lines is Uncategorized, so
    // the slices always add up to the total, as on the real Dashboard.
    if (priced.length === 0 || rest !== 0) {
      add(undefined, UNCATEGORIZED, rest);
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .map((row) => ({ ...(row.id === undefined ? {} : { categoryId: row.id }), name: row.name, total: formatCents(row.cents) }));
}

function sumTags(db: DemoDb, receipts: Receipt[], period: Period, previous: Period): GroupOverviewTag[] {
  const inPeriod = (range: Period): Set<number> =>
    new Set(receipts.filter((receipt) => contains(range, dayOfReceipt(receipt))).map((receipt) => receipt.id));
  const current = pricedProducts(db, inPeriod(period));
  const before = pricedProducts(db, inPeriod(previous));
  const tagTotal = (products: ReceiptProduct[], tagId: number): number =>
    products.filter((product) => product.tags.some((tag) => tag.id === tagId)).reduce((sum, product) => sum + parseCents(product.amount), 0);

  return db.tags
    .filter((tag) => tag.showOnDashboard)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => ({
      tagId: tag.id ?? 0,
      name: tag.name,
      total: formatCents(tagTotal(current, tag.id ?? 0)),
      previousTotal: formatCents(tagTotal(before, tag.id ?? 0)),
    }));
}

function overviewFor(db: DemoDb, groupId: number, period: Period): GroupOverview {
  const previous = previousOf(period);
  const receipts = receiptsFor(db, groupId);
  const endMonth = monthStart(period.to);
  const spanned =
    (parseDay(period.to).getUTCFullYear() - parseDay(period.from).getUTCFullYear()) * 12 +
    parseDay(period.to).getUTCMonth() -
    parseDay(period.from).getUTCMonth() +
    1;
  const trendCount = Math.min(Math.max(spanned, OVERVIEW_MONTHS), MAX_TREND_MONTHS);
  const trendStart = monthStart(endMonth, -(trendCount - 1));

  // Every month of the trend starts at zero, so a month with no receipts is a zero bar, not a gap.
  const monthTotals = new Map<string, number>();
  for (let index = 0; index < trendCount; index++) {
    monthTotals.set(monthKey(monthStart(trendStart, index)), 0);
  }

  const daily = days(period) < DAILY_TREND_BELOW_DAYS;
  const dayTotals = new Map<string, number>();
  if (daily) {
    for (let index = 0; index < days(period); index++) {
      dayTotals.set(addDays(period.from, index), 0);
    }
  }

  let total = 0;
  let previousTotal = 0;
  let receiptCount = 0;
  let previousReceiptCount = 0;
  let openReceiptCount = 0;
  const inPeriod: Receipt[] = [];
  const inPrevious: Receipt[] = [];

  for (const receipt of receipts) {
    const day = dayOfReceipt(receipt);
    const cents = parseCents(receipt.amount);
    if (monthTotals.has(monthKey(day))) {
      monthTotals.set(monthKey(day), (monthTotals.get(monthKey(day)) ?? 0) + cents);
    }
    if (contains(previous, day)) {
      previousTotal += cents;
      previousReceiptCount++;
      inPrevious.push(receipt);
    }
    if (!contains(period, day)) {
      continue;
    }
    total += cents;
    receiptCount++;
    inPeriod.push(receipt);
    if (daily) {
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + cents);
    }
    // What a household reads as "To check".
    if (receipt.status === "OPEN") {
      openReceiptCount++;
    }
  }

  const sumOf = (list: Receipt[], keep: (product: ReceiptProduct) => boolean): string =>
    formatCents(
      pricedProducts(db, new Set(list.map((receipt) => receipt.id)))
        .filter(keep)
        .reduce((sum, product) => sum + parseCents(product.amount), 0),
    );
  const unhealthy = (product: ReceiptProduct): boolean => product.health === "UNHEALTHY";
  const unplanned = (product: ReceiptProduct): boolean => product.planned === false;

  const months: GroupOverviewMonth[] = [];
  for (let index = 0; index < OVERVIEW_MONTHS; index++) {
    const key = monthKey(monthStart(endMonth, index - (OVERVIEW_MONTHS - 1)));
    months.push({ month: key, total: formatCents(monthTotals.get(key) ?? 0) });
  }

  const trend: GroupOverviewMonth[] = daily
    ? [...dayTotals.entries()].map(([day, cents]) => ({ month: day, total: formatCents(cents) }))
    : [...monthTotals.entries()].map(([key, cents]) => ({ month: key, total: formatCents(cents) }));

  return {
    month: monthKey(period.from),
    from: period.from,
    to: period.to,
    previousFrom: previous.from,
    previousTo: previous.to,
    total: formatCents(total),
    previousTotal: formatCents(previousTotal),
    receiptCount,
    previousReceiptCount,
    openReceiptCount,
    warrantyCount: receipts.filter((receipt) => receipt.warrantyUntil && receipt.warrantyUntil.slice(0, 10) >= db.today).length,
    unhealthyTotal: sumOf(inPeriod, unhealthy),
    previousUnhealthyTotal: sumOf(inPrevious, unhealthy),
    unplannedTotal: sumOf(inPeriod, unplanned),
    previousUnplannedTotal: sumOf(inPrevious, unplanned),
    categories: sumCategories(db, inPeriod),
    tags: sumTags(db, receipts, period, previous),
    months,
    trend,
    trendUnit: daily ? "DAY" : "MONTH",
  };
}

function overviewProducts(ctx: DemoContext): unknown {
  const period = resolvePeriod(ctx.db, ctx.req.query);
  if (typeof period === "string") {
    return badRequest(period);
  }

  const kind = ctx.req.query.get("kind") ?? "";
  if (!["UNHEALTHY", "UNPLANNED", "FOODGROUP", "TAG"].includes(kind)) {
    return badRequest("kind must be UNHEALTHY, UNPLANNED, FOODGROUP or TAG");
  }

  const categoryId = ctx.req.query.get("categoryId");
  const tagId = ctx.req.query.get("tagId");
  const foodGroup = (ctx.req.query.get("foodGroup") ?? "").trim().toLowerCase();
  const receipts = receiptsFor(ctx.db, idParam(ctx, "groupId")).filter((receipt) => contains(period, dayOfReceipt(receipt)));
  const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]));

  const keep = (product: ReceiptProduct): boolean => {
    switch (kind) {
      case "UNPLANNED":
        return product.planned === false;
      case "FOODGROUP":
        return categoryId
          ? product.categoryId === Number(categoryId)
          : product.categoryId === undefined && product.foodGroup.trim().toLowerCase() === foodGroup;
      case "TAG":
        return product.tags.some((tag) => tag.id === Number(tagId));
      default:
        return product.health === "UNHEALTHY";
    }
  };

  return ctx.db.products
    .filter((product) => byId.has(product.receiptId) && keep(product))
    .map((product): GroupOverviewProduct => {
      const receipt = byId.get(product.receiptId) as Receipt;
      return {
        id: product.id,
        receiptId: product.receiptId,
        receiptName: receipt.name,
        receiptDate: dayOfReceipt(receipt),
        name: product.displayName || product.name,
        amount: product.amount,
        quantity: product.quantity,
        health: product.health,
        planned: product.planned,
      };
    })
    .sort((a, b) => (a.receiptDate === b.receiptDate ? a.id - b.id : a.receiptDate < b.receiptDate ? 1 : -1));
}

export function registerOverview(router: DemoRouter): void {
  router.get("/overview/group/:groupId/products", overviewProducts);
  router.get("/overview/group/:groupId", (ctx) => {
    const period = resolvePeriod(ctx.db, ctx.req.query);
    return typeof period === "string" ? badRequest(period) : overviewFor(ctx.db, idParam(ctx, "groupId"), period);
  });
}

