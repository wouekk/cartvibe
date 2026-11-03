import {
  Category,
  CurrencySeparator,
  CurrencySymbolPosition,
  GroupReceiptSettings,
  GroupStatus,
  OcrEngine,
  PermissionScope,
  QueueName,
  Receipt,
  ReceiptProduct,
  ReceiptStatus,
  ReportRequestCommand,
  ShoppingList,
  ShoppingListItem,
  ShoppingTripView,
  SystemTaskStatus,
  SystemTaskType,
  Tag,
} from "../../open-api";
import { addDays, dayToWire, instantOn, monthStart } from "./dates";
import { DemoDb } from "./db";
import { formatCents, parseCents, sumCents } from "./money";

/** The household everything in the demo belongs to. */
export const DEMO_GROUP_ID = 1;
export const DEMO_USER_ID = 1;
export const DEMO_APP_ADMIN_ROLE_ID = 1;
export const DEMO_APP_USER_ROLE_ID = 2;
export const DEMO_GROUP_OWNER_ROLE_ID = 3;
export const DEMO_GROUP_MEMBER_ROLE_ID = 4;

const CATEGORY_NAMES = [
  ["Fresh Produce", "Fresh fruit and vegetables"],
  ["Dairy", "Milk, yoghurt, cheese, butter, eggs"],
  ["Bakery", "Bread and pastries"],
  ["Meat", "Meat, poultry and cold cuts"],
  ["Drinks", "Water, juice, soft drinks, coffee and tea"],
  ["Sweets & Snacks", "Sweets, chocolate, crisps and snacks"],
  ["Pantry", "Pasta, rice, flour, tins, sauces and spices"],
  ["Household", "Cleaning products, paper and other household goods"],
  ["Personal Care", "Toiletries and cosmetics"],
  ["Restaurant", "Meals in restaurants and bars"],
  ["Taxi", "Taxis and ride-hailing"],
  ["Pharmacy", "Medicines and pharmacy products"],
  ["Electronics", "Gadgets and appliances"],
] as const;

const category = (name: string): number => CATEGORY_NAMES.findIndex(([label]) => label === name) + 1;

const TAGS = {
  weekly: { id: 1, name: "Weekly shop", description: "The big shop of the week", showOnDashboard: true },
  treat: { id: 2, name: "Treat", description: "Something nice", showOnDashboard: false },
  kids: { id: 3, name: "Kids", description: "", showOnDashboard: false },
} satisfies Record<string, Tag>;

type Health = "HEALTHY" | "MEDIUM" | "UNHEALTHY" | "NOT_FOOD";
type Season = "SEASONAL" | "OUT_OF_SEASON" | "NOT_PRODUCE";

interface Line {
  name: string;
  amount: string;
  category: string;
  health: Health;
  quantity?: string;
  season?: Season;
  tags?: Tag[];
  /** Whether the line was on the shopping list the receipt's trip was compared with. */
  planned?: boolean;
}

const line = (name: string, amount: string, categoryName: string, health: Health, extra: Partial<Line> = {}): Line => ({
  name,
  amount,
  category: categoryName,
  health,
  ...extra,
});

interface ReceiptSpec {
  name: string;
  shop: string;
  /** How many whole months back (0 = this month). */
  monthsBack: number;
  /** Day of the month for earlier months; this month's receipts are spread over the days so far (`thisMonthDays`). */
  day: number;
  paidBy: number;
  status: ReceiptStatus;
  lines: Line[];
  /** An amount the lines do not add up to: the rest shows as Uncategorized, like an unsplit total. */
  extra?: string;
  tags?: Tag[];
  comment?: string;
  warrantyDaysFromToday?: number;
  warrantyProducts?: string[];
}

