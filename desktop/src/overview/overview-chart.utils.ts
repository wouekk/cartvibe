import { GroupOverviewCategory, GroupOverviewMonth } from "../open-api";
import { FilterMonth } from "../utils/receipt-date-filter";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Category colors, in order. The first is the app's primary; the rest differ in lightness as well
 * as hue, so neighbouring slices stay distinguishable without relying on color alone.
 */
export const CATEGORY_COLORS = ["#0086d4", "#f59e0b", "#e2562f", "#7c5cd6", "#0f9d74", "#64748b"];

/** Categories beyond this many are folded into "Other", so the ring stays readable. */
export const MAX_DONUT_SEGMENTS = 5;

export const DONUT_RADIUS = 70;

const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/** The gap between slices, in px along the ring. */
const DONUT_GAP = 2;

export interface DonutSegment {
  name: string;
  total: number;
  share: string;
  color: string;
  dashArray: string;
  dashOffset: number;
}

export interface MonthBar {
  key: string;
  shortName: string;
  total: number;
  /** Percent of the tallest month; never 0 for a non-zero month, so it stays visible. */
  heightPercent: number;
  isSelected: boolean;
}

/** "yyyy-MM" for the API. */
export function toMonthKey(month: FilterMonth): string {
  return `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function formatMonthLabel(month: FilterMonth): string {
  return `${MONTH_NAMES[month.month]} ${month.year}`;
}

/** The first and last day of a month as calendar days ("yyyy-MM-dd"), the form date filters take. */
export function monthDayRange(month: FilterMonth): [string, string] {
  const lastDay = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const key = toMonthKey(month);
  return [`${key}-01`, `${key}-${String(lastDay).padStart(2, "0")}`];
}

/**
 * The ring's slices: the largest categories in order, the rest as "Other". Shares are of the sum of
 * the slices — a receipt counts toward each of its categories, so that sum can exceed the month total.
 */
export function buildDonutSegments(categories: GroupOverviewCategory[]): DonutSegment[] {
  const parsed = categories
    .map((category) => ({ name: category.name, total: Number(category.total) }))
    .filter((category) => category.total > 0);

  const head = parsed.slice(0, MAX_DONUT_SEGMENTS);
  const rest = parsed.slice(MAX_DONUT_SEGMENTS);
  if (rest.length > 0) {
    head.push({ name: "Other", total: rest.reduce((sum, category) => sum + category.total, 0) });
  }

  const sum = head.reduce((total, category) => total + category.total, 0);
  if (sum <= 0) {
    return [];
  }

  let start = 0;
  return head.map((category, index) => {
    const length = (category.total / sum) * DONUT_CIRCUMFERENCE;
    const gap = head.length > 1 ? DONUT_GAP : 0;
    const segment: DonutSegment = {
      name: category.name,
      total: category.total,
      share: `${Math.round((category.total / sum) * 1000) / 10}%`,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      dashArray: `${Math.max(length - gap, 0)} ${DONUT_CIRCUMFERENCE}`,
      dashOffset: -start,
    };
    start += length;
    return segment;
  });
}

export function buildMonthBars(months: GroupOverviewMonth[], selectedKey: string): MonthBar[] {
  const totals = months.map((month) => Number(month.total));
  const max = Math.max(0, ...totals);

  return months.map((month, index) => {
    const total = totals[index];
    const monthIndex = Number(month.month.slice(5, 7)) - 1;
    return {
      key: month.month,
      shortName: MONTH_NAMES[monthIndex]?.slice(0, 3) ?? month.month,
      total,
      heightPercent: max > 0 && total > 0 ? Math.max(2, Math.round((total / max) * 100)) : 0,
      isSelected: month.month === selectedKey,
    };
  });
}

/**
 * Month-over-month change, e.g. "8% less than September". Undefined when there is nothing to compare
 * against (no spend last month).
 */
export function describeChange(total: string, previousTotal: string, previousMonth: FilterMonth): string | undefined {
  const current = Number(total);
  const previous = Number(previousTotal);
  if (!(previous > 0)) {
    return undefined;
  }

  const percent = Math.round(((current - previous) / previous) * 100);
  const previousName = MONTH_NAMES[previousMonth.month];
  if (percent === 0) {
    return `About the same as ${previousName}`;
  }
  return percent < 0 ? `${-percent}% less than ${previousName}` : `${percent}% more than ${previousName}`;
}

export function previousMonthOf(month: FilterMonth): FilterMonth {
  return month.month === 0 ? { year: month.year - 1, month: 11 } : { year: month.year, month: month.month - 1 };
}

/**
 * The caller's net position from the amount-owed map: positive means others owe the caller. The map
 * holds, per user, what the caller owes them (negative when they owe the caller).
 */
export function netOwed(amountOwed: { [userId: string]: string }): number {
  return -Object.values(amountOwed).reduce((sum, value) => sum + Number(value), 0);
}
