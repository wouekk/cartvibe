import { ShoppingList } from "../open-api";
import { buildItemSuggestions, filterItemSuggestions } from "./shopping-item-suggestions";

const item = (name: string, extra: Record<string, unknown> = {}) => ({ name, isChecked: false, unit: "pcs", ...extra });
const list = (id: number, items: ReturnType<typeof item>[]): ShoppingList => ({ id, items }) as unknown as ShoppingList;

describe("shopping item suggestions", () => {
  it("collects distinct names from every list, newest first, with the latest amount and unit", () => {
    const suggestions = buildItemSuggestions(
      [
        list(1, [item("Milk", { isChecked: true, amount: "1", unit: "l", checkedAt: "2026-10-01T10:00:00Z" })]),
        list(2, [item("milk", { isChecked: true, amount: "2", unit: "l", checkedAt: "2026-10-10T10:00:00Z" }), item("Eggs", { isChecked: true, amount: "10", checkedAt: "2026-10-05T10:00:00Z" })]),
      ],
      3
    );

    expect(suggestions).toEqual([
      { name: "milk", amount: "2", unit: "l" },
      { name: "Eggs", amount: "10", unit: "pcs" },
    ]);
  });

  it("leaves out names already open on the current list but keeps crossed-off ones", () => {
    const suggestions = buildItemSuggestions(
      [list(1, [item("Bread"), item("Butter", { isChecked: true, checkedAt: "2026-10-01T10:00:00Z" })])],
      1
    );

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(["Butter"]);
  });

  it("offers an item without an amount as just its name", () => {
    const [suggestion] = buildItemSuggestions([list(1, [item("Salt", { isChecked: true, checkedAt: "2026-10-01T10:00:00Z" })])], 2);

    expect(suggestion).toEqual({ name: "Salt", amount: undefined, unit: undefined });
  });

  it("filters by what was typed: prefix matches first, then containing, never the exact text, capped", () => {
    const names = ["Whole milk", "Milk", "Oat milk", "Milkshake", "Bread"].map((name) => ({ name }));

    expect(filterItemSuggestions(names, "mil").map((suggestion) => suggestion.name)).toEqual(["Milk", "Milkshake", "Whole milk", "Oat milk"]);
    expect(filterItemSuggestions(names, "MILK").map((suggestion) => suggestion.name)).toEqual(["Milkshake", "Whole milk", "Oat milk"]);
    expect(filterItemSuggestions(names, "mil", 2)).toHaveLength(2);
    expect(filterItemSuggestions(names, "  ")).toEqual([]);
    expect(filterItemSuggestions(names, "zzz")).toEqual([]);
  });
});