const SPECS: ReceiptSpec[] = [
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 0,
    day: 1,
    paidBy: 1,
    status: ReceiptStatus.Open,
    tags: [TAGS.weekly],
    comment: "Remember to check the milk date next time.",
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2", planned: true }),
      line("Sourdough bread", "2.49", "Bakery", "MEDIUM", { planned: true }),
      line("Apples, 1 kg", "3.20", "Fresh Produce", "HEALTHY", { quantity: "1", season: "SEASONAL", planned: true }),
      line("Chicken breast", "6.99", "Meat", "MEDIUM", { planned: true }),
      line("Spaghetti 500 g", "1.35", "Pantry", "MEDIUM", { planned: true }),
      line("Cola 2 l", "1.89", "Drinks", "UNHEALTHY", { planned: false }),
      line("Milk chocolate bar", "1.79", "Sweets & Snacks", "UNHEALTHY", { planned: false }),
      line("Dish soap", "2.45", "Household", "NOT_FOOD", { planned: true }),
    ],
  },
  {
    name: "Pizza night",
    shop: "Luigi's Kitchen",
    monthsBack: 0,
    day: 3,
    paidBy: 2,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.treat],
    lines: [
      line("Pizza Margherita", "9.50", "Restaurant", "MEDIUM"),
      line("Pizza Diavola", "11.00", "Restaurant", "UNHEALTHY"),
      line("Sparkling water", "3.20", "Drinks", "HEALTHY"),
      line("Tiramisu", "6.50", "Restaurant", "UNHEALTHY"),
    ],
  },
  {
    name: "Fruit and veg",
    shop: "Farmers Stall",
    monthsBack: 0,
    day: 5,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    lines: [
      line("Strawberries 500 g", "4.20", "Fresh Produce", "HEALTHY", { season: "OUT_OF_SEASON" }),
      line("Carrots 1 kg", "1.60", "Fresh Produce", "HEALTHY", { season: "SEASONAL" }),
      line("Pumpkin", "3.10", "Fresh Produce", "HEALTHY", { season: "SEASONAL" }),
      line("Free-range eggs x10", "3.40", "Dairy", "HEALTHY"),
    ],
  },
  {
    name: "Wireless headphones",
    shop: "Tech Corner",
    monthsBack: 0,
    day: 8,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    warrantyDaysFromToday: 41,
    warrantyProducts: ["Wireless headphones"],
    lines: [line("Wireless headphones", "79.00", "Electronics", "NOT_FOOD")],
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 1,
    day: 4,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly],
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "3" }),
      line("Greek yoghurt", "1.89", "Dairy", "HEALTHY"),
      line("Rye bread", "2.30", "Bakery", "HEALTHY"),
      line("Bananas", "1.75", "Fresh Produce", "HEALTHY", { season: "NOT_PRODUCE" }),
      line("Minced beef 500 g", "5.49", "Meat", "MEDIUM"),
      line("Orange juice 1 l", "2.20", "Drinks", "MEDIUM"),
      line("Crisps", "1.99", "Sweets & Snacks", "UNHEALTHY"),
      line("Toilet paper x8", "4.99", "Household", "NOT_FOOD"),
    ],
  },
  {
    name: "Kitchen mixer",
    shop: "Home & Co",
    monthsBack: 1,
    day: 9,
    paidBy: 3,
    status: ReceiptStatus.Resolved,
    warrantyDaysFromToday: 420,
    warrantyProducts: ["Stand mixer"],
    lines: [line("Stand mixer", "129.90", "Electronics", "NOT_FOOD")],
  },
  {
    name: "Pharmacy",
    shop: "City Pharmacy",
    monthsBack: 1,
    day: 14,
    paidBy: 2,
    status: ReceiptStatus.Resolved,
    lines: [
      line("Vitamin C", "6.40", "Pharmacy", "NOT_FOOD"),
      line("Shampoo", "4.20", "Personal Care", "NOT_FOOD"),
      line("Plasters", "2.10", "Pharmacy", "NOT_FOOD"),
    ],
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 1,
    day: 21,
    paidBy: 3,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly, TAGS.kids],
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2" }),
      line("Butter", "2.39", "Dairy", "MEDIUM"),
      line("Wholemeal toast", "1.79", "Bakery", "HEALTHY"),
      line("Tomatoes", "2.80", "Fresh Produce", "HEALTHY", { season: "OUT_OF_SEASON" }),
      line("Salmon fillet", "7.90", "Meat", "HEALTHY"),
      line("Gummy bears", "1.29", "Sweets & Snacks", "UNHEALTHY"),
    ],
    extra: "3.00",
  },
  {
    name: "Taxi home",
    shop: "RideNow",
    monthsBack: 2,
    day: 6,
    paidBy: 2,
    status: ReceiptStatus.Resolved,
    lines: [line("Ride", "14.80", "Taxi", "NOT_FOOD")],
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 2,
    day: 15,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly],
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2" }),
      line("Baguette", "1.40", "Bakery", "MEDIUM"),
      line("Lettuce", "1.10", "Fresh Produce", "HEALTHY", { season: "SEASONAL" }),
      line("Pork chops", "6.20", "Meat", "MEDIUM"),
      line("Lemonade", "1.59", "Drinks", "UNHEALTHY"),
      line("Rice 1 kg", "2.10", "Pantry", "MEDIUM"),
    ],
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 3,
    day: 7,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly],
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2" }),
      line("Bread rolls", "1.80", "Bakery", "MEDIUM"),
      line("Cucumber", "0.99", "Fresh Produce", "HEALTHY", { season: "SEASONAL" }),
      line("Sausages", "3.59", "Meat", "UNHEALTHY"),
    ],
    extra: "26.00",
  },
  {
    name: "Dinner out",
    shop: "Luigi's Kitchen",
    monthsBack: 3,
    day: 19,
    paidBy: 2,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.treat],
    lines: [line("Pasta carbonara", "12.50", "Restaurant", "MEDIUM"), line("House wine", "18.00", "Drinks", "UNHEALTHY")],
    extra: "6.00",
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 4,
    day: 11,
    paidBy: 1,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly],
    lines: [
      line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2" }),
      line("Sourdough bread", "2.49", "Bakery", "MEDIUM"),
      line("Oranges", "3.80", "Fresh Produce", "HEALTHY", { season: "SEASONAL" }),
    ],
    extra: "41.00",
  },
  {
    name: "Weekly shop",
    shop: "Greenfield Market",
    monthsBack: 5,
    day: 13,
    paidBy: 3,
    status: ReceiptStatus.Resolved,
    tags: [TAGS.weekly],
    lines: [line("Whole milk 1 l", "1.19", "Dairy", "HEALTHY", { quantity: "2" }), line("Pasta sauce", "1.99", "Pantry", "MEDIUM")],
    extra: "52.00",
  },
];

