import { createDemoDb } from "./seed";
import { parseCents, sumCents } from "./money";

const TODAY = "2026-10-31";

/** Every value in a JSON tree, with its key, so a rule can be checked over a whole response. */
function walk(value: unknown, visit: (key: string, value: unknown) => void, key = ""): void {
  visit(key, value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, key));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, child]) => walk(child, visit, childKey));
  }
}

describe("the sample household", () => {
  it("is deterministic: the same day builds the same data", () => {
    expect(JSON.stringify(createDemoDb(TODAY))).toBe(JSON.stringify(createDemoDb(TODAY)));
  });

  it("has a small household with receipts, lines, categories, tags, lists, warranties and a goal", () => {
    const db = createDemoDb(TODAY);

    expect(db.users).toHaveLength(3);
    expect(db.receipts.length).toBeGreaterThanOrEqual(12);
    expect(db.products.length).toBeGreaterThan(db.receipts.length);
    expect(db.categories.length).toBeGreaterThan(5);
    expect(db.lists.length).toBeGreaterThanOrEqual(3);
    expect(db.receipts.filter((receipt) => receipt.warrantyUntil).length).toBe(2);
    expect(db.preferences.monthlySpendingGoal).toBe("650.00");
    expect(db.products.some((product) => product.health === "UNHEALTHY")).toBe(true);
    expect(db.reportTemplates.length).toBeGreaterThanOrEqual(3);
  });

  it("puts receipts in this month and the five before it, whatever day it is", () => {
    for (const today of ["2026-10-01", "2026-10-31", "2026-03-02", "2026-12-15"]) {
      const db = createDemoDb(today);
      const months = new Set(db.receipts.map((receipt) => receipt.date.slice(0, 7)));
      expect(months.has(today.slice(0, 7)), today).toBe(true);
      expect(months.size, today).toBeGreaterThanOrEqual(5);
      expect(db.receipts.every((receipt) => receipt.date.slice(0, 10) <= today), today).toBe(true);
    }
  });

  it("keeps every receipt total at least what its lines add up to", () => {
    const db = createDemoDb(TODAY);
    for (const receipt of db.receipts) {
      const lines = sumCents(db.products.filter((product) => product.receiptId === receipt.id).map((product) => product.amount));
      expect(parseCents(receipt.amount), receipt.name).toBeGreaterThanOrEqual(lines);
    }
  });

  it("writes money as decimal strings and never leaves a null", () => {
    const db = createDemoDb(TODAY);
    const moneyKeys = ["amount", "total", "originalAmount", "unplannedAmount", "monthlySpendingGoal", "rate"];

    walk(db, (key, value) => {
      expect(value, `null at "${key}"`).not.toBeNull();
      if (moneyKeys.includes(key) && value !== undefined) {
        expect(typeof value, key).toBe("string");
        expect(String(value), key).toMatch(/^-?\d+(\.\d+)?$/);
      }
    });
  });

  it("serialises its lists as arrays", () => {
    const db = createDemoDb(TODAY);
    for (const receipt of db.receipts) {
      expect(Array.isArray(receipt.tags)).toBe(true);
      expect(Array.isArray(receipt.categories)).toBe(true);
      expect(typeof receipt.note).toBe("string");
    }
    for (const product of db.products) {
      expect(Array.isArray(product.tags)).toBe(true);
    }
    for (const list of db.lists) {
      expect(Array.isArray(list.items)).toBe(true);
    }
  });
});
