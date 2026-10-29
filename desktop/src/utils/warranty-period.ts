/**
 * Where a new warranty date starts. The table is the API's too (`api/internal/services/warranty_period.go`): keep the
 * two in step.
 *
 * Automatic is 2 years in the EU (the legal guarantee minimum, Directive (EU) 2019/771: the 27 member states and the
 * outermost regions that report their own codes) and 1 year everywhere else, the US included (the most common
 * manufacturer warranty; there is no federal minimum). Some states give longer; those people pick the period by hand.
 */
const TWO_YEAR_REGIONS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GP", "MQ", "GF", "RE", "YT", "MF", "IC", "EA",
]);

/**
 * The countries the region setting offers: the EU states and outermost regions (2 years) and the common others
 * (1 year). Anyone elsewhere leaves it on the browser's region or picks a period by hand; Automatic is 1 year for
 * them either way.
 */
export const REGION_CHOICES: readonly string[] = [
  ...TWO_YEAR_REGIONS,
  "US", "GB", "CH", "NO", "IS", "LI", "CA", "AU", "NZ", "UA", "TR", "JP",
];

/** A country's name in the interface language ("Poland", "Polska"), or the code when the browser cannot name it. */
export function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The fixed periods a person can pick instead of Automatic. */
export const WARRANTY_PERIOD_CHOICES = [1, 2, 3, 5] as const;

export const DEFAULT_WARRANTY_LEAD_DAYS = 30;

/** The Automatic period for an ISO 3166-1 country code, in years. */
export function automaticWarrantyYears(region: string | null | undefined): number {
  return TWO_YEAR_REGIONS.has((region ?? "").trim().toUpperCase()) ? 2 : 1;
}

/** The region part of a browser locale ("pl-PL" → "PL", "de" → ""). */
export function regionFromLocale(locale: string | null | undefined): string {
  const match = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale ?? "");
  return match ? match[1].toUpperCase() : "";
}

/** The browser's region, from the first of its languages that names one. */
export function browserRegion(languages: readonly string[] = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []): string {
  for (const language of languages) {
    const region = regionFromLocale(language);
    if (region) {
      return region;
    }
  }
  return "";
}

/** The person's region: the one they chose, else the browser's. */
export function effectiveRegion(chosen: string | null | undefined, languages?: readonly string[]): string {
  const region = (chosen ?? "").trim().toUpperCase();
  return region || browserRegion(languages);
}

/** The period a new warranty date starts at: the chosen one, or Automatic by region. */
export function warrantyYears(chosenYears: number | null | undefined, region: string): number {
  return chosenYears && (WARRANTY_PERIOD_CHOICES as readonly number[]).includes(chosenYears)
    ? chosenYears
    : automaticWarrantyYears(region);
}

/**
 * The day plus whole years as calendar months, kept inside the target month (29 Feb + 1 year is 28 Feb). Local
 * midnight in, local midnight out, like the datepicker's values.
 */
export function addWarrantyYears(day: Date, years: number): Date {
  return addCalendarMonths(day, years * 12);
}

/** The day plus calendar months, kept inside the target month (31 Dec + 2 months is 28 or 29 Feb). */
export function addCalendarMonths(day: Date, months: number): Date {
  const target = new Date(day.getFullYear(), day.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day.getDate(), lastDay));
}

/** Whole days from one "yyyy-MM-dd" day to another (0 for the same day), or null when either is not a day. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const parse = (value: string | null | undefined) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const start = parse(from);
  const end = parse(to);
  return start === null || end === null ? null : Math.round((end - start) / 86_400_000);
}

/** One row of a warranties table: a product of a receipt, and the receipt's warranty. */
export interface WarrantyRow {
  receiptId: number;
  shop: string;
  /** The product's name; "" for a receipt without products. */
  product: string;
  bought: string;
  warrantyUntil: string;
  daysLeft: number;
  /** The receipt's first row: it carries the shop and the dates, the rows after it only their product. */
  first: boolean;
}

/** A row per product of each receipt (one row for a receipt without products), in the receipts' order. */
export function warrantyRows(
  receipts: readonly { id: number; name: string; shopName?: string; date: string; warrantyUntil?: string; warrantyProducts?: string[] }[],
  today: string
): WarrantyRow[] {
  return receipts.flatMap((receipt) => {
    const products = receipt.warrantyProducts?.length ? receipt.warrantyProducts : [""];
    return products.map((product, index) => ({
      receiptId: receipt.id,
      shop: receipt.shopName || receipt.name,
      product,
      bought: receipt.date,
      warrantyUntil: receipt.warrantyUntil ?? "",
      daysLeft: daysBetween(today, receipt.warrantyUntil) ?? 0,
      first: index === 0,
    }));
  });
}

/** How far ahead the Dashboard looks for warranties ending soon. */
export const WARRANTY_ENDING_SOON_MONTHS = 2;