/** The day of an earlier month's receipt: its day of the month. */
function specDay(today: string, spec: ReceiptSpec): string {
  return addDays(monthStart(today, -spec.monthsBack), spec.day - 1);
}

/** Gives this month's receipts days spread over the days so far, in the order they were written (newest first). */
function thisMonthDays(today: string, count: number): number[] {
  const offsets = [0, 1, 3, 5, 7, 9];
  const maxBack = Number(today.slice(8, 10)) - 1;
  return offsets.slice(0, count).map((back) => Math.min(back, maxBack));
}

export function buildReceipts(today: string): { receipts: Receipt[]; products: ReceiptProduct[] } {
  const receipts: Receipt[] = [];
  const products: ReceiptProduct[] = [];
  const thisMonth = SPECS.filter((spec) => spec.monthsBack === 0);
  const backs = thisMonthDays(today, thisMonth.length);

  let receiptId = 0;
  let productId = 0;
  for (const spec of SPECS) {
    receiptId += 1;
    const day = spec.monthsBack === 0 ? addDays(today, -backs[thisMonth.indexOf(spec)]) : specDay(today, spec);
    const lineCents = sumCents(spec.lines.map((entry) => entry.amount));
    const total = lineCents + parseCents(spec.extra);

    spec.lines.forEach((entry, index) => {
      productId += 1;
      const categoryId = category(entry.category);
      products.push({
        id: productId,
        receiptId,
        createdAt: instantOn(day),
        updatedAt: instantOn(day),
        name: entry.name.toUpperCase(),
        displayName: entry.name,
        amount: entry.amount,
        quantity: entry.quantity ?? "1",
        position: index + 1,
        health: entry.health,
        foodGroup: entry.category,
        seasonality: entry.season ?? "NOT_PRODUCE",
        classifiedAt: instantOn(day),
        classificationOverridden: false,
        planned: entry.planned,
        categoryId,
        categoryOverridden: false,
        // Tags label the lines themselves (a receipt-level tag is only older data).
        tags: entry.tags ?? spec.tags ?? [],
      });
    });

    receipts.push({
      id: receiptId,
      name: spec.name,
      shopName: spec.shop,
      amount: formatCents(total),
      date: dayToWire(day),
      groupId: DEMO_GROUP_ID,
      paidByUserId: spec.paidBy,
      status: spec.status,
      categories: [],
      tags: [],
      comments: spec.comment
        ? [{ id: receiptId, receiptId, userId: 2, comment: spec.comment, createdAt: instantOn(day, 18) }]
        : [],
      firstComment: spec.comment,
      imageFiles: [0, 1, 3].includes(receiptId - 1)
        ? [{ id: receiptId, receiptId, name: `receipt-${receiptId}.svg`, fileType: "image/svg+xml", size: 2048, createdAt: instantOn(day, 9) }]
        : [],
      createdAt: instantOn(day, 9),
      createdBy: spec.paidBy,
      updatedAt: instantOn(day, 9),
      resolvedDate: spec.status === ReceiptStatus.Resolved ? instantOn(day, 20) : undefined,
      warrantyUntil:
        // A warranty end is a bare `yyyy-MM-dd` on the wire (unlike the receipt's own date), which the days-left maths reads.
        spec.warrantyDaysFromToday === undefined ? undefined : addDays(today, spec.warrantyDaysFromToday),
      warrantyProducts: spec.warrantyProducts,
    });
  }

  return { receipts, products };
}

