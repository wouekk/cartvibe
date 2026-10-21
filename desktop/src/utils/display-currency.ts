/** A currency code as people type it: three letters, any case. */
export function normalizeCurrencyCode(text: string | null | undefined): string {
  return (text ?? "").trim().toUpperCase();
}

export function isCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** Parses a typed rate: a positive number with up to six decimals, a comma decimal is fine. */
export function parseRateInput(text: string | null | undefined): { ok: boolean; value?: string } {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(normalized) || !(Number(normalized) > 0)) {
    return { ok: false };
  }

  return { ok: true, value: normalized };
}

/** An amount in the display currency: the household amount times the rate, formatted by the browser for that currency. */
export function formatInDisplayCurrency(amount: number | string, code: string, rate: number, locale?: string): string {
  const converted = Number(amount) * rate;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(converted);
  } catch {
    // A code the browser does not know: show the figure with the code after it.
    return `${converted.toFixed(2)} ${code}`;
  }
}
