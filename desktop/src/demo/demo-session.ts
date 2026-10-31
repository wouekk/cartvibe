import { Injectable } from "@angular/core";
import { DemoBackend } from "./backend/demo-backend";
import { clearDemoStorage } from "./demo-storage";

/** Today as the sample data sees it: the UTC calendar day, the same zone the demo's settings name. */
export function demoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The one in-memory backend of a visit, and the Reset. A reset throws the household away, forgets the saved screen
 * state, and loads the page again at its start address (so no page of a deleted receipt stays open).
 */
@Injectable({ providedIn: "root" })
export class DemoSession {
  public readonly backend = new DemoBackend(demoToday());

  public reset(): void {
    this.backend.reset();
    clearDemoStorage(window.localStorage);
    clearDemoStorage(window.sessionStorage);
    this.restart();
  }

  /** The browser's full page load; a seam so a spec can see that it happens (jsdom cannot replace the location). */
  public restart(): void {
    const base = document.querySelector("base")?.getAttribute("href") ?? "/";
    window.location.assign(base);
  }
}
