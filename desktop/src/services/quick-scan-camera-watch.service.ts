import { DOCUMENT } from "@angular/common";
import { inject, Injectable } from "@angular/core";
import { marker } from "../i18n/marker";
import { ProblemReporter } from "./problem-reporter.service";
import { SnackbarService } from "./snackbar.service";

/** Where the note that the camera is open is kept, so it outlives the page. */
export const QUICK_SCAN_CAMERA_KEY = "cartvibe.quickScanCamera";

/** A photo that has not arrived this long after the page came back was not taken: the person closed the camera. */
export const CAMERA_RETURN_GRACE_MS = 20_000;

/** A note older than this is not worth a message any more (the report is still sent). */
const MESSAGE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type Stage = "camera" | "back" | "preparing";

interface CameraNote {
  at: number;
  stage: Stage;
}

/**
 * Notices a Quick Scan photo that never arrived because the phone closed the page.
 *
 * *Take a photo* hands over to the phone's camera app. While that app is in front, Android may close the browser's
 * page to free memory, and a large photo can do the same while it is being prepared. Either way the page starts
 * again, the Quick Scan sheet is gone, nothing was uploaded, and nothing anywhere says why. So the dialog leaves a
 * note in the browser's storage when the camera is opened and takes it away when the photo is in the list (or the
 * person came back without one). A note still there when the app starts means the page did not live to see the
 * photo: the person is told what happened and what works instead, and the server's log gets a line.
 */
@Injectable({ providedIn: "root" })
export class QuickScanCameraWatch {
  private readonly document = inject(DOCUMENT);
  private readonly snackbarService = inject(SnackbarService);
  private readonly problemReporter = inject(ProblemReporter);

  private graceTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly onVisible = (): void => {
    if (this.document.visibilityState !== "visible" || this.read()?.stage !== "camera") {
      return;
    }
    // Back from the camera and still alive. The photo arrives in a moment; if none does, the camera was closed
    // without one (not every browser says so), and the note goes.
    this.write("back");
    clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      if (this.read()?.stage === "back") {
        this.done();
      }
    }, CAMERA_RETURN_GRACE_MS);
  };

  /** The person tapped *Take a photo*: the camera app is about to take over. */
  public cameraOpened(): void {
    this.write("camera");
    this.document.addEventListener("visibilitychange", this.onVisible);
  }

  /** The photo came back and is being shrunk for upload, which is where a very large one can bring the page down. */
  public preparing(): void {
    if (this.read()) {
      clearTimeout(this.graceTimer);
      this.write("preparing");
    }
  }

  /** The photo is in the list, the camera was closed without one, or the dialog is gone: nothing to watch. */
  public done(): void {
    clearTimeout(this.graceTimer);
    this.document.removeEventListener("visibilitychange", this.onVisible);
    try {
      localStorage.removeItem(QUICK_SCAN_CAMERA_KEY);
    } catch {
      // Nothing was kept, so nothing is left.
    }
  }

  /** At the app's start: a note left behind means the page was closed before the photo arrived. */
  public checkAtStart(): void {
    const note = this.read();
    if (!note) {
      return;
    }
    this.done();

    const seconds = Math.max(0, Math.round((Date.now() - note.at) / 1000));
    const when = { camera: "while the camera was open", back: "just after the camera closed", preparing: "while the photo was being prepared" }[note.stage];
    const view = this.document.defaultView;
    const installed = view?.matchMedia?.("(display-mode: standalone)").matches === true;
    const memory = (view?.navigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
    this.problemReporter.report(
      "quick-scan-camera-closed",
      `the page was closed ${when}, ${seconds} s after Take a photo; ` +
        `${installed ? "installed app" : "browser tab"}, ${view?.isSecureContext ? "https" : "plain http"}, ` +
        `device memory ${memory ?? "unknown"} GB`
    );

    if (Date.now() - note.at < MESSAGE_MAX_AGE_MS) {
      this.snackbarService.info(
        marker(
          "The phone closed CartVibe before the photo from the camera arrived, so nothing was scanned. Take the photo with the camera app first, then add it in Quick Scan with Upload photos."
        )
      );
    }
  }

  private read(): CameraNote | null {
    try {
      const note = JSON.parse(localStorage.getItem(QUICK_SCAN_CAMERA_KEY) ?? "null");
      return typeof note?.at === "number" && ["camera", "back", "preparing"].includes(note?.stage) ? note : null;
    } catch {
      return null;
    }
  }

  private write(stage: Stage): void {
    try {
      const at = this.read()?.at ?? Date.now();
      localStorage.setItem(QUICK_SCAN_CAMERA_KEY, JSON.stringify({ at, stage }));
    } catch {
      // A browser that keeps nothing cannot be watched; the scan itself is unaffected.
    }
  }
}
