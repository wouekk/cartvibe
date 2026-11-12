import { HttpContext } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { finalize, take } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants/dialog.constant";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { QUIET_ERRORS } from "../../interceptors/http-interceptor";
import { ReceiptProductService, ScanQueue, ScanQueueReceipt, ScanQueueScan, ScanQueueService } from "../../open-api";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import {
  SourceFileViewerDialogComponent,
  SourceFileViewerDialogData,
} from "../../shared-ui/source-file-viewer-dialog/source-file-viewer-dialog.component";
import { GroupStore, UserStore } from "../../store";
import { HlmButton } from "../../ui/button/lib/hlm-button";

type ChipColor = "red" | "green" | "gray" | "yellow";

interface StatusLook {
  label: string;
  color: ChipColor;
}

/** A queued scan's status in words. A status this build does not know shows as it came. */
const SCAN_STATUS: Record<string, StatusLook> = {
  WAITING: { label: marker("Waiting"), color: "gray" },
  READING: { label: marker("Being read"), color: "yellow" },
  RETRYING: { label: marker("Trying again"), color: "yellow" },
  FAILED: { label: marker("Failed"), color: "red" },
};

/** Why a receipt has no read yet, in words. */
const RECEIPT_STATUS: Record<string, StatusLook> = {
  PENDING: { label: marker("Waiting for the AI"), color: "gray" },
  RUNNING: { label: marker("Being read"), color: "yellow" },
  UNAVAILABLE: { label: marker("AI not reachable"), color: "yellow" },
  FAILED: { label: marker("Given up"), color: "red" },
};

/** How often the card asks again while something is on its way. */
export const SCAN_QUEUE_REFRESH_MS = 5000;

interface ScanRow extends ScanQueueScan, StatusLook {
  who: string;
  household: string;
}

interface ReceiptRow extends ScanQueueReceipt, StatusLook {
  household: string;
}

/**
 * What the AI has not read yet, in one place: the Quick Scan photos that are not receipts yet (waiting, being
 * read, between tries or failed, with *Run again* and the photo), and the receipts that were saved without a read
 * (with *Read again*). The card is always there, so "nothing is waiting" is something a person can see. While
 * anything is on its way it asks again every few seconds; those requests stay quiet when they fail.
 */
