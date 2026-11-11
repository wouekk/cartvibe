import { ShoppingList, ShoppingListItem } from "../open-api";
import { anyInUsualOrder, learnUsualOrder, sortByUsualOrder, TRIP_GAP_MS, usualOrderKey } from "./usual-order";

const DAY = Date.parse("2026-11-07T10:00:00Z");
const MINUTE = 60 * 1000;

let nextId = 1;

/** An item crossed off so many minutes into the day (or still to buy when no minute is given). */
function item(name: string, minute?: number, day = DAY): ShoppingListItem {
  return {
    id: nextId++,
    name,
    isChecked: minute !== undefined,
    checkedAt: minute === undefined ? undefined : new Date(day + minute * MINUTE).toISOString(),
  } as ShoppingListItem;
}

function list(id: number, items: ShoppingListItem[]): ShoppingList {
  return { id, name: `List ${id}`, groupId: 1, items } as ShoppingList;
}

describe("usualOrderKey", () => {
  it("treats two spellings of one item as the same thing", () => {
    expect(usualOrderKey("  Milk ")).toBe("milk");
    expect(usualOrderKey("MILK")).toBe("milk");
    expect(usualOrderKey("Greek   yoghurt")).toBe("greek yoghurt");
    expect(usualOrderKey("   ")).toBe("");
  });
});

describe("learnUsualOrder", () => {
  it("places each item between first and last by when it was crossed off", () => {
    const order = learnUsualOrder([list(1, [item("Bread", 30), item("Apples", 2), item("Milk", 16)])]);

    expect(order.get("apples")).toBe(0);
    expect(order.get("milk")).toBe(0.5);
    expect(order.get("bread")).toBe(1);
  });

  it("averages an item's place over the trips it was bought on", () => {
    const order = learnUsualOrder([
      list(1, [item("Apples", 1), item("Milk", 5), item("Bread", 9)]),
      list(2, [item("Milk", 1), item("Apples", 5), item("Soap", 9)]),
    ]);

    expect(order.get("apples")).toBe(0.25); // first, then in the middle
    expect(order.get("milk")).toBe(0.25); // in the middle, then first
    expect(order.get("bread")).toBe(1);
    expect(order.get("soap")).toBe(1);
  });

  it("counts two spellings of an item as one", () => {
    const order = learnUsualOrder([
      list(1, [item("milk", 1), item("Apples", 5), item("Bread", 9)]),
      list(2, [item("Apples", 1), item("  MILK ", 5), item("Bread", 9)]),
    ]);

    expect(order.get("milk")).toBe(0.25);
    expect(order.has("  MILK ")).toBe(false);
  });

  it("learns nothing from a trip with fewer than three items crossed off one by one", () => {
    expect(learnUsualOrder([list(1, [item("Apples", 1), item("Milk", 5)])]).size).toBe(0);
    expect(learnUsualOrder([list(1, [item("Apples", 1)])]).size).toBe(0);
    expect(learnUsualOrder([list(1, [])]).size).toBe(0);
    expect(learnUsualOrder([]).size).toBe(0);
  });

  it("leaves out what was crossed off all at once", () => {
    // Three by hand, then "Mark as complete" crosses off the rest in one moment.
    const order = learnUsualOrder([
      list(1, [item("Apples", 1), item("Milk", 5), item("Bread", 9), item("Soap", 12), item("Rice", 12), item("Salt", 12)]),
    ]);

    expect(order.get("apples")).toBe(0);
    expect(order.get("bread")).toBe(1);
    expect(order.has("soap")).toBe(false);
    expect(order.has("rice")).toBe(false);
  });

  it("learns nothing when a whole list was crossed off at once", () => {
    const order = learnUsualOrder([list(1, [item("Apples", 4), item("Milk", 4), item("Bread", 4), item("Soap", 4)])]);

    expect(order.size).toBe(0);
  });

  it("reads a reused list as the trips it holds, three hours apart or more", () => {
    const nextDay = DAY + 24 * 60 * MINUTE;
    const order = learnUsualOrder([
      list(1, [
        item("Apples", 1),
        item("Milk", 5),
        item("Bread", 9),
        // The same list, shopped from again the next day.
        item("Soap", 1, nextDay),
        item("Rice", 5, nextDay),
        item("Salt", 9, nextDay),
      ]),
    ]);

    // Each trip has its own first and last: soap is first on its trip, not fourth of six.
    expect(order.get("apples")).toBe(0);
    expect(order.get("bread")).toBe(1);
    expect(order.get("soap")).toBe(0);
    expect(order.get("salt")).toBe(1);
  });

  it("keeps ticks within three hours in one trip", () => {
    const gap = TRIP_GAP_MS / MINUTE;
    const order = learnUsualOrder([list(1, [item("Apples", 0), item("Milk", gap), item("Bread", 2 * gap)])]);

    expect(order.get("milk")).toBe(0.5);
  });

  it("leaves out the trip under way, so crossing off does not reshuffle the rest", () => {
    const today = DAY + 7 * 24 * 60 * MINUTE;
    const lists = [
      list(1, [item("Apples", 1), item("Milk", 5), item("Bread", 9)]),
      // The open list: two items already crossed off on this trip, in an order that is not the usual one.
      list(2, [item("Bread", 1, today), item("Milk", 3, today), item("Soap", 6, today), item("Apples")]),
    ];

    const order = learnUsualOrder(lists, { listId: 2, since: today });

    expect(order.get("bread")).toBe(1);
    expect(order.get("milk")).toBe(0.5);
    expect(order.has("soap")).toBe(false);

    // Without it, today's ticks would count.
    expect(learnUsualOrder(lists).get("bread")).toBe(0.5);
  });

  it("still learns from the open list's earlier trips", () => {
    const today = DAY + 7 * 24 * 60 * MINUTE;
    const order = learnUsualOrder(
      [list(2, [item("Apples", 1), item("Milk", 5), item("Bread", 9), item("Soap", 1, today), item("Rice")])],
      { listId: 2, since: today }
    );

    expect(order.get("apples")).toBe(0);
    expect(order.get("bread")).toBe(1);
    expect(order.has("soap")).toBe(false);
  });

  it("ignores items that are not crossed off, have no time, a time that cannot be read, or no name", () => {
    const broken = { ...item("Eggs", 3), checkedAt: "not a date" } as ShoppingListItem;
    const unnamed = { ...item("   ", 4) } as ShoppingListItem;
    const withoutTime = { ...item("Flour", 5), checkedAt: undefined } as ShoppingListItem;
    const order = learnUsualOrder([
      list(1, [item("Apples", 1), item("Milk", 5), item("Bread", 9), item("Butter"), broken, unnamed, withoutTime]),
    ]);

    expect([...order.keys()].sort()).toEqual(["apples", "bread", "milk"]);
  });

  it("copes with a list that has no items", () => {
    expect(learnUsualOrder([{ id: 1, name: "Empty", groupId: 1 } as ShoppingList]).size).toBe(0);
  });
});

