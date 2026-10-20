/** What a typed rate means: `ok` false when it is not a usable rate; `value` undefined for "not entered". */
export interface ParsedRate {
  ok: boolean;
  value?: string;
}

/**
 * Reads a rate a person typed (Phase 3 currencies): empty means not entered yet, a comma decimal is fine,
 * up to six decimals, greater than zero and below 100000.
 */
export function parseRateInput(text: string): ParsedRate {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,6})?$/.test(normalized)) {
    return { ok: false };
  }

  const value = Number(normalized);
  if (!(value > 0) || value >= 100000) {
    return { ok: false };
  }

  return { ok: true, value: normalized };
}

/** A currency code as typed: three letters, upper-cased; undefined when it is not one. */
export function parseCurrencyCode(text: string): string | undefined {
  const code = (text ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}