/** A list item: `amount` and `unit` are what the app shows ("500 g"); `quantity` is the older free text and stays empty. */
function item(
  id: number,
  listId: number,
  name: string,
  amount: string,
  unit: string,
  health: Health,
  categoryName: string,
  checked = false,
  today = "",
): ShoppingListItem {
  return {
    id,
    shoppingListId: listId,
    name,
    quantity: "",
    unit,
    note: "",
    amount,
    isChecked: checked,
    checkedAt: checked ? instantOn(today, 11) : undefined,
    checkedByUserId: checked ? 1 : undefined,
    health,
    foodGroup: categoryName,
    seasonality: "NOT_PRODUCE",
    classifiedAt: instantOn(today, 8),
    classificationOverridden: false,
    createdAt: instantOn(today, 8),
    createdBy: 1,
  };
}

export function buildLists(today: string): ShoppingList[] {
  const yesterday = addDays(today, -1);
  return [
    {
      id: 1,
      groupId: DEMO_GROUP_ID,
      name: "Weekly shop",
      createdAt: instantOn(yesterday, 20),
      createdBy: 1,
      items: [
        item(1, 1, "Whole milk", "2", "l", "HEALTHY", "Dairy", true, today),
        item(2, 1, "Sourdough bread", "1", "pcs", "MEDIUM", "Bakery", true, today),
        item(3, 1, "Apples", "1", "kg", "HEALTHY", "Fresh Produce", false, today),
        item(4, 1, "Chicken breast", "500", "g", "MEDIUM", "Meat", false, today),
        item(5, 1, "Spaghetti", "500", "g", "MEDIUM", "Pantry", false, today),
        item(6, 1, "Greek yoghurt", "2", "pcs", "HEALTHY", "Dairy", false, today),
        item(7, 1, "Dish soap", "1", "pcs", "NOT_FOOD", "Household", false, today),
        item(8, 1, "Cherry tomatoes", "250", "g", "HEALTHY", "Fresh Produce", false, today),
      ],
    },
    {
      id: 2,
      groupId: DEMO_GROUP_ID,
      name: "Party on Saturday",
      createdAt: instantOn(today, 7),
      createdBy: 2,
      items: [
        item(11, 2, "Sparkling water", "6", "pcs", "HEALTHY", "Drinks", false, today),
        item(12, 2, "Crisps", "3", "pcs", "UNHEALTHY", "Sweets & Snacks", false, today),
        item(13, 2, "Pizza dough", "2", "pcs", "MEDIUM", "Pantry", false, today),
        item(14, 2, "Paper plates", "1", "pcs", "NOT_FOOD", "Household", false, today),
        item(15, 2, "Lemons", "4", "pcs", "HEALTHY", "Fresh Produce", false, today),
      ],
    },
    {
      id: 3,
      groupId: DEMO_GROUP_ID,
      name: "Pharmacy run",
      createdAt: instantOn(addDays(today, -9), 10),
      createdBy: 2,
      items: [
        item(21, 3, "Vitamin C", "1", "pcs", "NOT_FOOD", "Pharmacy", true, addDays(today, -9)),
        item(22, 3, "Plasters", "1", "pcs", "NOT_FOOD", "Pharmacy", true, addDays(today, -9)),
      ],
    },
  ];
}

