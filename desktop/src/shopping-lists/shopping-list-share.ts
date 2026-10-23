import { ShoppingList } from "../open-api";
import { formatShoppingListItemAmount } from "./shopping-list-item-form";

/**
 * A list as plain text for a messaging app: the title, then one "- item (amount)" line for each item still to buy.
 * Crossed-off items are left out, since the person receiving it wants to know what to buy.
 */
export function shoppingListToText(list: ShoppingList, translate: (text: string) => string = (text) => text): string {
  const lines = list.items
    .filter((item) => !item.isChecked)
    .map((item) => {
      const amount = formatShoppingListItemAmount(item, translate);
      return amount ? `- ${item.name} (${amount})` : `- ${item.name}`;
    });

  return [list.name, ...lines].join("\n");
}
