import { ReceiptStatus } from "../open-api";
import { marker } from "../i18n/marker";

/**
 * A family sees two receipt statuses (Phase 3 C6): **To check** and **Done**. This is display
 * only — the API's `ReceiptStatus` enum is unchanged (it is closed, and released clients would
 * fail on a new value). OPEN, NEEDS_ATTENTION and DRAFT read as To check; RESOLVED and DECLINED
 * as Done. Picking one writes OPEN or RESOLVED.
 */
export const TO_CHECK_STATUSES: readonly string[] = [
  ReceiptStatus.Open,
  ReceiptStatus.NeedsAttention,
  ReceiptStatus.Draft,
];

export const DONE_STATUSES: readonly string[] = [ReceiptStatus.Resolved, ReceiptStatus.Declined];

export const TO_CHECK_LABEL = marker("To check");

export const DONE_LABEL = "Done";

/** "To check" / "Done"; an unknown status (or none) as it came, so nothing is hidden. */
export function receiptStatusLabel(status: string | null | undefined): string {
  if (status && TO_CHECK_STATUSES.includes(status)) {
    return TO_CHECK_LABEL;
  }
  if (status && DONE_STATUSES.includes(status)) {
    return DONE_LABEL;
  }
  return status ?? "";
}

/** The value a picker shows for a status: OPEN for anything to check, RESOLVED for anything done. */
export function familyReceiptStatus(status: string | null | undefined): string | null | undefined {
  if (status && TO_CHECK_STATUSES.includes(status)) {
    return ReceiptStatus.Open;
  }
  if (status && DONE_STATUSES.includes(status)) {
    return ReceiptStatus.Resolved;
  }
  return status;
}

/**
 * A status filter as it goes on the wire: picking "To check" (OPEN) also matches NEEDS_ATTENTION and
 * DRAFT, and "Done" (RESOLVED) also DECLINED. Call it where the request is assembled, never where
 * the filter is stored, so the picker keeps showing what was picked. Returns a new object.
 */
export function toStatusWireFilter<T extends object>(filter: T | undefined | null): T | undefined {
  if (!filter) {
    return undefined;
  }

  const entry = (filter as Record<string, any>)["status"];
  if (!entry || !Array.isArray(entry.value)) {
    return { ...filter };
  }

  const expanded = new Set<string>();
  for (const value of entry.value as string[]) {
    if (value === ReceiptStatus.Open) {
      TO_CHECK_STATUSES.forEach((status) => expanded.add(status));
    } else if (value === ReceiptStatus.Resolved) {
      DONE_STATUSES.forEach((status) => expanded.add(status));
    } else {
      expanded.add(value);
    }
  }

  return { ...filter, status: { ...entry, value: Array.from(expanded) } } as T;
}