function buildTrips(db: DemoDb): ShoppingTripView[] {
  const receipt = db.receipts[0];
  return [
    {
      id: 1,
      shoppingListId: 1,
      createdAt: receipt.createdAt ?? instantOn(db.today),
      status: "DONE",
      lastError: "",
      waitingForPhoto: false,
      receipt: { id: receipt.id, name: receipt.name, date: receipt.date, amount: receipt.amount },
      plannedItemCount: 6,
      productCount: 8,
      unplannedAmount: "3.68",
      unplannedProducts: ["Cola 2 l", "Milk chocolate bar"],
    },
  ];
}

const REPORT_SPENT = { kind: "aggregate", name: "Spent", label: "Spent", aggFunc: "SUM", measure: "amount" } as const;
const REPORT_RECEIPTS = { kind: "aggregate", name: "Receipts", label: "Receipts", aggFunc: "COUNT" } as const;
const REPORT_AVERAGE = { kind: "aggregate", name: "Average", label: "Average receipt", aggFunc: "AVG", measure: "amount" } as const;

export function buildReportCommands(): ReportRequestCommand[] {
  const groupIds = [String(DEMO_GROUP_ID)];
  const period = { preset: "ytd", dateField: "date" } as const;
  const formats: ReportRequestCommand["formats"] = ["pdf"];
  return [
    {
      name: "Monthly spending by category",
      groupIds,
      period,
      groupBy: ["date_month"],
      groupByLabels: { date_month: "Month" },
      detail: { mode: "aggregate", by: "category" },
      columns: [{ kind: "dimension", name: "Category", label: "Category", field: "category" }, REPORT_SPENT, REPORT_RECEIPTS],
      subtotals: true,
      grandTotals: true,
      document: {
        title: "Monthly spending by category",
        intro: "What the household spent each month, split by category, for {{period}}.",
        footer: "Generated {{generatedAt}}",
      },
      formats,
    },
    {
      name: "Spending by shop",
      groupIds,
      period,
      groupBy: [],
      detail: { mode: "aggregate", by: "shop" },
      columns: [{ kind: "dimension", name: "Shop", label: "Shop", field: "shop" }, REPORT_SPENT, REPORT_RECEIPTS, REPORT_AVERAGE],
      grandTotals: true,
      document: {
        title: "Spending by shop",
        intro: "Where the household shops and how much goes to each shop, for {{period}}.",
        footer: "Generated {{generatedAt}}",
      },
      formats,
    },
    {
      name: "Month by month",
      groupIds,
      period,
      groupBy: [],
      detail: { mode: "aggregate", by: "date_month" },
      columns: [{ kind: "dimension", name: "Month", label: "Month", field: "date_month" }, REPORT_SPENT, REPORT_RECEIPTS, REPORT_AVERAGE],
      grandTotals: true,
      document: {
        title: "Month by month",
        intro: "The year so far: total spent, number of receipts and the average receipt each month, for {{period}}.",
        footer: "Generated {{generatedAt}}",
      },
      formats,
    },
  ];
}

