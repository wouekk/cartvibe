import { Injectable } from "@angular/core";

/**
 * Where a store keeps its slice between visits: `localStorage`, one key per slice, plain JSON. The keys and the
 * shape are the ones the NGXS storage plugin wrote, so a browser that used an earlier version keeps its session,
 * page sizes and filters. Specs get `NoStateStorage` instead (`src/testing/test-providers.ts`), so one test's
 * state never reaches the next.
 */
@Injectable({ providedIn: "root" })
export class StateStorage {
  /** What is kept under the key; undefined when there is nothing, or nothing readable. */
  public read(key: string): unknown {
    try {
      const kept = localStorage.getItem(key);
      return kept === null ? undefined : JSON.parse(kept);
    } catch {
      // Storage is blocked (a private window) or holds something that is not JSON: start from the defaults.
      return undefined;
    }
  }

  public write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage is blocked or full: the state lives for this visit only.
    }
  }
}
