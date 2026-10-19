import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ShoppingListItem, UpsertShoppingListItemCommand } from "../open-api";

// Match the API's column limits, so an over-long value is caught here rather than as a 400.
export const SHOPPING_LIST_ITEM_NAME_MAX_LENGTH = 200;
export const SHOPPING_LIST_ITEM_QUANTITY_MAX_LENGTH = 50;
export const SHOPPING_LIST_ITEM_NOTE_MAX_LENGTH = 500;

/**
 * The name/quantity/note form shared by the quick-add bar and the edit dialog. `name` is left
 * optional here: the quick-add bar must not show a "required" error on an untouched empty field,
 * so each caller adds that rule (or checks the trimmed value) itself.
 */
export function buildShoppingListItemForm(formBuilder: FormBuilder, item?: ShoppingListItem): FormGroup {
  return formBuilder.group({
    name: [item?.name ?? "", Validators.maxLength(SHOPPING_LIST_ITEM_NAME_MAX_LENGTH)],
    quantity: [item?.quantity ?? "", Validators.maxLength(SHOPPING_LIST_ITEM_QUANTITY_MAX_LENGTH)],
    note: [item?.note ?? "", Validators.maxLength(SHOPPING_LIST_ITEM_NOTE_MAX_LENGTH)],
  });
}

export function toUpsertShoppingListItemCommand(form: FormGroup): UpsertShoppingListItemCommand {
  return {
    name: (form.value.name ?? "").trim(),
    quantity: (form.value.quantity ?? "").trim(),
    note: (form.value.note ?? "").trim(),
  };
}
