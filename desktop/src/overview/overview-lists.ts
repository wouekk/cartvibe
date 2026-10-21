import { ShoppingList } from "../open-api";

export interface ListSummary {
  id: number;
  name: string;
  count: number;
  preview: string;
}

/**
 * What the Dashboard's shopping card shows: only lists with something left to buy (a finished or still empty list is
 * on the Shopping lists page), each with how many items are open and the first few by name.
 */
export function summarizeShoppingLists(lists: ShoppingList[], previewItems: number): ListSummary[] {
  return lists
    .map((list) => ({ list, toBuy: list.items.filter((item) => !item.isChecked) }))
    .filter(({ toBuy }) => toBuy.length > 0)
    .map(({ list, toBuy }) => {
      const names = toBuy.slice(0, previewItems).map((item) => item.name);
      const more = toBuy.length - names.length;
      return {
        id: list.id,
        name: list.name,
        count: toBuy.length,
        preview: names.join(", ") + (more > 0 ? `, and ${more} more` : ""),
      };
    });
}
