import { StateStore } from "../store/state-store";

/**
 * Puts keys of a store's slice in a given state, for a spec that starts from something the store's own methods
 * do not build (a slice kept by an older version, another person's session). The keys are checked, the values are
 * not: a spec may seed half an object.
 */
export function seedStore<T extends object>(store: StateStore<T>, state: { [K in keyof T]?: unknown }): void {
  (store as unknown as { patch(change: object): void }).patch(state);
}
