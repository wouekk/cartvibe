import { FormatWidth, getLocaleTimeFormat } from "@angular/common";

/**
 * The household's date format (System Settings → General), as the API sends it. Display only: the wire, the filters
 * and the native date inputs keep ISO days. Kept in step with `models.DateFormats` in the API.
 */
export const APP_DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "DD.MM.YYYY", "YYYY-MM-DD"] as const;

export type AppDateFormat = (typeof APP_DATE_FORMATS)[number];

export const DEFAULT_APP_DATE_FORMAT: AppDateFormat = "DD/MM/YYYY";

/** The stored format, or the default for an empty or unknown one (a newer server, an older persisted session). */
export function resolveAppDateFormat(value: string | null | undefined): AppDateFormat {
  return (APP_DATE_FORMATS as readonly string[]).includes(value ?? "") ? (value as AppDateFormat) : DEFAULT_APP_DATE_FORMAT;
}

const FULL_DATE: Record<AppDateFormat, string> = {
  "DD/MM/YYYY": "dd/MM/yyyy",
  "MM/DD/YYYY": "MM/dd/yyyy",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "DD.MM.YYYY": "dd.MM.yyyy",
  "YYYY-MM-DD": "yyyy-MM-dd",
};

/** Day and month without the year, in the same order and separator. */
const DAY_MONTH: Record<AppDateFormat, string> = {
  "DD/MM/YYYY": "dd/MM",
  "MM/DD/YYYY": "MM/dd",
  "YYYY/MM/DD": "MM/dd",
  "DD.MM.YYYY": "dd.MM",
  "YYYY-MM-DD": "MM-dd",
};

/** Formats that show a whole date; they all become the household's format. */
const DATE_FORMATS = new Set(["mediumDate", "shortDate", "longDate", "fullDate", "MMM d, y"]);

/**
 * The Angular `formatDate` pattern that shows `format` (a pattern a template asked for) in the household's date
 * format. Whole dates take the household's pattern, `MMM d` its day and month, `short` / `medium` date-times its date
 * and the language's time. Anything else (a month name or a day number on its own, for charts and date blocks) is
 * returned as asked.
 */
export function appDatePattern(format: string, dateFormat: AppDateFormat, locale: string): string {
  if (DATE_FORMATS.has(format)) {
    return FULL_DATE[dateFormat];
  }
  if (format === "MMM d") {
    return DAY_MONTH[dateFormat];
  }
  if (format === "short" || format === "medium") {
    const width = format === "short" ? FormatWidth.Short : FormatWidth.Medium;
    return `${FULL_DATE[dateFormat]} ${timePattern(locale, width)}`;
  }
  return format;
}

function timePattern(locale: string, width: FormatWidth): string {
  try {
    return getLocaleTimeFormat(locale, width);
  } catch {
    return width === FormatWidth.Short ? "HH:mm" : "HH:mm:ss";
  }
}
