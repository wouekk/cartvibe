import { DestroyRef, inject, Signal, signal } from "@angular/core";

/** A mouse or trackpad that can hover: wheel scrolling inside a panel is natural there, unlike under a thumb. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Whether the main pointer can hover, kept current when it changes (a tablet with a keyboard cover). False where
 * `matchMedia` is missing, so the touch layout is the fallback. Call it in an injection context.
 */
export function finePointerSignal(): Signal<boolean> {
  const query = typeof matchMedia === "function" ? matchMedia(FINE_POINTER_QUERY) : undefined;
  const fine = signal(query?.matches ?? false);

  if (query) {
    const listener = (event: MediaQueryListEvent) => fine.set(event.matches);
    query.addEventListener?.("change", listener);
    inject(DestroyRef).onDestroy(() => query.removeEventListener?.("change", listener));
  }

  return fine.asReadonly();
}
