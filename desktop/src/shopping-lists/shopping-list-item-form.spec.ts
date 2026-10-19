import { FormBuilder } from "@angular/forms";
import { ShoppingListItem } from "../open-api";
import {
  buildShoppingListItemForm,
  formatShoppingListItemAmount,
  toUpsertShoppingListItemCommand,
} from "./shopping-list-item-form";

const item = (overrides: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 1,
  shoppingListId: 1,
  name: "Milk",
  unit: "",
  quantity: "",
  note: "",
  isChecked: false,
  ...overrides,
});

describe("shopping list item form", () => {
  const formBuilder = new FormBuilder();

  describe("amount validation", () => {
    it.each(["1", "1.5", "1,5", "0.125", "99999.999", "0.5"])("accepts %s", (amount) => {
      const form = buildShoppingListItemForm(formBuilder);
      form.patchValue({ amount });
      expect(form.get("amount")?.valid).toBe(true);
    });

    it.each(["0", "0.0", "0,000", "-1", "100000", "1.2345", "abc", "1.", ".5"])("rejects %s", (amount) => {
      const form = buildShoppingListItemForm(formBuilder);
      form.patchValue({ amount });
      expect(form.get("amount")?.valid).toBe(false);
    });

    it("allows no amount at all", () => {
      expect(buildShoppingListItemForm(formBuilder).get("amount")?.valid).toBe(true);
    });
  });

  describe("toUpsertShoppingListItemCommand", () => {
    it("sends the amount with a dot and its unit, superseding the old free-text quantity", () => {
      const form = buildShoppingListItemForm(formBuilder);
      form.patchValue({ name: " Flour ", amount: "1,5", unit: "kg", note: " fine " });

      expect(toUpsertShoppingListItemCommand(form, "a bag")).toEqual({
        name: "Flour",
        amount: "1.5",
        unit: "kg",
        quantity: "",
        note: "fine",
      });
    });

    it("sends no amount or unit when none is entered, keeping an old free-text quantity", () => {
      const form = buildShoppingListItemForm(formBuilder);
      form.patchValue({ name: "Milk", amount: "", unit: "kg" });

      expect(toUpsertShoppingListItemCommand(form, "a carton")).toEqual({
        name: "Milk",
        unit: "",
        quantity: "a carton",
        note: "",
      });
    });
  });

  it("starts an edit from the item's amount and unit, and a new item at pcs", () => {
    expect(buildShoppingListItemForm(formBuilder, item({ amount: "2", unit: "l" })).value).toEqual(
      expect.objectContaining({ amount: "2", unit: "l" })
    );
    expect(buildShoppingListItemForm(formBuilder).value.unit).toBe("pcs");
  });

  describe("formatShoppingListItemAmount", () => {
    it("shows the amount with its unit's label", () => {
      expect(formatShoppingListItemAmount(item({ amount: "1.5", unit: "kg" }))).toBe("1.5 kg");
      expect(formatShoppingListItemAmount(item({ amount: "1", unit: "l" }))).toBe("1 L");
    });

    it("shows a bare count, and an unknown unit as it arrived", () => {
      expect(formatShoppingListItemAmount(item({ amount: "6", unit: "" }))).toBe("6");
      expect(formatShoppingListItemAmount(item({ amount: "2", unit: "crate" }))).toBe("2 crate");
    });

    it("falls back to the old free-text quantity, or nothing", () => {
      expect(formatShoppingListItemAmount(item({ quantity: "a few" }))).toBe("a few");
      expect(formatShoppingListItemAmount(item({}))).toBe("");
    });
  });
});
