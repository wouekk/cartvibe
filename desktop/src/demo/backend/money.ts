/**
 * Money for the demo backend. The wire carries decimal strings ("12.50"), never numbers, so every amount is parsed
 * from its digits into whole cents (an integer), added as integers and written back as a string. No float ever
 * holds a price.
 */

/** "12.5", "12,50", "-3" -> cents (1250, 1250, -300). Anything unreadable is 0. Extra decimals round half up. */
export function parseCents(value: string | number | null | undefined): number {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    return 0;
  }

  const fraction = (match[3] ?? "").padEnd(3, "0");
  let cents = Number(match[2] || "0") * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) {
    cents += 1;
  }

  return match[1] ? -cents : cents;
}

/** Cents -> "12.50". */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.round(cents));
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

export function sumCents(values: (string | undefined)[]): number {
  return values.reduce((total, value) => total + parseCents(value), 0);
}

/** The average of whole cents, rounded half up, still an integer. */
export function averageCents(total: number, count: number): number {
  return count === 0 ? 0 : Math.round(total / count);
}
