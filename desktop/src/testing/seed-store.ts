import { StateStore } from "../store/state-store";

/**
 * Puts keys of a store's slice in a given state, for a spec that starts from something the store's own methods
 * do not build (a slice kept by an older version, another person's session).
 */
export function seedStore<T extends object>(store: StateStore<T>, state: Partial<T>): void {
  (store as unknown as { patch(change: Partial<T>): void }).patch(state);
}
