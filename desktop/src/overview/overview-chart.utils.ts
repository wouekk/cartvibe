import { GroupOverviewCategory, GroupOverviewMonth } from "../open-api";
import { FilterMonth } from "../utils/receipt-date-filter";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Category colors, in order: fixed, high-contrast hues that never follow the accent theme, so a slice keeps its
 * meaning (and stays readable) whichever theme is picked. Sky, amber, red, violet, pink, teal.
 */
export const CATEGORY_COLORS = [
  "oklch(0.62 0.19 259)",
  "oklch(0.72 0.17 162)",
  "oklch(0.77 0.16 70)",
  "oklch(0.64 0.22 303)",
  "oklch(0.66 0.2 12)",
  "oklch(0.74 0.12 200)",
];

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
  /** Only with a spending goal: this bar's total as a fraction of the chart scale (the tallest month). */
  fraction?: number;
  /** Only with a spending goal: the part of the total up to the goal, and the part above it. */
  baseAmount?: number;
  overAmount?: number;
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
 * The trend chart's bars (Phase 3 D1): months for a period of a month or more, days for a shorter
 * one. A bar is highlighted when it lies inside the period, which for a day trend is all of them.
 */
export function buildTrendBars(
  trend: GroupOverviewMonth[],
  unit: string,
  from: string,
  to: string,
  goal = 0
): MonthBar[] {
  const totals = trend.map((point) => Number(point.total));
  const max = Math.max(0, ...totals);
  const isDay = unit === "DAY";
  // The scale follows the tallest month, never the goal: a small month stays a readable bar next to a
  // goal far above it. The goal line is only drawn when it fits under the tallest bar.
  const scaleMax = max;

  return trend.map((point, index) => {
    const total = totals[index];
    const monthIndex = Number(point.month.slice(5, 7)) - 1;
    const shortName = isDay ? String(Number(point.month.slice(8, 10))) : MONTH_NAMES[monthIndex]?.slice(0, 3) ?? point.month;
    const inPeriod = isDay || (point.month >= from.slice(0, 7) && point.month <= to.slice(0, 7));

    const bar: MonthBar = {
      key: point.month,
      shortName,
      total,
      heightPercent: max > 0 && total > 0 ? Math.max(2, Math.round((total / max) * 100)) : 0,
      isSelected: inPeriod,
    };

    // With a monthly spending goal a month above it splits into the part up to the goal and the part
    // over it. Days have no monthly goal.
    if (goal > 0 && !isDay) {
      bar.fraction = scaleMax > 0 ? Math.max(0, total) / scaleMax : 0;
      bar.baseAmount = Math.max(0, Math.min(total, goal));
      bar.overAmount = Math.max(0, total - goal);
    }

    return bar;
  });
}

/**
 * How the period compares with the one before, e.g. "8% less than September". Undefined when there is
 * nothing to compare against (no spend before).
 */
export function describeChangeAgainst(total: string, previousTotal: string, previousName: string): string | undefined {
  const current = Number(total);
  const previous = Number(previousTotal);
  if (!(previous > 0)) {
    return undefined;
  }

  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) {
    return `About the same as ${previousName}`;
  }
  return percent < 0 ? `${-percent}% less than ${previousName}` : `${percent}% more than ${previousName}`;
}

/**
 * Where the goal line sits on the chart, as a fraction of its height: 0 when there is no goal or nothing
 * was spent, above 1 when the goal is higher than the tallest month (the line is then left out).
 */
export function goalLineFraction(totals: number[], goal: number): number {
  const tallest = Math.max(0, ...totals);
  if (!(goal > 0) || !(tallest > 0)) {
    return 0;
  }

  return goal / tallest;
}

/** Parses a typed spending goal: empty clears it, a comma decimal is fine, above 0 with at most 2 decimals. */
export function parseGoalInput(text: string): { ok: boolean; value?: string } {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized) || !(Number(normalized) > 0)) {
    return { ok: false };
  }

  return { ok: true, value: normalized };
}

/** The inline goal editor's version: a zero (0, 0,00) clears the goal too, like an empty field. */
export function parseInlineGoalInput(text: string): { ok: boolean; value?: string } {
  const trimmed = (text ?? "").trim();
  if (/^0+([.,]0*)?$/.test(trimmed)) {
    return { ok: true };
  }

  return parseGoalInput(trimmed);
}
