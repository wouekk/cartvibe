import { Receipt, ReceiptProduct, ReceiptStatus } from "../../open-api";
import { dayToWire, instantOn } from "./dates";
import { DemoDb, nextId } from "./db";
import { formatCents, parseCents } from "./money";
import { DEMO_GROUP_ID } from "./seed";

/**
 * The demo's "AI": a fixed reading of a sample receipt. A Quick Scan, Magic Fill or "Read again" never looks at the
 * picture that was sent; it always finds this one, so what the visitor sees is the same on every visit and nothing is
 * sent to a model.
 */
export const SCRIPTED_SCAN = {
  name: "Sunday brunch",
  shopName: "Corner Bakery",
  lines: [
    { name: "Croissants x4", amount: "6.80", category: "Bakery", health: "MEDIUM", quantity: "4" },
    { name: "Orange juice 1 l", amount: "2.90", category: "Drinks", health: "MEDIUM", quantity: "1" },
    { name: "Free-range eggs x6", amount: "2.60", category: "Dairy", health: "HEALTHY", quantity: "1" },
    { name: "Raspberry jam", amount: "3.10", category: "Pantry", health: "UNHEALTHY", quantity: "1" },
    { name: "Fresh basil", amount: "1.50", category: "Fresh Produce", health: "HEALTHY", quantity: "1" },
  ],
} as const;

export function scriptedTotal(): string {
  return formatCents(SCRIPTED_SCAN.lines.reduce((sum, entry) => sum + parseCents(entry.amount), 0));
}

function categoryId(db: DemoDb, name: string): number | undefined {
  return db.categories.find((category) => category.name === name)?.id;
}

/** The scripted lines as products of a receipt. */
export function scriptedProducts(db: DemoDb, receiptId: number): ReceiptProduct[] {
  return SCRIPTED_SCAN.lines.map((entry, index) => ({
    id: nextId(db, "product"),
    receiptId,
    createdAt: instantOn(db.today),
    updatedAt: instantOn(db.today),
    name: entry.name.toUpperCase(),
    displayName: entry.name,
    amount: entry.amount,
    quantity: entry.quantity,
    position: index + 1,
    health: entry.health,
    foodGroup: entry.category,
    seasonality: "NOT_PRODUCE",
    classifiedAt: instantOn(db.today),
    classificationOverridden: false,
    categoryId: categoryId(db, entry.category),
    categoryOverridden: false,
    tags: [],
  }));
}

/** What Magic Fill hands the form: the scripted receipt, not saved. */
export function scriptedReceiptDraft(db: DemoDb, paidByUserId: number): Receipt {
  return {
    id: 0,
    name: SCRIPTED_SCAN.name,
    shopName: SCRIPTED_SCAN.shopName,
    amount: scriptedTotal(),
    date: dayToWire(db.today),
    groupId: DEMO_GROUP_ID,
    paidByUserId,
    status: ReceiptStatus.Open,
    categories: [],
    tags: [],
    comments: [],
  };
}

/** Saves the scripted receipt with its lines, as a finished Quick Scan would. */
export function addScriptedReceipt(db: DemoDb, groupId: number, paidByUserId: number, status: ReceiptStatus): Receipt {
  const id = nextId(db, "receipt");
  const receipt: Receipt = {
    ...scriptedReceiptDraft(db, paidByUserId),
    id,
    groupId,
    status,
    createdAt: instantOn(db.today),
    createdBy: paidByUserId,
    updatedAt: instantOn(db.today),
    imageFiles: [
      {
        id: nextId(db, "file"),
        receiptId: id,
        name: "scan.svg",
        fileType: "image/svg+xml",
        size: 1024,
        createdAt: instantOn(db.today),
      },
    ],
  };
  db.receipts.push(receipt);
  db.products.push(...scriptedProducts(db, id));
  return receipt;
}
