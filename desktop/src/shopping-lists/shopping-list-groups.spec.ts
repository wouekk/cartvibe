import { ShoppingList, ShoppingListItem } from "../open-api";
import { activeLists, isPastList, recentPastLists } from "./shopping-list-groups";

const item = (isChecked: boolean): ShoppingListItem => ({ isChecked } as ShoppingListItem);

const list = (id: number, checked: boolean[], updatedAt = "2026-10-01T00:00:00Z"): ShoppingList =>
  ({ id, name: `List ${id}`, items: checked.map(item), updatedAt } as ShoppingList);

describe("shopping list groups", () => {
  it("treats a list as past only when it has items and all are crossed off", () => {
    expect(isPastList(list(1, [true, true]))).toBe(true);
    expect(isPastList(list(2, [true, false]))).toBe(false);
    expect(isPastList(list(3, []))).toBe(false);
  });

  it("keeps active lists in their order", () => {
    const lists = [list(1, [false]), list(2, [true]), list(3, [])];

    expect(activeLists(lists).map((l) => l.id)).toEqual([1, 3]);
  });

  it("orders past lists by their last cross-off before the list's own update time", () => {
    const crossedOff = (id: number, checkedAt: string): ShoppingList =>
      ({ ...list(id, [], "2026-10-09T00:00:00Z"), items: [{ isChecked: true, checkedAt } as ShoppingListItem] }) as ShoppingList;
    const lists = [crossedOff(1, "2026-10-01T00:00:00Z"), crossedOff(2, "2026-10-05T00:00:00Z")];

    expect(recentPastLists(lists).map((l) => l.id)).toEqual([2, 1]);
  });

  it("shows the latest three past lists, newest first", () => {
    const lists = [
      list(1, [true], "2026-10-01T00:00:00Z"),
      list(2, [true], "2026-10-04T00:00:00Z"),
      list(3, [true], "2026-10-03T00:00:00Z"),
      list(4, [true], "2026-10-02T00:00:00Z"),
      list(5, [false], "2026-10-09T00:00:00Z"),
    ];

    expect(recentPastLists(lists).map((l) => l.id)).toEqual([2, 3, 4]);
  });
});
