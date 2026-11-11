import { AboutState } from "./about.state";
import { AuthState } from "./auth.state";
import { FeatureConfigState } from "./feature-config.state";
import { GroupState } from "./group.state";
import { LayoutState } from "./layout.state";
import { ShoppingListState } from "./shopping-list.state";
import { SystemSettingsState } from "./system-settings.state";
import { UserState } from "./user.state";

/**
 * The app's store, in one place: `app.config.ts` provides it and the specs' `StoreModule` builds on the same two
 * lists, so a spec never runs against a store the app does not have.
 */
export const ngxsStates = [
  AboutState,
  AuthState,
  FeatureConfigState,
  GroupState,
  LayoutState,
  // Not in ngxsStorageKeys: ShoppingListSyncService keeps its copy in IndexedDB (lists and waiting changes).
  ShoppingListState,
  SystemSettingsState,
  UserState,
];

/** The slices kept in the browser between visits. A slice added here needs its fallback in the selector. */
export const ngxsStorageKeys = [
  "about",
  "auth",
  "groups",
  "layout",
  "systemSettings",
  "users",
];
