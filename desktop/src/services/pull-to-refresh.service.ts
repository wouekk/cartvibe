import { DestroyRef, Injectable, inject } from "@angular/core";

/** How far (in px, after resistance) the page must be pulled down before letting go reloads it. */
export const PULL_REFRESH_THRESHOLD = 72;
const MAX_PULL = 120;
const RESISTANCE = 0.5;

/**
 * Pull to refresh for the installed app (display mode standalone), where the browser's own reload gesture is gone.
 * Holding the top of the page and dragging down shows an arrow; letting go past the threshold reloads the page, which
 * fetches everything fresh. It only starts when the page is scrolled to the top, nothing inside it scrolls, and no
 * dialog or menu is open. In a normal browser tab it does nothing.
 */
@Injectable({ providedIn: "root" })
export class PullToRefreshService {
  private readonly destroyRef = inject(DestroyRef);

  private startY: number | null = null;
  private pull = 0;
  private indicator: HTMLElement | null = null;

  public constructor() {
    if (!this.isStandalone()) {
      return;
    }

    document.addEventListener("touchstart", this.onStart, { passive: true });
    document.addEventListener("touchmove", this.onMove, { passive: false });
    document.addEventListener("touchend", this.onEnd, { passive: true });
    document.addEventListener("touchcancel", this.onCancel, { passive: true });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener("touchstart", this.onStart);
      document.removeEventListener("touchmove", this.onMove);
      document.removeEventListener("touchend", this.onEnd);
      document.removeEventListener("touchcancel", this.onCancel);
      this.removeIndicator();
    });
  }

  /** The browser's reload; a seam so a spec can see it (jsdom cannot reload). */
  public reload(): void {
    window.location.reload();
  }

  protected isStandalone(): boolean {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  private onStart = (event: TouchEvent): void => {
    this.startY = null;
    if (event.touches.length !== 1 || !this.canStartFrom(event.target)) {
      return;
    }
    this.startY = event.touches[0].clientY;
    this.pull = 0;
  };

  private onMove = (event: TouchEvent): void => {
    if (this.startY === null) {
      return;
    }
    const delta = (event.touches[0].clientY - this.startY) * RESISTANCE;
    if (delta <= 0) {
      // Scrolling up (or not moving yet): this is not a pull.
      if (this.pull === 0) {
        this.startY = null;
      }
      return;
    }
    this.pull = Math.min(delta, MAX_PULL);
    if (event.cancelable) {
      event.preventDefault();
    }
    this.draw();
  };

  private onEnd = (): void => {
    const shouldReload = this.startY !== null && this.pull >= PULL_REFRESH_THRESHOLD;
    this.startY = null;
    if (shouldReload) {
      this.draw(true);
      this.reload();
      return;
    }
    this.pull = 0;
    this.removeIndicator();
  };

  private onCancel = (): void => {
    this.startY = null;
    this.pull = 0;
    this.removeIndicator();
  };

  private canStartFrom(target: EventTarget | null): boolean {
    if ((window.scrollY || document.documentElement.scrollTop) > 0) {
      return false;
    }
    if (document.querySelector(".cdk-overlay-pane, [role='dialog']")) {
      return false;
    }
    // Something in the way scrolls (a table, a list, a full-height page): let it scroll instead.
    for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop > 0) {
        return false;
      }
    }
    return true;
  }

  private draw(loading = false): void {
    if (!this.indicator) {
      const el = document.createElement("div");
      el.setAttribute("data-testid", "pull-to-refresh");
      el.setAttribute("aria-hidden", "true");
      el.className =
        "pointer-events-none fixed left-1/2 top-0 z-[1200] flex size-10 items-center justify-center rounded-full border border-border bg-popover text-popover-foreground shadow-lg";
      el.innerHTML =
        '<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
      document.body.appendChild(el);
      this.indicator = el;
    }
    const ready = this.pull >= PULL_REFRESH_THRESHOLD;
    const y = this.pull - 32;
    this.indicator.style.transform = `translate(-50%, calc(${y}px + env(safe-area-inset-top, 0px)))`;
    this.indicator.style.opacity = String(Math.min(1, this.pull / PULL_REFRESH_THRESHOLD));
    const svg = this.indicator.firstElementChild as SVGElement;
    svg.style.transition = "transform 150ms";
    svg.style.transform = ready ? "rotate(180deg)" : "none";
    this.indicator.classList.toggle("animate-pulse", loading);
  }

  private removeIndicator(): void {
    this.indicator?.remove();
    this.indicator = null;
  }
}
