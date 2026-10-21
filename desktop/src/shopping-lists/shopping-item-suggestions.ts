import { ShoppingList } from "../open-api";

/** An item name the household bought before, with the amount and unit it last had. */
export interface ItemSuggestion {
  name: string;
  amount?: string;
  unit?: string;
}

const MAX_SUGGESTIONS = 8;

const key = (name: string): string => name.trim().toLocaleLowerCase();

/**
 * Every distinct item name across the group's lists (open, crossed off and past lists alike), newest first, each with
 * the amount and unit of its latest use. Names already open on the current list are left out: adding them again would
 * do nothing useful.
 */
export function buildItemSuggestions(lists: ShoppingList[], currentListId?: number): ItemSuggestion[] {
  const openHere = new Set(
    lists
      .filter((list) => list.id === currentListId)
      .flatMap((list) => list.items.filter((item) => !item.isChecked).map((item) => key(item.name)))
  );

  const latest = new Map<string, { stamp: string; suggestion: ItemSuggestion }>();
  for (const list of lists) {
    for (const item of list.items) {
      const name = item.name.trim();
      const id = key(name);
      if (!id || openHere.has(id)) {
        continue;
      }

      const stamp = item.checkedAt ?? item.updatedAt ?? item.createdAt ?? "";
      const known = latest.get(id);
      if (!known || stamp > known.stamp) {
        latest.set(id, { stamp, suggestion: { name, amount: item.amount || undefined, unit: item.amount ? item.unit : undefined } });
      }
    }
  }

  return [...latest.values()].sort((a, b) => b.stamp.localeCompare(a.stamp)).map((entry) => entry.suggestion);
}

/** What the box offers for what was typed: names starting with it first, then names containing it, at most a handful. */
export function filterItemSuggestions(suggestions: ItemSuggestion[], query: string, limit = MAX_SUGGESTIONS): ItemSuggestion[] {
  const needle = key(query);
  if (!needle) {
    return [];
  }

  const starts: ItemSuggestion[] = [];
  const contains: ItemSuggestion[] = [];
  for (const suggestion of suggestions) {
    const name = key(suggestion.name);
    if (name === needle) {
      continue; // exactly what is typed; nothing to complete
    }
    if (name.startsWith(needle)) {
      starts.push(suggestion);
    } else if (name.includes(needle)) {
      contains.push(suggestion);
    }
  }

  return [...starts, ...contains].slice(0, limit);
}
