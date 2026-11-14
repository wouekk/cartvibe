import { HttpContext } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { Observable, of, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { QUIET_ERRORS } from "../../interceptors/http-interceptor";
import { Group, ReceiptProductService, ScanQueue, ScanQueueReceipt, ScanQueueScan, ScanQueueService, User } from "../../open-api";
import { SnackbarService } from "../../services";
import { SourceFileViewerDialogComponent } from "../../shared-ui/source-file-viewer-dialog/source-file-viewer-dialog.component";
import { GroupStore, UserStore } from "../../store";
import { observedResizes, restoreResizes, watchResizes } from "../../testing/resize-observer.stub";
import { SCAN_QUEUE_REFRESH_MS, ScanQueueCardComponent } from "./scan-queue-card.component";

import type { Mock } from "vitest";

const scan = (id: number, status: string, more: Partial<ScanQueueScan> = {}): ScanQueueScan => ({
  id,
  status,
  fileName: `photo-${id}.jpg`,
  groupId: 1,
  uploadedByUserId: 7,
  uploadedAt: "2026-11-12T09:30:00Z",
  attempts: 0,
  maxAttempts: 4,
  lastError: "",
  hasFile: true,
  canRerun: false,
  ...more,
});

const receipt = (receiptId: number, status: string, more: Partial<ScanQueueReceipt> = {}): ScanQueueReceipt => ({
  receiptId,
  name: `Receipt ${receiptId}`,
  groupId: 1,
  date: "2026-11-10T00:00:00Z",
  status,
  attempts: 0,
  lastError: "",
  updatedAt: "2026-11-12T09:30:00Z",
  canReadAgain: true,
  ...more,
});

const queueOf = (scans: ScanQueueScan[] = [], unreadReceipts: ScanQueueReceipt[] = [], count?: number): ScanQueue => ({
  scans,
  unreadReceipts,
  unreadReceiptCount: count ?? unreadReceipts.length,
});

describe("ScanQueueCardComponent", () => {
  let fixture: ComponentFixture<ScanQueueCardComponent>;
  let getScanQueue: Mock;
  let rerunQueuedScan: Mock;
  let getQueuedScanFile: Mock;
  let readReceiptProducts: Mock;
  let snackbar: { success: Mock; error: Mock };
  let dialog: { open: Mock };

  const element = (): HTMLElement => fixture.nativeElement;
  const byTestId = (testId: string): HTMLElement[] => Array.from(element().querySelectorAll(`[data-testid="${testId}"]`));
  const text = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

  /** Each call to the queue takes the next answer; the last one repeats. */
  const create = async (...answers: (ScanQueue | Error)[]): Promise<void> => {
    let call = 0;
    getScanQueue = vi.fn((): Observable<ScanQueue> => {
      const answer = answers[Math.min(call++, answers.length - 1)];
      return answer instanceof Error ? throwError(() => answer) : of(answer);
    });
    rerunQueuedScan = vi.fn(() => of(null));
    getQueuedScanFile = vi.fn(() => of({ name: "photo-1.jpg", encodedImage: "data:image/jpeg;base64,AAAA" }));
    readReceiptProducts = vi.fn(() => of({}));
    snackbar = { success: vi.fn(), error: vi.fn() };
    dialog = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ScanQueueCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ScanQueueService, useValue: { getScanQueue, rerunQueuedScan, getQueuedScanFile } },
        { provide: ReceiptProductService, useValue: { readReceiptProducts } },
        { provide: SnackbarService, useValue: snackbar },
        { provide: AppDialog, useValue: dialog },
      ],
    }).compileComponents();

    TestBed.inject(UserStore).setUsers([{ id: 7, displayName: "Ola", username: "ola" } as User]);
    fixture = TestBed.createComponent(ScanQueueCardComponent);
    // Not whenStable: it never settles under fake timers. The answers are synchronous, so one pass draws them.
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.useRealTimers();
    restoreResizes();
  });

  it("is there with nothing waiting, and says so", async () => {
    await create(queueOf());

    expect(byTestId("ai-card-scan-queue")).toHaveLength(1);
    expect(text(byTestId("scan-queue-scans-empty")[0])).toBe("No photo is waiting.");
    expect(text(byTestId("scan-queue-receipts-empty")[0])).toBe("Every receipt with a photo has been read.");
    expect(byTestId("scan-queue-scan")).toHaveLength(0);
  });

  it("lists each photo with who sent it and where it stands", async () => {
    await create(
      queueOf([
        scan(1, "WAITING"),
        scan(2, "READING"),
        scan(3, "RETRYING", { attempts: 1, nextAttemptAt: "2026-11-12T09:31:00Z", lastError: "the provider answered 503" }),
        scan(4, "FAILED", { attempts: 4, lastError: "no such table", canRerun: true }),
        scan(5, "SOMETHING_NEW", { hasFile: false }),
      ])
    );

    const rows = byTestId("scan-queue-scan");
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual(["WAITING", "READING", "RETRYING", "FAILED", "SOMETHING_NEW"]);
    expect(rows.map((row) => text(row.querySelector("app-status-chip")))).toEqual([
      "Waiting",
      "Being read",
      "Trying again",
      "Failed",
      "SOMETHING_NEW",
    ]);
    expect(text(rows[0].querySelector('[data-testid="scan-queue-scan-meta"]'))).toContain("Ola ·");

    expect(text(rows[2].querySelector('[data-testid="scan-queue-scan-detail"]'))).toMatch(/^Try 1 of 4 failed\. The next one is at .+\.$/);
    expect(text(rows[2].querySelector('[data-testid="scan-queue-scan-error"]'))).toBe("the provider answered 503");
    expect(text(rows[3].querySelector('[data-testid="scan-queue-scan-detail"]'))).toBe("Not read after 4 of 4 tries.");

    // Run again only where the server says it may be; the photo only where there is one to open.
    expect(rows.map((row) => row.querySelector('[data-testid="scan-queue-rerun"]') !== null)).toEqual([false, false, false, true, false]);
    expect(rows.map((row) => row.querySelector('[data-testid="scan-queue-photo"]') !== null)).toEqual([true, true, true, true, false]);
    expect(text(rows[4])).toContain("photo-5.jpg");
  });

  it("names the household only where there are several", async () => {
    await create(queueOf([scan(1, "WAITING", { groupId: 2 })]));
    expect(text(byTestId("scan-queue-scan-meta")[0])).not.toContain("Cabin");

    TestBed.inject(GroupStore).setGroups([
      { id: 1, name: "Home" } as Group,
      { id: 2, name: "Cabin" } as Group,
    ]);
    await fixture.whenStable();

    expect(text(byTestId("scan-queue-scan-meta")[0])).toContain("· Cabin");
  });

  it("runs a failed scan again and reads the queue anew", async () => {
    await create(queueOf([scan(4, "FAILED", { attempts: 4, canRerun: true })]), queueOf([scan(4, "WAITING")]));

    byTestId("scan-queue-rerun")[0].click();
    await fixture.whenStable();

    expect(rerunQueuedScan).toHaveBeenCalledWith(4);
    expect(snackbar.success).toHaveBeenCalledWith("The photo is in the queue again.");
    expect(getScanQueue).toHaveBeenCalledTimes(2);
    expect(byTestId("scan-queue-scan")[0].getAttribute("data-status")).toBe("WAITING");
    expect(byTestId("scan-queue-rerun")).toHaveLength(0);
  });

  it("opens the photo of a waiting scan", async () => {
    await create(queueOf([scan(1, "WAITING")]));

    byTestId("scan-queue-photo")[0].click();
    await fixture.whenStable();

    expect(getQueuedScanFile).toHaveBeenCalledWith(1);
    expect(dialog.open).toHaveBeenCalledWith(
      SourceFileViewerDialogComponent,
      expect.objectContaining({ data: { name: "photo-1.jpg", encodedImage: "data:image/jpeg;base64,AAAA" } })
    );
  });

  it("lists the receipts saved without a read, with a link and Read again", async () => {
    await create(
      queueOf(
        [],
        [
          receipt(10, "PENDING"),
          receipt(11, "RUNNING"),
          receipt(12, "UNAVAILABLE", { lastError: "no credit" }),
          receipt(13, "FAILED", { canReadAgain: false }),
        ],
        120
      )
    );

    const rows = byTestId("scan-queue-receipt");
    expect(rows.map((row) => text(row.querySelector("app-status-chip")))).toEqual([
      "Waiting for the AI",
      "Being read",
      "AI not reachable",
      "Given up",
    ]);
    expect(rows[0].querySelector('[data-testid="scan-queue-receipt-link"]')?.getAttribute("href")).toBe("/receipts/10/view");
    expect(text(rows[2].querySelector('[data-testid="scan-queue-receipt-error"]'))).toBe("no credit");
    // Not while it is being read, and not for someone who may not change the receipt.
    expect(rows.map((row) => row.querySelector('[data-testid="scan-queue-read-again"]') !== null)).toEqual([true, false, true, false]);
    expect(text(byTestId("scan-queue-receipts-more")[0])).toBe("These are the newest 4 of 120.");
  });

  it("asks for another read and keeps asking until the receipt is read", async () => {
    vi.useFakeTimers();
    await create(
      queueOf([], [receipt(12, "UNAVAILABLE")]),
      queueOf([], [receipt(12, "PENDING")]),
      queueOf([], [receipt(12, "RUNNING")]),
      queueOf()
    );
    // Nothing is on its way: the card does not ask by itself.
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS * 3);
    expect(getScanQueue).toHaveBeenCalledTimes(1);

    byTestId("scan-queue-read-again")[0].click();
    expect(readReceiptProducts).toHaveBeenCalledWith(12);
    expect(snackbar.success).toHaveBeenCalledWith("The receipt will be read again.");
    expect(getScanQueue).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(4);

    // Read: it left the list, and the card stops asking.
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS * 3);
    expect(getScanQueue).toHaveBeenCalledTimes(4);
    fixture.detectChanges();
    expect(byTestId("scan-queue-receipt")).toHaveLength(0);
  });

  it("asks again every few seconds while a photo is on its way, quietly, and stops when none is", async () => {
    vi.useFakeTimers();
    await create(queueOf([scan(1, "READING")]), queueOf([scan(1, "RETRYING", { attempts: 1 })]), queueOf([scan(1, "FAILED", { attempts: 4 })]));
    expect(getScanQueue).toHaveBeenCalledTimes(1);
    // The first read is the page's own and may say what went wrong.
    expect(getScanQueue.mock.calls[0][2]).toBeUndefined();

    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(2);
    expect((getScanQueue.mock.calls[1][2].context as HttpContext).get(QUIET_ERRORS)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(3);

    // Failed for good: nothing is on its way any more.
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS * 4);
    expect(getScanQueue).toHaveBeenCalledTimes(3);
  });

  it("stops asking when the page is left", async () => {
    vi.useFakeTimers();
    await create(queueOf([scan(1, "WAITING")]));

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS * 3);

    expect(getScanQueue).toHaveBeenCalledTimes(1);
  });

  it("says so when the queue cannot be loaded, and loads on Refresh", async () => {
    await create(new Error("offline"), queueOf([scan(1, "FAILED", { attempts: 4 })]));

    expect(text(byTestId("scan-queue-error")[0])).toBe("The scan queue could not be loaded.");
    expect(byTestId("scan-queue-scans")).toHaveLength(0);

    byTestId("scan-queue-refresh")[0].click();
    await fixture.whenStable();

    expect(byTestId("scan-queue-error")).toHaveLength(0);
    expect(byTestId("scan-queue-scan")).toHaveLength(1);
  });

  it("keeps what it showed when a later read fails", async () => {
    vi.useFakeTimers();
    await create(queueOf([scan(1, "WAITING")]), new Error("offline"));

    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    fixture.detectChanges();

    expect(getScanQueue).toHaveBeenCalledTimes(2);
    expect(byTestId("scan-queue-error")).toHaveLength(0);
    expect(byTestId("scan-queue-scan")).toHaveLength(1);
  });

  describe("Read all again", () => {
    /** The confirmation the card opens: what it was told, and the answer it gives. */
    const confirmWith = (answer: boolean | undefined): { headerText?: string; confirmText?: string; dialogContent?: string } => {
      const componentInstance = {};
      dialog.open.mockReturnValue({ componentInstance, afterClosed: () => of(answer) });
      return componentInstance;
    };

    const everything = (): ScanQueue =>
      queueOf(
        [scan(1, "WAITING"), scan(2, "FAILED", { attempts: 4, canRerun: true }), scan(3, "FAILED", { attempts: 4 })],
        [
          receipt(10, "PENDING"),
          receipt(11, "RUNNING"),
          receipt(12, "UNAVAILABLE"),
          receipt(13, "FAILED"),
          receipt(14, "FAILED", { canReadAgain: false }),
        ]
      );

    it("is offered only when something can be sent again", async () => {
      await create(queueOf([scan(1, "WAITING"), scan(3, "FAILED", { attempts: 4 })], [receipt(10, "PENDING"), receipt(11, "RUNNING")]));

      expect(byTestId("scan-queue-read-all")).toHaveLength(0);
    });

    it("asks first with the numbers, then sends each failed photo and each receipt that is not in line, quietly", async () => {
      await create(everything(), queueOf([scan(1, "WAITING"), scan(2, "WAITING")], [receipt(12, "PENDING"), receipt(13, "PENDING")]));
      const confirmation = confirmWith(true);

      byTestId("scan-queue-read-all")[0].click();
      await fixture.whenStable();

      expect(confirmation.headerText).toBe("Read all again");
      expect(confirmation.confirmText).toBe("Read all again");
      expect(confirmation.dialogContent).toBe(
        "Send these to the AI again? Receipts: 2. Photos: 1. Each one is a read your AI provider counts."
      );

      // Not the photo that waits, the one without the right, the receipts in line or being read, or another's.
      expect(rerunQueuedScan.mock.calls.map((call) => call[0])).toEqual([2]);
      expect(readReceiptProducts.mock.calls.map((call) => call[0])).toEqual([12, 13]);
      expect((rerunQueuedScan.mock.calls[0][3].context as HttpContext).get(QUIET_ERRORS)).toBe(true);
      expect((readReceiptProducts.mock.calls[0][3].context as HttpContext).get(QUIET_ERRORS)).toBe(true);

      expect(snackbar.success).toHaveBeenCalledWith("Everything is in line to be read again.");
      expect(snackbar.error).not.toHaveBeenCalled();
      expect(getScanQueue).toHaveBeenCalledTimes(2);
      expect(byTestId("scan-queue-read-all")).toHaveLength(0);
    });

    it("sends nothing when the question is not confirmed", async () => {
      await create(everything());
      confirmWith(undefined);

      byTestId("scan-queue-read-all")[0].click();
      await fixture.whenStable();

      expect(rerunQueuedScan).not.toHaveBeenCalled();
      expect(readReceiptProducts).not.toHaveBeenCalled();
      expect(getScanQueue).toHaveBeenCalledTimes(1);
    });

    it("goes on past a refusal and says how many were refused, in one message", async () => {
      await create(everything());
      confirmWith(true);
      readReceiptProducts.mockImplementation((receiptId: number) =>
        receiptId === 12 ? throwError(() => new Error("refused")) : of({})
      );

      byTestId("scan-queue-read-all")[0].click();
      await fixture.whenStable();

      expect(readReceiptProducts.mock.calls.map((call) => call[0])).toEqual([12, 13]);
      expect(snackbar.error).toHaveBeenCalledTimes(1);
      expect(snackbar.error).toHaveBeenCalledWith("Not everything could be put in line. Refused: 1 of 3.");
      expect(snackbar.success).not.toHaveBeenCalled();
      expect(getScanQueue).toHaveBeenCalledTimes(2);
    });
  });

  it("says when the queue is not what it was at the last look, never at the first", async () => {
    vi.useFakeTimers();
    await create(queueOf([scan(1, "READING")]), queueOf([scan(1, "READING")]), queueOf());
    let changes = 0;
    fixture.componentInstance.changed.subscribe(() => changes++);

    // The same again: nothing to say.
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(2);
    expect(changes).toBe(0);

    // The photo became a receipt.
    await vi.advanceTimersByTimeAsync(SCAN_QUEUE_REFRESH_MS);
    expect(getScanQueue).toHaveBeenCalledTimes(3);
    expect(changes).toBe(1);
  });

  it("cuts a long reason short until it is asked for in full", async () => {
    watchResizes();
    const long = "Quota exceeded for this model. ".repeat(12).trim();
    await create(queueOf([], [receipt(12, "UNAVAILABLE", { lastError: long }), receipt(13, "FAILED", { lastError: "no credit" })]));

    const reasons = byTestId("scan-queue-receipt-error");
    expect(text(reasons[0])).toBe(long);
    expect(reasons.map((reason) => reason.classList.contains("line-clamp-3"))).toEqual([true, true]);
    // Nothing is known to be cut yet, so nothing offers more.
    expect(byTestId("scan-queue-reason-toggle")).toHaveLength(0);

    // The long one does not fit its three lines; the short one does.
    const measured = (reason: HTMLElement) => observedResizes().find((entry) => entry.element === reason);
    measured(reasons[0])?.resize({ scrollHeight: 120, clientHeight: 60 });
    measured(reasons[1])?.resize({ scrollHeight: 20, clientHeight: 20 });
    fixture.detectChanges();

    // Only the long one has the toggle.
    const toggles = byTestId("scan-queue-reason-toggle");
    expect(toggles).toHaveLength(1);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("false");

    toggles[0].click();
    fixture.detectChanges();

    expect(byTestId("scan-queue-receipt-error")[0].classList.contains("line-clamp-3")).toBe(false);
    expect(text(byTestId("scan-queue-reason-toggle")[0])).toBe("Show less");
    expect(byTestId("scan-queue-reason-toggle")[0].getAttribute("aria-expanded")).toBe("true");
  });
});
