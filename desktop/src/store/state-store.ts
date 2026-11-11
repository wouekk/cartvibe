import { inject, Signal, signal, WritableSignal } from "@angular/core";
import { StateStorage } from "./state-storage";

/**
 * One slice of the app's state, held in a signal. A store is a root service: its readers are signals (`computed`
 * over `state`), its writers are methods, and nothing outside it writes the slice.
 *
 * With a `storageKey` the slice is kept between visits (`StateStorage`). What was kept is laid over the defaults,
 * so a key added in a later version starts at its default in a browser that kept an older slice; a value nested
 * inside a kept key still needs its own fallback where it is read.
 */
export abstract class StateStore<T extends object> {
  private readonly storage = inject(StateStorage);

  private readonly slice: WritableSignal<T>;

  /** The whole slice, read-only. */
  public readonly state: Signal<T>;

  protected constructor(
    private readonly defaults: () => T,
    private readonly storageKey?: string
  ) {
    this.slice = signal(this.restore());
    this.state = this.slice.asReadonly();
  }

  /** Changes the named keys and leaves the rest. */
  protected patch(change: Partial<T>): void {
    this.replace({ ...this.slice(), ...change });
  }

  /** Puts a whole new slice in place. */
  protected replace(next: T): void {
    this.slice.set(next);
    if (this.storageKey) {
      this.storage.write(this.storageKey, next);
    }
  }

  /** Back to the defaults. */
  protected reset(): void {
    this.replace(this.defaults());
  }

  private restore(): T {
    const defaults = this.defaults();
    const kept = this.storageKey ? this.storage.read(this.storageKey) : undefined;
    return isRecord(kept) ? { ...defaults, ...kept } : defaults;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
