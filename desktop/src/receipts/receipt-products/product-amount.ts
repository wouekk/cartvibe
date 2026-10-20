/** What a typed price means: `ok` false when it is not a price; `value` undefined for "no price". */
export interface ParsedAmount {
  ok: boolean;
  value?: string;
}

/**
 * Reads a price a person typed (Phase 3 C5): a comma decimal is fine (a European phone keyboard),
 * at most two decimals, optionally negative for a refund line. Empty means the line has no price.
 */
export function parseAmountInput(text: string): ParsedAmount {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^-?\d{1,8}(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false };
  }

  return { ok: true, value: normalized };
}
