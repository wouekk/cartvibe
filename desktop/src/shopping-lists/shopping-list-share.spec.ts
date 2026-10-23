import { ShoppingList, ShoppingListItem } from "../open-api";
import { shoppingListToText } from "./shopping-list-share";

function item(overrides: Partial<ShoppingListItem>): ShoppingListItem {
  return { id: 1, name: "Milk", isChecked: false, ...overrides } as ShoppingListItem;
}

function list(items: ShoppingListItem[]): ShoppingList {
  return { id: 1, name: "Saturday shop", items } as ShoppingList;
}

describe("shoppingListToText", () => {
  it("lists the title and each item still to buy, with its amount", () => {
    const text = shoppingListToText(
      list([item({ name: "Milk", amount: "2", unit: "L" }), item({ id: 2, name: "Bread" })])
    );

    expect(text).toBe("Saturday shop\n- Milk (2 L)\n- Bread");
  });

  it("leaves crossed-off items out", () => {
    const text = shoppingListToText(list([item({ name: "Milk" }), item({ id: 2, name: "Eggs", isChecked: true })]));

    expect(text).toBe("Saturday shop\n- Milk");
  });

  it("is just the title for a list with nothing left to buy", () => {
    expect(shoppingListToText(list([item({ isChecked: true })]))).toBe("Saturday shop");
  });

  it("translates unit names", () => {
    const text = shoppingListToText(list([item({ name: "Water", amount: "6", unit: "bottle" })]), (word) =>
      word === "bottle" ? "butelki" : word
    );

    expect(text).toContain("(6 butelki)");
  });
});
