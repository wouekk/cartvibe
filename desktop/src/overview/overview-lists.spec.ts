import { ShoppingList } from "../open-api";
import { summarizeShoppingLists } from "./overview-lists";

const list = (id: number, name: string, items: [string, boolean][]): ShoppingList =>
  ({ id, name, items: items.map(([itemName, isChecked], i) => ({ id: id * 100 + i, name: itemName, isChecked })) }) as unknown as ShoppingList;

describe("summarizeShoppingLists", () => {
  it("hides lists with nothing left to buy, finished or empty", () => {
    const result = summarizeShoppingLists(
      [list(1, "Weekly", [["milk", false]]), list(2, "Done", [["bread", true]]), list(3, "New", [])],
      3
    );

    expect(result.map((summary) => summary.name)).toEqual(["Weekly"]);
  });

  it("counts open items only and previews the first few with a remainder", () => {
    const [summary] = summarizeShoppingLists(
      [list(1, "Weekly", [["a", false], ["b", true], ["c", false], ["d", false], ["e", false]])],
      2
    );

    expect(summary.count).toBe(4);
    expect(summary.preview).toBe("a, c, and 2 more");
  });

  it("returns nothing for no lists", () => {
    expect(summarizeShoppingLists([], 3)).toEqual([]);
  });
});
