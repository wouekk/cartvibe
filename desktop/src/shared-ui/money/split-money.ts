export interface MoneyParts {
  /** What comes before the figure (a currency symbol), or "". */
  prefix: string;
  /** The whole part, with its thousands separators. */
  integer: string;
  /** The decimal marker and the fraction digits, or "". */
  fraction: string;
  /** What comes after the figure (a symbol such as €), or "". */
  suffix: string;
}

/**
 * Splits an already formatted amount ("1 234,56 €", "$725.10") into its symbol, whole part and fraction, so a card can
 * keep the whole part bold and quiet the rest. A trailing one or two digits after "." or "," are the fraction (thousands
 * groups are three digits, so "1,234" stays whole). Anything that does not look like an amount comes back as the prefix.
 */
export function splitMoney(text: string): MoneyParts {
  const match = /^(\D*?)(-?\d[\d.,\s\u00a0\u202f']*)(\D*)$/.exec(text.trim());
  if (!match) {
    return { prefix: text, integer: "", fraction: "", suffix: "" };
  }

  const [, prefix, figure, suffix] = match;
  const trimmed = figure.replace(/[\s\u00a0\u202f]+$/, "");
  const trailing = figure.slice(trimmed.length);
  const fractionMatch = /^(.*\d)([.,]\d{1,2})$/.exec(trimmed);
  return fractionMatch
    ? { prefix, integer: fractionMatch[1], fraction: fractionMatch[2], suffix: trailing + suffix }
    : { prefix, integer: trimmed, fraction: "", suffix: trailing + suffix };
}
