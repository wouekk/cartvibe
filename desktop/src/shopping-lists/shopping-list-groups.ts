import { ShoppingList } from "../open-api";

/** How many finished lists the page keeps in view (Phase 3 S2). */
export const PAST_LISTS_SHOWN = 3;

/** A list is finished ("past") once it has items and every one is crossed off; an empty new list is active. */
export function isPastList(list: ShoppingList): boolean {
  return list.items.length > 0 && list.items.every((item) => item.isChecked);
}

/** The lists still being shopped, in the order they came. */
export function activeLists(lists: ShoppingList[]): ShoppingList[] {
  return lists.filter((list) => !isPastList(list));
}

/** When a finished list was finished: its last cross-off, else when the list itself last changed. */
function finishedAt(list: ShoppingList): string {
  return list.items.reduce((latest, item) => ((item.checkedAt ?? "") > latest ? (item.checkedAt ?? "") : latest), "") || (list.updatedAt ?? "");
}

/** The most recently finished lists, newest first. */
export function recentPastLists(lists: ShoppingList[], limit = PAST_LISTS_SHOWN): ShoppingList[] {
  return lists
    .filter(isPastList)
    .sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)))
    .slice(0, limit);
}
