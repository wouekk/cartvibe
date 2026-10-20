/**
 * The Dashboard's period (Phase 3 D1, decision Q10): a preset or a custom range, resolved to the
 * calendar days the API takes. "Today" is the app time zone's, passed in as a local-midnight Date.
 */
export type PeriodPreset = "THIS_MONTH" | "LAST_WEEK" | "LAST_MONTH" | "THIS_YEAR" | "LAST_YEAR" | "CUSTOM";

export interface PeriodChoice {
  value: PeriodPreset;
  label: string;
}

export const PERIOD_CHOICES: PeriodChoice[] = [
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_WEEK", label: "Last week" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "THIS_YEAR", label: "This year" },
  { value: "LAST_YEAR", label: "Last year" },
  { value: "CUSTOM", label: "Custom" },
];

export interface ResolvedPeriod {
  /** First and last day, "yyyy-MM-dd". */
  from: string;
  to: string;
  /** What the period is called in the tiles ("October 2026", "12 Oct – 18 Oct 2026"). */
  label: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));

export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDayKey(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** "12 Oct 2026". */
export function formatDay(day: string): string {
  const date = parseDayKey(day);
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The monday-to-sunday week before the one containing `today`. */
function lastWeek(today: Date): [Date, Date] {
  const sinceMonday = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday);
  return [
    new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7),
    new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1),
  ];
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/**
 * Resolves a choice to days. A custom range with a missing or backwards end is undefined, so the page
 * waits for a usable one instead of asking the API for nonsense.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  today: Date,
  custom?: { from: string; to: string }
): ResolvedPeriod | undefined {
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (preset) {
    case "THIS_MONTH":
      return {
        from: toDayKey(new Date(year, month, 1)),
        to: toDayKey(new Date(year, month + 1, 0)),
        label: monthLabel(year, month),
      };
    case "LAST_MONTH": {
      const first = new Date(year, month - 1, 1);
      return {
        from: toDayKey(first),
        to: toDayKey(new Date(year, month, 0)),
        label: monthLabel(first.getFullYear(), first.getMonth()),
      };
    }
    case "LAST_WEEK": {
      const [from, to] = lastWeek(today);
      return { from: toDayKey(from), to: toDayKey(to), label: `${formatDay(toDayKey(from))} – ${formatDay(toDayKey(to))}` };
    }
    case "THIS_YEAR":
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}` };
    case "LAST_YEAR":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: `${year - 1}` };
    case "CUSTOM": {
      if (!custom?.from || !custom?.to || custom.to < custom.from) {
        return undefined;
      }
      return { from: custom.from, to: custom.to, label: `${formatDay(custom.from)} – ${formatDay(custom.to)}` };
    }
  }
}

/** The previous period's label, e.g. "September 2026" or "5 Oct 2026 – 11 Oct 2026". */
export function previousLabel(previousFrom: string, previousTo: string): string {
  const from = parseDayKey(previousFrom);
  const to = parseDayKey(previousTo);
  const isWholeMonth =
    from.getDate() === 1 &&
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth() &&
    new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate() === to.getDate();
  if (isWholeMonth) {
    return monthLabel(from.getFullYear(), from.getMonth());
  }

  const isWholeYear = previousFrom.endsWith("-01-01") && previousTo.endsWith("-12-31") && previousFrom.slice(0, 4) === previousTo.slice(0, 4);
  if (isWholeYear) {
    return previousFrom.slice(0, 4);
  }

  return `${formatDay(previousFrom)} – ${formatDay(previousTo)}`;
}
