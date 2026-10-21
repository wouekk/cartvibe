import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ShoppingListItem, UpsertShoppingListItemCommand } from "../open-api";

// Match the API's column limits, so an over-long value is caught here rather than as a 400.
export const SHOPPING_LIST_ITEM_NAME_MAX_LENGTH = 200;
export const SHOPPING_LIST_ITEM_NOTE_MAX_LENGTH = 500;

/**
 * The units an amount may be in — keep in step with the API's `models.ShoppingListUnits`. The unit
 * is a plain string on the contract, so a unit the API adds later still displays, as its raw value.
 */
export const SHOPPING_LIST_UNITS: { value: string; displayValue: string }[] = [
  { value: "pcs", displayValue: "pcs" },
  { value: "kg", displayValue: "kg" },
  { value: "g", displayValue: "g" },
  { value: "l", displayValue: "L" },
  { value: "ml", displayValue: "ml" },
  { value: "pack", displayValue: "pack" },
  { value: "bottle", displayValue: "bottle" },
  { value: "can", displayValue: "can" },
  { value: "box", displayValue: "box" },
  { value: "bag", displayValue: "bag" },
  { value: "jar", displayValue: "jar" },
  { value: "bunch", displayValue: "bunch" },
  { value: "dozen", displayValue: "dozen" },
];

export const DEFAULT_SHOPPING_LIST_UNIT = "pcs";

/**
 * A positive amount below 100000 with at most 3 decimals — the API's rule. A comma is accepted as the
 * decimal separator, since that is what a European phone keyboard types.
 */
const AMOUNT_PATTERN = /^(?!0+(?:[.,]0+)?$)\d{1,5}(?:[.,]\d{1,3})?$/;

/**
 * The name/amount/unit/note form shared by the quick-add bar and the edit dialog. `name` is left
 * optional here: the quick-add bar must not show a "required" error on an untouched empty field, so
 * each caller adds that rule (or checks the trimmed value) itself.
 */
export function buildShoppingListItemForm(formBuilder: FormBuilder, item?: ShoppingListItem): FormGroup {
  return formBuilder.group({
    name: [item?.name ?? "", Validators.maxLength(SHOPPING_LIST_ITEM_NAME_MAX_LENGTH)],
    amount: [item?.amount ?? "", Validators.pattern(AMOUNT_PATTERN)],
    unit: [item?.amount ? item.unit : DEFAULT_SHOPPING_LIST_UNIT],
    note: [item?.note ?? "", Validators.maxLength(SHOPPING_LIST_ITEM_NOTE_MAX_LENGTH)],
  });
}

/**
 * Builds the command from the form. Without an amount, the item's old free-text quantity (if it has
 * one) is sent back unchanged, so editing an item from before amounts existed doesn't erase it;
 * entering an amount supersedes it.
 */
export function toUpsertShoppingListItemCommand(
  form: FormGroup,
  legacyQuantity = ""
): UpsertShoppingListItemCommand {
  const amount = String(form.value.amount ?? "").trim().replace(",", ".");

  return {
    name: (form.value.name ?? "").trim(),
    ...(amount ? { amount, unit: form.value.unit ?? "" } : { unit: "" }),
    quantity: amount ? "" : legacyQuantity,
    note: (form.value.note ?? "").trim(),
  };
}

/** "1.5 kg", "6 pcs", "1 L"; an item from before amounts existed shows its free text. */
export function formatShoppingListItemAmount(item: ShoppingListItem, translate: (text: string) => string = (text) => text): string {
  if (item.amount) {
    const unit = translate(SHOPPING_LIST_UNITS.find((candidate) => candidate.value === item.unit)?.displayValue ?? item.unit ?? "");
    return unit ? `${item.amount} ${unit}` : item.amount;
  }
  return item.quantity ?? "";
}
