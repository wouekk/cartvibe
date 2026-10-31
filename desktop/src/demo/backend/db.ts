import {
  Category,
  DashboardLayout,
  Group,
  Notification,
  Receipt,
  ReceiptProduct,
  ReceiptProcessingSettings,
  ReportTemplate,
  Role,
  ShoppingList,
  ShoppingTripView,
  SystemSettings,
  SystemTask,
  Tag,
  UserPreferences,
  UserView,
} from "../../open-api";

/**
 * The whole sample household, in memory. Everything the demo backend answers is read from and written to one of these;
 * a Reset builds a fresh one from `createDemoDb`. Nothing here is ever sent anywhere.
 */
export interface DemoDb {
  /** The calendar day the data was built around (`yyyy-MM-dd`, UTC). Dates in the data are offsets from it. */
  today: string;
  nextIds: Record<string, number>;
  users: UserView[];
  groups: Group[];
  roles: Role[];
  categories: Category[];
  tags: Tag[];
  receipts: Receipt[];
  products: ReceiptProduct[];
  lists: ShoppingList[];
  trips: ShoppingTripView[];
  reportTemplates: ReportTemplate[];
  notifications: Notification[];
  systemTasks: SystemTask[];
  processingSettings: ReceiptProcessingSettings[];
  preferences: UserPreferences;
  settings: SystemSettings;
  dashboardLayout: DashboardLayout;
  exchangeRates: { code: string; rate: string }[];
  /** The id of the signed-in sample user. */
  currentUserId: number;
}

export function nextId(db: DemoDb, kind: string): number {
  const id = (db.nextIds[kind] ?? 1000) + 1;
  db.nextIds[kind] = id;
  return id;
}

/** A deep copy that keeps the plain-data shape (the data holds no functions, dates or classes). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
