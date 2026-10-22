import { of, throwError } from "rxjs";
import { QuickScanProgress, waitForScannedReceipt } from "./quick-scan-wait";

describe("waitForScannedReceipt", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = (check: () => any, intervalMs = 100, limitMs = 1000): { result: number | null | undefined } => {
    const out: { result: number | null | undefined } = { result: undefined };
    waitForScannedReceipt(check, intervalMs, limitMs).subscribe((value) => (out.result = value));
    return out;
  };

  it("emits the receipt id once the scan is done", () => {
    const answers: QuickScanProgress[] = [{ status: "PENDING" }, { status: "PENDING" }, { status: "DONE", receiptId: 7 }];
    let call = 0;
    const out = run(() => of(answers[call++]));

    jest.advanceTimersByTime(0);
    expect(out.result).toBeUndefined();
    jest.advanceTimersByTime(200);
    expect(out.result).toBe(7);
    expect(call).toBe(3);
  });

  it("emits null when the scan failed", () => {
    const out = run(() => of({ status: "FAILED" }));
    jest.advanceTimersByTime(0);
    expect(out.result).toBeNull();
  });

  it("keeps waiting through a failed poll", () => {
    let call = 0;
    const out = run(() => (call++ === 0 ? throwError(() => new Error("offline")) : of({ status: "DONE", receiptId: 3 })));

    jest.advanceTimersByTime(100);
    expect(out.result).toBe(3);
  });

  it("gives up with null after the limit", () => {
    const out = run(() => of({ status: "PENDING" }), 100, 500);

    jest.advanceTimersByTime(499);
    expect(out.result).toBeUndefined();
    jest.advanceTimersByTime(2);
    expect(out.result).toBeNull();
  });

  it("treats DONE without a receipt id as not followable", () => {
    const out = run(() => of({ status: "DONE" }));
    jest.advanceTimersByTime(0);
    expect(out.result).toBeNull();
  });
});
