import { ReceiptStatus } from "../open-api";
import { marker } from "../i18n/marker";

/**
 * A receipt is **To check** (`OPEN` on the API) or **Settled** (`RESOLVED`). Those are the only two statuses:
 * the three more that the API once had are gone from it, and the server rewrote the receipts that had one.
 */
export const TO_CHECK_LABEL = marker("To check");

export const SETTLED_LABEL = marker("Settled");

/** "To check" / "Settled"; an unknown status (or none) as it came, so nothing is hidden. */
export function receiptStatusLabel(status: string | null | undefined): string {
  if (status === ReceiptStatus.Open) {
    return TO_CHECK_LABEL;
  }
  if (status === ReceiptStatus.Resolved) {
    return SETTLED_LABEL;
  }
  return status ?? "";
}

export function isToCheck(status: string | null | undefined): boolean {
  return status === ReceiptStatus.Open;
}

export function isSettled(status: string | null | undefined): boolean {
  return status === ReceiptStatus.Resolved;
}
