import { HttpContext } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Observable, of, Subject, throwError } from "rxjs";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { ClientReportService } from "../open-api";
import { PROBLEM_REPORTS_KEY, ProblemReporter } from "./problem-reporter.service";

import type { Mock } from "vitest";

describe("ProblemReporter", () => {
  let reporter: ProblemReporter;
  let sendClientReport: Mock;

  const setUp = (answer: () => Observable<unknown>): void => {
    sendClientReport = vi.fn(answer);
    TestBed.configureTestingModule({ providers: [{ provide: ClientReportService, useValue: { sendClientReport } }] });
    reporter = TestBed.inject(ProblemReporter);
  };

  const waiting = (): { kind: string; detail: string }[] => JSON.parse(localStorage.getItem(PROBLEM_REPORTS_KEY) ?? "[]");

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("sends a report quietly and keeps nothing once the server took it", () => {
    setUp(() => of(null));

    reporter.report("quick-scan-camera-closed", "the page was closed while the camera was open");

    expect(sendClientReport).toHaveBeenCalledTimes(1);
    expect(sendClientReport.mock.calls[0][0]).toEqual({
      kind: "quick-scan-camera-closed",
      detail: "the page was closed while the camera was open",
    });
    // Quiet: a report must never put a toast on the screen, whatever the server answers.
    expect((sendClientReport.mock.calls[0][3].context as HttpContext).get(QUIET_ERRORS)).toBe(true);
    expect(waiting()).toEqual([]);
  });

  it("keeps a report the server could not take, and sends it at the next start", () => {
    setUp(() => throwError(() => new Error("offline")));
    reporter.report("upload-file-left-out", "notes.txt");
    expect(waiting().map((report) => report.kind)).toEqual(["upload-file-left-out"]);

    // The next start: another instance, the same browser.
    TestBed.resetTestingModule();
    setUp(() => of(null));
    reporter.flush();

    expect(sendClientReport).toHaveBeenCalledTimes(1);
    expect(sendClientReport.mock.calls[0][0].kind).toBe("upload-file-left-out");
    expect(waiting()).toEqual([]);
  });

  it("says when a report that waited happened", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
    setUp(() => throwError(() => new Error("offline")));
    reporter.report("upload-file-left-out", "notes.txt");

    vi.setSystemTime(new Date("2026-11-12T12:30:00Z"));
    TestBed.resetTestingModule();
    setUp(() => of(null));
    reporter.flush();

    expect(sendClientReport.mock.calls[0][0].detail).toBe("notes.txt [happened 2026-11-12T10:00:00.000Z]");
  });

  it("sends what waits oldest first, one at a time, and stops at one the server does not take", () => {
    const answers: Subject<unknown>[] = [];
    setUp(() => {
      const answer = new Subject<unknown>();
      answers.push(answer);
      return answer;
    });

    reporter.report("first", "1");
    reporter.report("second", "2");
    expect(sendClientReport).toHaveBeenCalledTimes(1);

    answers[0].next(null);
    answers[0].complete();
    expect(sendClientReport).toHaveBeenCalledTimes(2);
    expect(sendClientReport.mock.calls[1][0].kind).toBe("second");

    answers[1].error(new Error("offline"));
    expect(waiting().map((report) => report.kind)).toEqual(["second"]);
    expect(sendClientReport).toHaveBeenCalledTimes(2);
  });

  it("keeps the last ten and drops what waited a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    setUp(() => throwError(() => new Error("offline")));
    for (let i = 1; i <= 12; i++) {
      reporter.report("upload-failed", String(i));
    }
    expect(waiting().map((report) => report.detail)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);

    vi.setSystemTime(new Date("2026-11-09T10:00:01Z"));
    reporter.report("upload-failed", "new");
    expect(waiting().map((report) => report.detail)).toEqual(["new"]);
  });

  it("never throws over what the browser kept", () => {
    localStorage.setItem(PROBLEM_REPORTS_KEY, "{not json");
    setUp(() => of(null));

    expect(() => reporter.flush()).not.toThrow();
    expect(sendClientReport).not.toHaveBeenCalled();
  });
});
