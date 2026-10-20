/** What a typed rate means: `ok` false when it is not a usable rate; `value` undefined for "not entered". */
export interface ParsedRate {
  ok: boolean;
  value?: string;
}

const MAX_INTEGER_DIGITS = 5;
const MAX_FRACTION_DIGITS = 6;

/**
 * Cleans a rate while it is being typed: a comma becomes a dot, anything but digits and one dot is dropped,
 * and the digits are capped at what the API stores. A half-typed number ("0.", "1.0") is left as it is, so
 * typing is never fought.
 */
export function sanitizeRateInput(text: string): string {
  const cleaned = (text ?? "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot < 0) {
    return cleaned.slice(0, MAX_INTEGER_DIGITS);
  }

  const integer = cleaned.slice(0, firstDot).slice(0, MAX_INTEGER_DIGITS);
  const fraction = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, MAX_FRACTION_DIGITS);
  return `${integer}.${fraction}`;
}

/** "1." is "1" and ".5" is "0.5"; a lone mark is nothing. Expects a dot as the only mark. */
function completeMark(cleaned: string): string {
  if (cleaned === "" || cleaned === ".") {
    return "";
  }

  const withInteger = cleaned.startsWith(".") ? `0${cleaned}` : cleaned;
  return withInteger.endsWith(".") ? withInteger.slice(0, -1) : withInteger;
}

/** A finished rate as shown: "1." becomes "1", ".5" becomes "0.5". Used when the field is left or Enter is pressed. */
export function settleRateInput(text: string): string {
  return completeMark(sanitizeRateInput((text ?? "").trim()));
}

/** A rate from the API as shown: no trailing zeros ("1.040000" is "1.04"). */
export function formatRate(rate: string | undefined | null): string {
  const text = (rate ?? "").trim();
  if (!text.includes(".")) {
    return text;
  }

  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Reads a rate a person typed (Phase 3 currencies): empty means not entered yet, a comma or a dot is the
 * decimal mark, up to six decimals, greater than zero and below 100000.
 */
export function parseRateInput(text: string): ParsedRate {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  // Anything the typing filter would have dropped makes the text unusable, rather than quietly changing it.
  if (!/^[0-9.,]+$/.test(trimmed) || (trimmed.match(/[.,]/g) ?? []).length > 1) {
    return { ok: false };
  }

  // Not settleRateInput: its digit cap would quietly turn 100000 into 10000.
  const normalized = completeMark(trimmed.replace(",", "."));
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
