import { catchError, exhaustMap, first, map, Observable, of, timeout, timer } from "rxjs";

/** What the status endpoint answers (`getQuickScanStatus`): PENDING, DONE with the receipt id, or FAILED. */
export interface QuickScanProgress {
  status?: string;
  receiptId?: number;
}

export const QUICK_SCAN_POLL_INTERVAL_MS = 1500;
export const QUICK_SCAN_WAIT_LIMIT_MS = 120000;

/**
 * Follows one queued quick scan until it has made its receipt. Emits the receipt id, or `null` when the scan failed,
 * took longer than the limit, or could not be followed, so the caller falls back to "queued for processing".
 * A failed poll counts as "still pending": one dropped request must not end the wait.
 */
export function waitForScannedReceipt(
  check: () => Observable<QuickScanProgress>,
  intervalMs = QUICK_SCAN_POLL_INTERVAL_MS,
  limitMs = QUICK_SCAN_WAIT_LIMIT_MS
): Observable<number | null> {
  return timer(0, intervalMs).pipe(
    exhaustMap(() => check().pipe(catchError(() => of<QuickScanProgress>({ status: "PENDING" })))),
    first((progress) => progress.status !== "PENDING"),
    map((progress) => (progress.status === "DONE" && progress.receiptId ? progress.receiptId : null)),
    timeout(limitMs),
    catchError(() => of(null))
  );
}