describe("sortByUsualOrder", () => {
  const order = new Map([
    ["apples", 0],
    ["milk", 0.5],
    ["bread", 1],
  ]);
  const names = (items: { name: string }[]) => items.map((entry) => entry.name);

  it("puts what has a place in its usual order", () => {
    expect(names(sortByUsualOrder([{ name: "Bread" }, { name: "Milk" }, { name: "Apples" }], order))).toEqual(["Apples", "Milk", "Bread"]);
  });

  it("puts what was never bought before after the rest, in the order it came in", () => {
    const sorted = sortByUsualOrder([{ name: "Candles" }, { name: "Bread" }, { name: "Batteries" }, { name: "Apples" }], order);

    expect(names(sorted)).toEqual(["Apples", "Bread", "Candles", "Batteries"]);
  });

  it("keeps the order it was given between two items in the same place", () => {
    const tied = new Map([
      ["milk", 0.5],
      ["cream", 0.5],
    ]);

    expect(names(sortByUsualOrder([{ name: "Milk" }, { name: "Cream" }], tied))).toEqual(["Milk", "Cream"]);
    expect(names(sortByUsualOrder([{ name: "Cream" }, { name: "Milk" }], tied))).toEqual(["Cream", "Milk"]);
  });

  it("changes nothing when nothing is known", () => {
    const items = [{ name: "Bread" }, { name: "Milk" }, { name: "Apples" }];

    expect(sortByUsualOrder(items, new Map())).toEqual(items);
    expect(sortByUsualOrder([], order)).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const items = [{ name: "Bread" }, { name: "Apples" }];
    sortByUsualOrder(items, order);

    expect(names(items)).toEqual(["Bread", "Apples"]);
  });
});

describe("anyInUsualOrder", () => {
  it("says whether sorting would change anything", () => {
    const order = new Map([["milk", 0.5]]);

    expect(anyInUsualOrder([{ name: "Candles" }, { name: " MILK" }], order)).toBe(true);
    expect(anyInUsualOrder([{ name: "Candles" }], order)).toBe(false);
    expect(anyInUsualOrder([], order)).toBe(false);
  });
});
