import { ShoppingList } from "../open-api";
import { activeItemsOf, pickLargestList, summarizeShoppingLists } from "./overview-lists";

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

describe("activeItemsOf", () => {
  it("keeps only items still to buy, in the order they were added", () => {
    const shopping = {
      id: 1,
      name: "Weekly",
      items: [
        { id: 3, name: "c", isChecked: false, createdAt: "2026-10-22T10:00:00Z" },
        { id: 1, name: "a", isChecked: false, createdAt: "2026-10-22T08:00:00Z" },
        { id: 2, name: "b", isChecked: true, createdAt: "2026-10-22T09:00:00Z" },
      ],
    } as unknown as ShoppingList;

    expect(activeItemsOf(shopping).map((item) => item.name)).toEqual(["a", "c"]);
  });

  it("is empty for no list", () => {
    expect(activeItemsOf(undefined)).toEqual([]);
  });
});

describe("pickLargestList", () => {
  it("picks the list with the most items still to buy", () => {
    const picked = pickLargestList([
      list(1, "Small", [["a", false]]),
      list(2, "Big", [["a", false], ["b", false], ["c", true]]),
    ]);

    expect(picked?.name).toBe("Big");
  });

  it("counts open items only, so a long finished list loses", () => {
    const picked = pickLargestList([
      list(1, "Done", [["a", true], ["b", true], ["c", true]]),
      list(2, "Open", [["a", false]]),
    ]);

    expect(picked?.name).toBe("Open");
  });

  it("breaks a tie in favour of the first list", () => {
    const picked = pickLargestList([list(1, "First", [["a", false]]), list(2, "Second", [["b", false]])]);

    expect(picked?.name).toBe("First");
  });

  it("is undefined when nothing is left to buy anywhere", () => {
    expect(pickLargestList([list(1, "Done", [["a", true]]), list(2, "Empty", [])])).toBeUndefined();
    expect(pickLargestList([])).toBeUndefined();
  });
});
