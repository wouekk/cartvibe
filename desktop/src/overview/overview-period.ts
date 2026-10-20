/**
 * The Dashboard's period (Phase 3 D1, decision Q10): a preset or a custom range, resolved to the
 * calendar days the API takes. "Today" is the app time zone's, passed in as a local-midnight Date.
 */
export type PeriodPreset =
  | "THIS_MONTH"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_MONTH"
  | "LAST_365_DAYS"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";

export interface PeriodChoice {
  value: PeriodPreset;
  label: string;
}

export const PERIOD_CHOICES: PeriodChoice[] = [
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_7_DAYS", label: "Last 7 days" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "THIS_YEAR", label: "This year" },
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
    case "LAST_7_DAYS":
      return rollingPeriod(today, 7);
    case "LAST_30_DAYS":
      return rollingPeriod(today, 30);
    case "LAST_365_DAYS":
      return rollingPeriod(today, 365);
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

/** The last `days` days up to and including today, e.g. 7 gives today and the six days before. */
function rollingPeriod(today: Date, days: number): ResolvedPeriod {
  const from = toDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));
  const to = toDayKey(today);
  return { from, to, label: `${formatDay(from)} – ${formatDay(to)}` };
}

/**
 * Reads a typed day, DD/MM/YYYY (a single digit day or month is fine), as "yyyy-MM-dd". Undefined for
 * anything else, including a day that does not exist like 31/02/2026.
 */
export function parseDayMonthYear(text: string): string | undefined {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text ?? "");
  if (!match) {
    return undefined;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }

  return toDayKey(date);
}

/** "2026-10-20" as typed in the range fields: 20/10/2026. */
export function formatDayMonthYear(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
