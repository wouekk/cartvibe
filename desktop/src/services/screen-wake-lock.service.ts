import { Injectable, signal } from "@angular/core";

/**
 * Keeps the screen on while someone walks the aisles with a list open. The browser drops the lock whenever the tab is
 * hidden, so while the person wants it on it is taken again as soon as the tab is visible. Browsers without the Screen
 * Wake Lock API (`supported` false) simply never offer the switch.
 */
@Injectable({ providedIn: "root" })
export class ScreenWakeLockService {
  public readonly supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  /** True while the person asked for the screen to stay on (the lock itself may be briefly released). */
  public readonly enabled = signal(false);

  private sentinel: WakeLockSentinel | null = null;

  public constructor() {
    if (this.supported) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.enabled() && !this.sentinel) {
          void this.acquire();
        }
      });
    }
  }

  public async enable(): Promise<boolean> {
    if (!this.supported) {
      return false;
    }

    this.enabled.set(true);
    const acquired = await this.acquire();
    if (!acquired) {
      this.enabled.set(false);
    }

    return acquired;
  }

  public async disable(): Promise<void> {
    this.enabled.set(false);
    const sentinel = this.sentinel;
    this.sentinel = null;
    await sentinel?.release().catch(() => undefined);
  }

  private async acquire(): Promise<boolean> {
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null;
        }
      });
      this.sentinel = sentinel;
      return true;
    } catch {
      // Refused (low battery, power saver, hidden tab): the screen simply follows the device's own timeout.
      return false;
    }
  }
}
