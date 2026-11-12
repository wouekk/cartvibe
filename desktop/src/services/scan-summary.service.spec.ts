import { HttpContext } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Observable, of, Subject, throwError } from "rxjs";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { ScanQueueService, ScanQueueSummary } from "../open-api";
import { SCAN_SUMMARY_REFRESH_MS, ScanSummaryService } from "./scan-summary.service";

import type { Mock } from "vitest";

describe("ScanSummaryService", () => {
  let service: ScanSummaryService;
  let getScanQueueSummary: Mock;

  /** Each call takes the next answer; the last one repeats. */
  const setUp = (...answers: (ScanQueueSummary | Error | Observable<ScanQueueSummary>)[]): void => {
    let call = 0;
    getScanQueueSummary = vi.fn(() => {
      const answer = answers[Math.min(call++, answers.length - 1)];
      if (answer instanceof Error) {
        return throwError(() => answer);
      }
      return answer instanceof Observable ? answer : of(answer);
    });
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ScanQueueService, useValue: { getScanQueueSummary } }],
    });
    service = TestBed.inject(ScanSummaryService);
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks nothing until told to, then holds the counts", () => {
    setUp({ waiting: 0, failed: 1 });
    expect(getScanQueueSummary).not.toHaveBeenCalled();

    service.refresh();

    expect(service.waiting()).toBe(0);
    expect(service.failed()).toBe(1);
    // Quiet: a count that cannot be read must never toast.
    expect((getScanQueueSummary.mock.calls[0][2].context as HttpContext).get(QUIET_ERRORS)).toBe(true);
  });

  it("asks again by itself while photos are waiting, and stops when none is", async () => {
    setUp({ waiting: 2, failed: 0 }, { waiting: 1, failed: 0 }, { waiting: 0, failed: 0 });

    service.refresh();
    expect(service.waiting()).toBe(2);
    expect(service.settled()).toBe(0);

    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS);
    expect(service.waiting()).toBe(1);
    expect(service.settled()).toBe(1);

    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS);
    expect(service.waiting()).toBe(0);
    expect(service.settled()).toBe(2);

    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS * 4);
    expect(getScanQueueSummary).toHaveBeenCalledTimes(3);
  });

  it("counts a photo that failed for good as settled too", async () => {
    setUp({ waiting: 1, failed: 0 }, { waiting: 1, failed: 0 }, { waiting: 0, failed: 1 });

    service.refresh();
    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS);
    expect(service.settled()).toBe(0);

    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS);
    expect(service.failed()).toBe(1);
    expect(service.settled()).toBe(1);
  });

  it("drops a refresh made while one is on its way, and does not double its timer", async () => {
    const first = new Subject<ScanQueueSummary>();
    setUp(first, { waiting: 0, failed: 0 });

    service.refresh();
    service.refresh();
    expect(getScanQueueSummary).toHaveBeenCalledTimes(1);

    first.next({ waiting: 1, failed: 0 });
    first.complete();
    // A refresh from a page restarts the wait rather than adding a second timer.
    service.refresh();
    expect(getScanQueueSummary).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS * 3);
    expect(getScanQueueSummary).toHaveBeenCalledTimes(2);
  });

  it("shows nothing and stops asking when the count cannot be read", async () => {
    setUp({ waiting: 3, failed: 1 }, new Error("offline"), { waiting: 3, failed: 1 });

    service.refresh();
    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS);

    expect(service.waiting()).toBe(0);
    expect(service.failed()).toBe(0);
    await vi.advanceTimersByTimeAsync(SCAN_SUMMARY_REFRESH_MS * 3);
    expect(getScanQueueSummary).toHaveBeenCalledTimes(2);

    // The next page that asks starts it again.
    service.refresh();
    expect(service.waiting()).toBe(3);
  });
});
