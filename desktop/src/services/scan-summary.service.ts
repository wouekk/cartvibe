import { HttpContext } from "@angular/common/http";
import { inject, Injectable, signal } from "@angular/core";
import { take } from "rxjs";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { ScanQueueService } from "../open-api";

/** How often the count is asked for again while photos are on their way. */
export const SCAN_SUMMARY_REFRESH_MS = 5000;

/**
 * How many Quick Scan photos the server still holds for the households this person sees: the line the receipts page
 * shows everyone. `refresh()` reads the count, and while photos are waiting the service asks again every few
 * seconds by itself, so the line follows the queue and goes away when it is empty. The requests are quiet: a count
 * that cannot be read shows nothing.
 */
@Injectable({ providedIn: "root" })
export class ScanSummaryService {
  private readonly scanQueueService = inject(ScanQueueService);

  /** Photos waiting, being read or between tries. */
  public readonly waiting = signal(0);

  /** Photos that used up their tries. */
  public readonly failed = signal(0);

  /** Goes up each time photos left the queue, so a page can read its receipts again. */
  public readonly settled = signal(0);

  private timer: ReturnType<typeof setTimeout> | undefined;

  private asking = false;

  /** Reads the count now. Safe to call often: a call made while one is on its way is dropped. */
  public refresh(): void {
    clearTimeout(this.timer);
    if (this.asking) {
      return;
    }

    this.asking = true;
    this.scanQueueService
      .getScanQueueSummary("body", false, { context: new HttpContext().set(QUIET_ERRORS, true) })
      .pipe(take(1))
      .subscribe({
        next: (summary) => {
          this.asking = false;
          const before = this.waiting();
          const failedBefore = this.failed();
          this.waiting.set(summary?.waiting ?? 0);
          this.failed.set(summary?.failed ?? 0);
          if (this.waiting() < before || this.failed() !== failedBefore) {
            this.settled.update((count) => count + 1);
          }
          if (this.waiting() > 0) {
            this.timer = setTimeout(() => this.refresh(), SCAN_SUMMARY_REFRESH_MS);
          }
        },
        error: () => {
          // Signed out, or no connection: say nothing rather than a stale number. The next refresh starts anew.
          this.asking = false;
          this.waiting.set(0);
          this.failed.set(0);
        },
      });
  }
}
