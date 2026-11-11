import { AuthState } from "./auth.state";
import { GroupState } from "./group.state";

/**
 * The app's store, in one place: `app.config.ts` provides it and the specs' `StoreModule` builds on the same two
 * lists, so a spec never runs against a store the app does not have.
 */
export const ngxsStates = [
  AuthState,
  GroupState,
];

/** The slices kept in the browser between visits. A slice added here needs its fallback in the selector. */
export const ngxsStorageKeys = [
  "auth",
  "groups",
];
