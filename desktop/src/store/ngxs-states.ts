import { AuthState } from "./auth.state";
import { GroupState } from "./group.state";
import { ShoppingListState } from "./shopping-list.state";

/**
 * The app's store, in one place: `app.config.ts` provides it and the specs' `StoreModule` builds on the same two
 * lists, so a spec never runs against a store the app does not have.
 */
export const ngxsStates = [
  AuthState,
  GroupState,
  // Not in ngxsStorageKeys: ShoppingListSyncService keeps its copy in IndexedDB (lists and waiting changes).
  ShoppingListState,
];

/** The slices kept in the browser between visits. A slice added here needs its fallback in the selector. */
export const ngxsStorageKeys = [
  "auth",
  "groups",
];
