import { TestBed } from "@angular/core/testing";
import { ProblemReporter } from "./problem-reporter.service";
import { CAMERA_RETURN_GRACE_MS, QUICK_SCAN_CAMERA_KEY, QuickScanCameraWatch } from "./quick-scan-camera-watch.service";
import { SnackbarService } from "./snackbar.service";

import type { Mock } from "vitest";

describe("QuickScanCameraWatch", () => {
  let watch: QuickScanCameraWatch;
  let report: Mock;
  let info: Mock;
  let visibility: "visible" | "hidden";

  /** A new start of the app in the same browser: what the storage holds is all that is left of the last one. */
  const start = (): void => {
    TestBed.resetTestingModule();
    report = vi.fn();
    info = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProblemReporter, useValue: { report } },
        { provide: SnackbarService, useValue: { info } },
      ],
    });
    watch = TestBed.inject(QuickScanCameraWatch);
  };

  const comeBack = (): void => {
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  };

  const note = (): { stage: string } | null => JSON.parse(localStorage.getItem(QUICK_SCAN_CAMERA_KEY) ?? "null");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
    localStorage.clear();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    start();
  });

  afterEach(() => {
    watch.done();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("says nothing at a start that follows no camera", () => {
    watch.checkAtStart();

    expect(info).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("leaves nothing behind when the photo arrives", () => {
    watch.cameraOpened();
    visibility = "hidden";
    expect(note()?.stage).toBe("camera");

    comeBack();
    expect(note()?.stage).toBe("back");
    watch.preparing();
    expect(note()?.stage).toBe("preparing");
    watch.done();
    expect(note()).toBeNull();

    start();
    watch.checkAtStart();
    expect(info).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("tells the person and the server when the page was closed while the camera was open", () => {
    watch.cameraOpened();
    visibility = "hidden";

    // The phone closes the page: no event runs, and the app starts again 14 seconds later.
    vi.setSystemTime(new Date("2026-11-12T10:00:14Z"));
    start();
    watch.checkAtStart();

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain("The phone closed CartVibe before the photo from the camera arrived");
    expect(info.mock.calls[0][0]).toContain("Upload photos");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe("quick-scan-camera-closed");
    expect(report.mock.calls[0][1]).toMatch(
      /^the page was closed while the camera was open, 14 s after Take a photo; browser tab, (https|plain http), device memory .+ GB$/
    );
    // Said once: the next start is an ordinary one.
    expect(note()).toBeNull();
    start();
    watch.checkAtStart();
    expect(info).not.toHaveBeenCalled();
  });

  it("tells them apart: the page that went down while the photo was being prepared", () => {
    watch.cameraOpened();
    visibility = "hidden";
    comeBack();
    watch.preparing();

    vi.setSystemTime(new Date("2026-11-12T10:00:09Z"));
    start();
    watch.checkAtStart();

    expect(report.mock.calls[0][1]).toContain("the page was closed while the photo was being prepared, 9 s after Take a photo");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("forgets a camera that was closed without a photo, also where the browser does not say so", async () => {
    watch.cameraOpened();
    visibility = "hidden";
    comeBack();

    // No photo and no cancel event: after the grace the note goes by itself.
    await vi.advanceTimersByTimeAsync(CAMERA_RETURN_GRACE_MS - 1);
    expect(note()?.stage).toBe("back");
    await vi.advanceTimersByTimeAsync(1);
    expect(note()).toBeNull();
  });

  it("does not take a photo that is still being prepared for a closed camera", async () => {
    watch.cameraOpened();
    visibility = "hidden";
    comeBack();
    watch.preparing();

    await vi.advanceTimersByTimeAsync(CAMERA_RETURN_GRACE_MS * 2);

    expect(note()?.stage).toBe("preparing");
  });

  it("reports a note that is too old to be worth a message, without one", () => {
    watch.cameraOpened();
    vi.setSystemTime(new Date("2026-11-13T09:00:00Z"));
    start();
    watch.checkAtStart();

    expect(report).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it("ignores what is not a note of its own", () => {
    localStorage.setItem(QUICK_SCAN_CAMERA_KEY, '{"at":"yesterday","stage":"camera"}');

    expect(() => watch.checkAtStart()).not.toThrow();
    expect(report).not.toHaveBeenCalled();
  });
});
