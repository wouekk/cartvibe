import { ShoppingList, ShoppingListItem } from "../open-api";

export interface ListSummary {
  id: number;
  name: string;
  count: number;
  preview: string;
}

/** Items still to buy on a list, in the order they were added (the Shopping lists page's order). */
export function activeItemsOf(list: ShoppingList | undefined): ShoppingListItem[] {
  return (list?.items ?? [])
    .filter((item) => !item.isChecked)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id - b.id);
}

/**
 * The list the Dashboard previews: the one with the most items still to buy. A tie goes to the list that comes first
 * in the given order, so the choice is stable; undefined when no list has anything left to buy.
 */
export function pickLargestList(lists: ShoppingList[]): ShoppingList | undefined {
  let best: ShoppingList | undefined;
  let bestCount = 0;
  for (const list of lists) {
    const count = activeItemsOf(list).length;
    if (count > bestCount) {
      best = list;
      bestCount = count;
    }
  }

  return best;
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