const ALL_ACTIONS = ["read", "update", "delete", "duplicate", "generate"];

function groupReceiptSettings(): GroupReceiptSettings {
  return {
    id: 1,
    createdAt: "2026-01-01T00:00:00Z",
    groupId: DEMO_GROUP_ID,
    hideImages: false,
    hideReceiptCategories: true,
    hideReceiptTags: true,
    hideComments: false,
    quickScanPaidByEnabled: false,
    quickScanPaidByRequired: false,
    quickScanDefaultPaidByType: "UPLOADER",
    quickScanStatusEnabled: false,
    quickScanStatusRequired: false,
    quickScanDefaultStatus: ReceiptStatus.Open,
    quickScanCategoriesEnabled: false,
    quickScanCategoriesRequired: false,
    quickScanTagsEnabled: false,
    quickScanTagsRequired: false,
    quickScanCommentEnabled: false,
    quickScanCommentRequired: false,
  };
}

/** Builds the sample household around `today` (`yyyy-MM-dd`). Same input, same data. */
export function createDemoDb(today: string): DemoDb {
  const { receipts, products } = buildReceipts(today);
  const created = "2026-01-01T00:00:00Z";

  const categories: Category[] = CATEGORY_NAMES.map(([name, description], index) => ({
    id: index + 1,
    name,
    description,
    skipped: false,
    aliases: "",
    createdAt: created,
  }));

  const db: DemoDb = {
    today,
    nextIds: {},
    currentUserId: DEMO_USER_ID,
    users: [
      { id: 1, username: "alex", displayName: "Alex Demo", defaultAvatarColor: "#6366f1", isDummyUser: false, appRoleId: DEMO_APP_ADMIN_ROLE_ID, createdAt: created },
      { id: 2, username: "sam", displayName: "Sam Demo", defaultAvatarColor: "#10b981", isDummyUser: false, appRoleId: DEMO_APP_USER_ROLE_ID, createdAt: created },
      { id: 3, username: "jo", displayName: "Jo Demo", defaultAvatarColor: "#f59e0b", isDummyUser: false, appRoleId: DEMO_APP_USER_ROLE_ID, createdAt: created },
    ],
    groups: [
      {
        id: DEMO_GROUP_ID,
        name: "Household",
        isDefault: true,
        isAllGroup: false,
        isolateMembers: false,
        status: GroupStatus.Active,
        createdAt: created,
        groupReceiptSettings: groupReceiptSettings(),
        groupMembers: [
          { groupId: DEMO_GROUP_ID, userId: 1, groupRoleId: DEMO_GROUP_OWNER_ROLE_ID, categoryGrants: [], tagGrants: [] },
          { groupId: DEMO_GROUP_ID, userId: 2, groupRoleId: DEMO_GROUP_MEMBER_ROLE_ID, categoryGrants: [], tagGrants: [] },
          { groupId: DEMO_GROUP_ID, userId: 3, groupRoleId: DEMO_GROUP_MEMBER_ROLE_ID, categoryGrants: [], tagGrants: [] },
        ],
      },
    ],
    roles: [
      { id: DEMO_APP_ADMIN_ROLE_ID, name: "Legacy Admin", description: "Full application access.", scope: PermissionScope.App, isDefault: false, isSystem: true, permissions: [], assignedCount: 1 },
      { id: DEMO_APP_USER_ROLE_ID, name: "User", description: "Household member.", scope: PermissionScope.App, isDefault: true, isSystem: true, permissions: [], assignedCount: 2 },
      { id: DEMO_GROUP_OWNER_ROLE_ID, name: "Legacy Owner", description: "Owner of a household.", scope: PermissionScope.Group, isDefault: false, isSystem: true, permissions: [], assignedCount: 1 },
      { id: DEMO_GROUP_MEMBER_ROLE_ID, name: "Member", description: "Member of a household.", scope: PermissionScope.Group, isDefault: true, isSystem: true, permissions: [], assignedCount: 2 },
    ],
    categories,
    tags: Object.values(TAGS).map((tag) => ({ ...tag, createdAt: created })),
    receipts,
    products,
    lists: buildLists(today),
    trips: [],
    reportTemplates: [],
    // Worded and tokenised exactly as the API writes them, so they translate and link like the real ones.
    notifications: [
      { id: 1, userId: DEMO_USER_ID, type: "NORMAL", title: "Going shopping", body: "${userId:2.displayName:string} is going shopping. Add what you need to the lists in ${groupId:1.name:string}.", createdAt: instantOn(today, 9) },
      { id: 2, userId: DEMO_USER_ID, type: "NORMAL", title: "Receipt ready", body: "The receipt: Weekly shop has been read by the AI. Check it out! ${receiptId:1.:link}", createdAt: instantOn(today, 10) },
    ],
    systemTasks: [
      {
        id: 1,
        createdAt: instantOn(today, 10),
        type: SystemTaskType.QuickScan,
        status: SystemTaskStatus.Succeeded,
        startedAt: instantOn(today, 10),
        endedAt: instantOn(today, 10),
        ranByUserId: DEMO_USER_ID,
        receiptId: 1,
        groupId: DEMO_GROUP_ID,
        resultDescription: "Sample scan (the demo reads receipts from a script, not an AI).",
      },
    ],
    processingSettings: [
      {
        id: 1,
        createdAt: created,
        name: "Demo reader",
        description: "A scripted reader: the demo never calls an AI.",
        aiType: "OPEN_AI",
        model: "demo",
        isVisionModel: true,
        enforceJsonResponseFormat: false,
        ocrEngine: OcrEngine.Tesseract,
      },
    ],
    preferences: {
      id: 1,
      createdAt: created,
      userId: DEMO_USER_ID,
      quickScanDefaultGroupId: DEMO_GROUP_ID,
      quickScanDefaultPaidById: DEMO_USER_ID,
      quickScanDefaultStatus: ReceiptStatus.Open,
      closeChipSelectOnSelect: false,
      monthlySpendingGoal: "650.00",
      displayCurrency: "",
      displayCurrencyRate: "",
      language: "en",
      onboardingPending: false,
      region: "",
      warrantyPeriodYears: 0,
      warrantyReminderLeadDays: 14,
      userShortcuts: [],
    },
    settings: {
      id: 1,
      createdAt: created,
      enableLocalSignUp: false,
      currencyDisplay: " €",
      currencyThousandthsSeparator: CurrencySeparator.Period,
      currencyDecimalSeparator: CurrencySeparator.Comma,
      currencySymbolPosition: CurrencySymbolPosition.End,
      currencyHideDecimalPlaces: false,
      debugOcr: false,
      numWorkers: 1,
      receiptProcessingSettingsId: 1,
      taskConcurrency: 2,
      pdfDpi: 150,
      taskQueueConfigurations: [
        { id: 1, createdAt: created, name: QueueName.QuickScan, priority: 5 },
        { id: 2, createdAt: created, name: QueueName.SystemCleanUp, priority: 1 },
      ],
      mcpEnabled: false,
      mcpPublicUrl: "",
      serverPublicUrl: "",
      refreshTokenValidForHours: 720,
      mcpRefreshTokenValidForHours: 720,
      tempFileRetentionHours: 24,
      timeZone: "UTC",
      dateFormat: "DD/MM/YYYY",
      secureCookies: false,
      shopLogoKeySet: false,
    },
    dashboardLayout: { id: 1, createdAt: created, userId: DEMO_USER_ID, layout: "", canCustomise: true },
    exchangeRates: [
      { code: "EUR", rate: "1" },
      { code: "USD", rate: "1.08" },
      { code: "PLN", rate: "4.30" },
    ],
  };

  db.reportTemplates = buildReportCommands().map((configuration, index) => ({
    id: index + 1,
    createdAt: created,
    createdBy: DEMO_USER_ID,
    name: configuration.name ?? "Report",
    configuration,
    configurationVersion: 1,
    allowedActions: ALL_ACTIONS,
  }));
  db.trips = buildTrips(db);

  return db;
}