@Component({
  selector: "app-scan-queue-card",
  host: { class: "block" },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppDatePipe, AppIconComponent, HlmButton, RouterLink, SharedUiModule, TranslatePipe],
  templateUrl: "./scan-queue-card.component.html",
})
export class ScanQueueCardComponent implements OnInit {
  private readonly scanQueueService = inject(ScanQueueService);
  private readonly receiptProductService = inject(ReceiptProductService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(AppDialog);
  private readonly userStore = inject(UserStore);
  private readonly groupStore = inject(GroupStore);

  private readonly queue = signal<ScanQueue | null>(null);

  /** True until the first answer, and while a refresh the person asked for is on its way. */
  protected readonly loading = signal(true);

  protected readonly failedToLoad = signal(false);

  /** The row an action is running for, so its button cannot be pressed twice. */
  protected readonly busy = signal<string | null>(null);

  /** Receipts asked to be read again in this visit: the card keeps asking until each is read or has given up. */
  private readonly askedAgain = signal<ReadonlySet<number>>(new Set());

  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  /** The household is named only where there is more than one to tell apart. */
  private readonly severalHouseholds = computed(() => this.groupStore.groupsWithoutAll().length > 1);

  protected readonly scans = computed<ScanRow[]>(() =>
    (this.queue()?.scans ?? []).map((scan) => ({
      ...scan,
      ...(SCAN_STATUS[scan.status] ?? { label: scan.status, color: "gray" }),
      who: this.userStore.getUserById(scan.uploadedByUserId.toString())?.displayName ?? "",
      household: this.householdName(scan.groupId),
    }))
  );

  protected readonly receipts = computed<ReceiptRow[]>(() =>
    (this.queue()?.unreadReceipts ?? []).map((receipt) => ({
      ...receipt,
      ...(RECEIPT_STATUS[receipt.status] ?? { label: receipt.status, color: "gray" }),
      household: this.householdName(receipt.groupId),
    }))
  );

  /** How many unread receipts the list leaves out (it shows the newest). */
  protected readonly receiptsNotShown = computed(() =>
    Math.max(0, (this.queue()?.unreadReceiptCount ?? 0) - this.receipts().length)
  );

  protected readonly receiptCount = computed(() => this.queue()?.unreadReceiptCount ?? 0);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refreshTimer));
  }

  public ngOnInit(): void {
    this.load(false);
  }

  /** The Refresh button: loud, so a failure is said. */
  protected refresh(): void {
    this.loading.set(true);
    this.load(false);
  }

  protected openPhoto(scan: ScanQueueScan): void {
    this.busy.set(`photo-${scan.id}`);
    this.scanQueueService
      .getQueuedScanFile(scan.id)
      .pipe(
        take(1),
        finalize(() => this.busy.set(null))
      )
      .subscribe({
        next: (file) => {
          const data: SourceFileViewerDialogData = { encodedImage: file.encodedImage, name: file.name };
          this.dialog.open(SourceFileViewerDialogComponent, { ...DEFAULT_DIALOG_CONFIG, data });
        },
        // The interceptor has said why; the photo may have aged out, so the list is read again.
        error: () => this.load(true),
      });
  }

  protected runAgain(scan: ScanQueueScan): void {
    this.busy.set(`scan-${scan.id}`);
    this.scanQueueService
      .rerunQueuedScan(scan.id)
      .pipe(
        take(1),
        finalize(() => this.busy.set(null))
      )
      .subscribe({
        next: () => {
          this.snackbarService.success(marker("The photo is in the queue again."));
          this.load(true);
        },
        error: () => this.load(true),
      });
  }

  protected readAgain(receipt: ScanQueueReceipt): void {
    this.busy.set(`receipt-${receipt.receiptId}`);
    this.receiptProductService
      .readReceiptProducts(receipt.receiptId)
      .pipe(
        take(1),
        finalize(() => this.busy.set(null))
      )
      .subscribe({
        next: () => {
          this.askedAgain.update((asked) => new Set(asked).add(receipt.receiptId));
          this.snackbarService.success(marker("The receipt will be read again."));
          this.load(true);
        },
        error: () => this.load(true),
      });
  }

  /** Reads the queue. A quiet read (the card's own, every few seconds) says nothing when it fails. */
  private load(quiet: boolean): void {
    clearTimeout(this.refreshTimer);
    this.scanQueueService
      .getScanQueue("body", false, quiet ? { context: new HttpContext().set(QUIET_ERRORS, true) } : undefined)
      .pipe(take(1))
      .subscribe({
        next: (queue) => {
          this.queue.set(queue ?? { scans: [], unreadReceipts: [], unreadReceiptCount: 0 });
          this.failedToLoad.set(false);
          this.loading.set(false);
          this.scheduleRefresh();
        },
        error: () => {
          // What was shown stays; with nothing to show the card says it could not load.
          this.failedToLoad.set(this.queue() === null);
          this.loading.set(false);
          this.scheduleRefresh();
        },
      });
  }

  /** Asks again in a few seconds while a photo is on its way, or a receipt asked to be read again is. */
  private scheduleRefresh(): void {
    const queue = this.queue();
    if (!queue) {
      return;
    }

    const unread = new Map(queue.unreadReceipts.map((receipt) => [receipt.receiptId, receipt.status]));
    const stillAsked = [...this.askedAgain()].filter((id) => ["PENDING", "RUNNING"].includes(unread.get(id) ?? ""));
    if (stillAsked.length !== this.askedAgain().size) {
      this.askedAgain.set(new Set(stillAsked));
    }

    const onItsWay =
      queue.scans.some((scan) => scan.status !== "FAILED") ||
      queue.unreadReceipts.some((receipt) => receipt.status === "RUNNING") ||
      stillAsked.length > 0;
    if (onItsWay) {
      this.refreshTimer = setTimeout(() => this.load(true), SCAN_QUEUE_REFRESH_MS);
    }
  }

  private householdName(groupId: number): string {
    return this.severalHouseholds() ? (this.groupStore.getGroupById(groupId.toString())?.name ?? "") : "";
  }
}
