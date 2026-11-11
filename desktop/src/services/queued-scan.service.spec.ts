import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { ReceiptService, ReceiptStatus } from "../open-api";
import { QueuedScan, QueuedScanService } from "./queued-scan.service";
import { SnackbarService } from "./snackbar.service";
import { TokenRefreshService } from "./token-refresh.service";

const scan = (name: string): QueuedScan => ({
  files: [new Blob([name], { type: "image/jpeg" })],
  groupIds: [1],
  paidByUserIds: [7],
  statuses: [ReceiptStatus.Open],
  categoryIds: [""],
  tagIds: [""],
  notes: [name],
});

const settled = async () => {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
  }
};

describe("QueuedScanService", () => {
  let service: QueuedScanService;
  let storage: OfflineStorageService;
  let quickScanReceipt: Mock;
  let snackbar: { success: Mock; error: Mock };
  let ensureFreshToken: Mock;

  beforeEach(() => {
    quickScanReceipt = vi.fn().mockReturnValue(of({}));
    snackbar = { success: vi.fn(), error: vi.fn() };
    ensureFreshToken = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: ReceiptService, useValue: { quickScanReceipt } },
        { provide: SnackbarService, useValue: snackbar },
        { provide: TokenRefreshService, useValue: { ensureFreshToken } },
      ],
    });
    storage = TestBed.inject(OfflineStorageService);
  });

  afterEach(() => service?.ngOnDestroy());

  const start = async () => {
    service = TestBed.inject(QueuedScanService);
    await settled();
  };

  it("queues only a scan that never reached the server", () => {
    expect(QueuedScanService.shouldQueue(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(QueuedScanService.shouldQueue(new HttpErrorResponse({ status: 400 }))).toBe(false);
    expect(QueuedScanService.shouldQueue(new HttpErrorResponse({ status: 500 }))).toBe(false);
  });

  it("keeps a scan while the server cannot be reached, and uploads it as it was when it can", async () => {
    await start();
    quickScanReceipt.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    await service.queue(scan("till"));
    await settled();

    expect(service.waiting()).toBe(1);
    expect(await storage.keys("quick-scan:")).toHaveLength(1);
    expect(snackbar.success).not.toHaveBeenCalled();
    expect(snackbar.error).not.toHaveBeenCalled();

    quickScanReceipt.mockReturnValue(of({}));
    await service.flush();

    const [files, groupIds, paidByUserIds, statuses, categoryIds, tagIds, notes, observe, , options] =
      quickScanReceipt.mock.calls[quickScanReceipt.mock.calls.length - 1];
    expect(files).toHaveLength(1);
    expect([groupIds, paidByUserIds, statuses, categoryIds, tagIds, notes]).toEqual([[1], [7], [ReceiptStatus.Open], [""], [""], ["till"]]);
    expect(observe).toBe("body");
    expect(options.context.get(QUIET_ERRORS)).toBe(true);

    expect(service.waiting()).toBe(0);
    expect(await storage.keys("quick-scan:")).toEqual([]);
    expect(snackbar.success).toHaveBeenCalledTimes(1);
  });

  it("uploads what an earlier visit left behind as soon as the app opens, oldest first", async () => {
    await storage.set("quick-scan:000001700000000-1", scan("first"));
    await storage.set("quick-scan:000001700000999-2", scan("second"));

    await start();

    expect(quickScanReceipt.mock.calls.map((call) => call[6])).toEqual([["first"], ["second"]]);
    expect(await storage.keys("quick-scan:")).toEqual([]);
  });

  it("uploads a scan an earlier version of the app kept: its comment as the note, a removed status as what it became", async () => {
    await storage.set("quick-scan:1", {
      files: [new Blob(["old"], { type: "image/jpeg" })],
      groupIds: [1],
      paidByUserIds: [7],
      statuses: ["NEEDS_ATTENTION"],
      categoryIds: [""],
      tagIds: [""],
      comments: ["for the party"],
    });
    await storage.set("quick-scan:2", { ...scan("new"), statuses: ["DECLINED"] });

    await start();

    expect(quickScanReceipt.mock.calls.map((call) => [call[3], call[6]])).toEqual([
      [[ReceiptStatus.Open], ["for the party"]],
      [[ReceiptStatus.Resolved], ["new"]],
    ]);
    expect(await storage.keys("quick-scan:")).toEqual([]);
  });

  it("stops at the first scan that cannot be sent and keeps the rest", async () => {
    await storage.set("quick-scan:1", scan("first"));
    await storage.set("quick-scan:2", scan("second"));
    quickScanReceipt.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

    await start();

    expect(quickScanReceipt).toHaveBeenCalledTimes(1);
    expect(await storage.keys("quick-scan:")).toHaveLength(2);
    expect(service.waiting()).toBe(2);
  });

  it("removes a scan the server refuses for good and says why", async () => {
    await storage.set("quick-scan:1", scan("too large"));
    quickScanReceipt.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 413, error: { errorMsg: "The file is too large" } }))
    );

    await start();

    expect(await storage.keys("quick-scan:")).toEqual([]);
    expect(snackbar.error).toHaveBeenCalledWith("The file is too large");
    expect(service.waiting()).toBe(0);
  });

  it("does not send with a session it could not renew", async () => {
    await storage.set("quick-scan:1", scan("first"));
    ensureFreshToken.mockResolvedValue(false);

    await start();

    expect(quickScanReceipt).not.toHaveBeenCalled();
    expect(await storage.keys("quick-scan:")).toHaveLength(1);
  });

  it("clears an entry that holds no photo", async () => {
    await storage.set("quick-scan:1", { files: [] });

    await start();

    expect(quickScanReceipt).not.toHaveBeenCalled();
    expect(await storage.keys("quick-scan:")).toEqual([]);
  });
});
