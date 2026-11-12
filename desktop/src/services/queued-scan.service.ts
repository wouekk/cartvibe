import { HttpContext } from "@angular/common/http";
import { DOCUMENT } from "@angular/common";
import { inject, Injectable, OnDestroy, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { marker } from "../i18n/marker";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { isWorthRetrying, RetryWhenReachable } from "../offline/retry-when-reachable";
import { ReceiptService, ReceiptStatus } from "../open-api";
import { ScanSummaryService } from "./scan-summary.service";
import { SnackbarService } from "./snackbar.service";
import { TokenRefreshService } from "./token-refresh.service";

const QUEUED_SCAN_PREFIX = "quick-scan:";

/** One Quick Scan as the dialog would have sent it: the photos and, per photo, the fields of the upload. */
export interface QueuedScan {
  files: Blob[];
  groupIds: number[];
  paidByUserIds: number[];
  statuses: ReceiptStatus[];
  categoryIds: string[];
  tagIds: string[];
  notes: string[];
}

/**
 * A scan as an earlier version of the app kept it on the device: the note was a comment then, and the status
 * could be one of three that no longer exist. Such a scan may still be waiting when the app is updated.
 */
type StoredScan = Omit<QueuedScan, "notes" | "statuses"> & { notes?: string[]; comments?: string[]; statuses: string[] };

/** A removed status as what the app showed it as, so an old queued scan is not refused. */
function currentStatus(status: string): ReceiptStatus {
  if (status === "NEEDS_ATTENTION" || status === "DRAFT") {
    return ReceiptStatus.Open;
  }
  if (status === "DECLINED") {
    return ReceiptStatus.Resolved;
  }
  return status as ReceiptStatus;
}

/**
 * Keeps a Quick Scan that could not be sent (a receipt photographed at the till, with no signal) on the device and
 * uploads it when the server can be reached, so the photo is never lost to a dead zone. Each scan is one entry in
 * `OfflineStorageService`, removed once the server has taken it or refused it for good.
 *
 * An upload whose answer was lost on the way may have arrived: sending it again then makes a second receipt. That
 * is the price of never losing one, and the second is deleted in a tap.
 */
@Injectable({ providedIn: "root" })
export class QueuedScanService implements OnDestroy {
  private readonly storage = inject(OfflineStorageService);
  private readonly receiptService = inject(ReceiptService);
  private readonly tokenRefreshService = inject(TokenRefreshService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly scanSummary = inject(ScanSummaryService);

  private readonly retry = new RetryWhenReachable(inject(DOCUMENT), () => this.uploadAll());

  /** How many scans are waiting on this device. */
  public readonly waiting = signal(0);

  constructor() {
    // Whatever an earlier visit left behind goes out as soon as the app opens.
    this.retry.kick();
  }

  public ngOnDestroy(): void {
    this.retry.dispose();
  }

  /** Whether a failed Quick Scan should be kept for later: it never reached the server. */
  public static shouldQueue(error: unknown): boolean {
    return (error as { status?: unknown } | null)?.status === 0;
  }

  public async queue(scan: QueuedScan): Promise<void> {
    // Time first, so the scans go out in the order they were taken.
    const key = `${QUEUED_SCAN_PREFIX}${Date.now().toString().padStart(15, "0")}-${Math.floor(Math.random() * 1e6)}`;
    await this.storage.set(key, scan);
    this.waiting.update((count) => count + 1);
    this.retry.kick();
  }

  /** Uploads what is waiting now; resolves when the attempt has ended. */
  public flush(): Promise<void> {
    return this.retry.run();
  }

  /** True when nothing is left, false when the server could not be reached. */
  private async uploadAll(): Promise<boolean> {
    const keys = await this.storage.keys(QUEUED_SCAN_PREFIX);
    this.waiting.set(keys.length);

    for (const key of keys) {
      const scan = await this.storage.get<StoredScan>(key);
      if (!scan || !Array.isArray(scan.files) || scan.files.length === 0) {
        await this.storage.remove(key);
        this.waiting.update((count) => Math.max(0, count - 1));
        continue;
      }

      if (!(await this.tokenRefreshService.ensureFreshToken())) {
        return false;
      }

      try {
        await firstValueFrom(
          this.receiptService.quickScanReceipt(
            scan.files,
            scan.groupIds,
            scan.paidByUserIds,
            (scan.statuses ?? []).map(currentStatus),
            scan.categoryIds,
            scan.tagIds,
            scan.notes ?? scan.comments,
            "body",
            false,
            { context: new HttpContext().set(QUIET_ERRORS, true) }
          )
        );
        this.snackbarService.success(
          marker("The receipt photos kept on this device are uploaded. You will get a notification once the AI has read them.")
        );
        // The receipts page's line counts them from now on.
        this.scanSummary.refresh();
      } catch (error) {
        if (isWorthRetrying(error)) {
          return false;
        }
        // Refused for good (too large, no permission any more): keeping it would only fail again on every start.
        this.snackbarService.error(
          (error as { error?: { errorMsg?: string } } | null)?.error?.errorMsg ??
            marker("Receipt photos kept on this device could not be uploaded and were removed.")
        );
      }

      await this.storage.remove(key);
      this.waiting.update((count) => Math.max(0, count - 1));
    }

    return true;
  }
}
