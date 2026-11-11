import { AboutState } from "./about.state";
import { AuthState } from "./auth.state";
import { CategoryTableState } from "./category-table.state";
import { FeatureConfigState } from "./feature-config.state";
import { GroupTableState } from "./group-table.state";
import { GroupState } from "./group.state";
import { LayoutState } from "./layout.state";
import { ReceiptProcessingSettingsTaskTableState } from "./receipt-processing-settings-task-table.state";
import { ReceiptTableState } from "./receipt-table.state";
import { ReportTemplateTableState } from "./report-template-table.state";
import { ShoppingListState } from "./shopping-list.state";
import { SystemSettingsState } from "./system-settings.state";
import { SystemTaskTableState } from "./system-task-table.state";
import { TagTableState } from "./tag-table.state";
import { UserTableState } from "./user-table.state";
import { UserState } from "./user.state";

/**
 * The app's store, in one place: `app.config.ts` provides it and the specs' `StoreModule` builds on the same two
 * lists, so a spec never runs against a store the app does not have.
 */
export const ngxsStates = [
  AboutState,
  AuthState,
  CategoryTableState,
  FeatureConfigState,
  GroupState,
  GroupTableState,
  LayoutState,
  ReceiptProcessingSettingsTaskTableState,
  ReceiptTableState,
  ReportTemplateTableState,
  // Not in ngxsStorageKeys: ShoppingListSyncService keeps its copy in IndexedDB (lists and waiting changes).
  ShoppingListState,
  SystemSettingsState,
  SystemTaskTableState,
  TagTableState,
  UserTableState,
  UserState,
];

/** The slices kept in the browser between visits. A slice added here needs its fallback in the selector. */
export const ngxsStorageKeys = [
  "about",
  "auth",
  "categoryTable",
  "groupTable",
  "groups",
  "layout",
  "receiptProcessingSettingsTaskTable",
  "receiptTable",
  "reportTemplateTable",
  "systemSettings",
  "systemTaskTable",
  "tagTable",
  "userTable",
  "users",
];
