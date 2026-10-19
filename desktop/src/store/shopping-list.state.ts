import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { take, tap } from "rxjs";
import {
  Group,
  Permission,
  ShoppingList,
  ShoppingListEvent,
  ShoppingListItem,
  ShoppingListService,
} from "../open-api";
import { hasAll } from "../utils/permission.utils";
import { AuthState } from "./auth.state";
import { GroupState } from "./group.state";
import {
  ApplyShoppingListEvent,
  LoadShoppingLists,
  SelectShoppingList,
} from "./shopping-list.state.actions";

/**
 * The event types the API sends. `ShoppingListEvent.type` is a plain string on the contract (never
 * an enum, so a new type can't break an older client) — unknown types are ignored.
 */
export const ShoppingListEventType = {
  ListCreated: "LIST_CREATED",
  ListUpdated: "LIST_UPDATED",
  ListDeleted: "LIST_DELETED",
  ItemAdded: "ITEM_ADDED",
  ItemUpdated: "ITEM_UPDATED",
  ItemToggled: "ITEM_TOGGLED",
  ItemDeleted: "ITEM_DELETED",
  CheckedCleared: "CHECKED_CLEARED",
} as const;

export interface ShoppingListStateInterface {
  groupId?: number;
  lists: ShoppingList[];
  selectedListId?: number;
}

/** Deliberately not persisted: the server is the source of truth, refetched on every visit. */
@State<ShoppingListStateInterface>({
  name: "shoppingLists",
  defaults: {
    lists: [],
  },
})
@Injectable()
export class ShoppingListState {
  constructor(private shoppingListService: ShoppingListService) {}

  /**
   * The real groups whose shopping lists the user may read. The synthetic "All" group is never one:
   * the API rejects it as a shopping list group.
   */
  @Selector([GroupState.groupsWithoutAll, AuthState.groupPermissions])
  static readableGroups(groups: Group[], groupPermissions: { [groupId: number]: string[] }): Group[] {
    return groups.filter((group) =>
      hasAll(groupPermissions[group.id] ?? [], Permission.GroupShoppingListsRead)
    );
  }

  /**
   * Where the shopping list button lands: the selected group when it is a readable real group,
   * otherwise the first readable one. Undefined when the user can read no group's lists.
   */
  @Selector([ShoppingListState.readableGroups, GroupState.selectedGroupId])
  static targetGroupId(readableGroups: Group[], selectedGroupId: string): number | undefined {
    const selected = readableGroups.find((group) => group.id.toString() === selectedGroupId);
    return (selected ?? readableGroups[0])?.id;
  }

  @Selector()
  static lists(state: ShoppingListStateInterface): ShoppingList[] {
    return state.lists;
  }

  @Selector()
  static groupId(state: ShoppingListStateInterface): number | undefined {
    return state.groupId;
  }

  @Selector()
  static selectedList(state: ShoppingListStateInterface): ShoppingList | undefined {
    return state.lists.find((list) => list.id === state.selectedListId);
  }

  /** Items still to buy, in the order they were added. */
  @Selector([ShoppingListState.selectedList])
  static activeItems(list: ShoppingList | undefined): ShoppingListItem[] {
    return (list?.items ?? [])
      .filter((item) => !item.isChecked)
      .sort(compareByCreation);
  }

  /** Crossed-off items, most recently crossed off first. */
  @Selector([ShoppingListState.selectedList])
  static checkedItems(list: ShoppingList | undefined): ShoppingListItem[] {
    return (list?.items ?? [])
      .filter((item) => item.isChecked)
      .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "") || b.id - a.id);
  }

  @Action(LoadShoppingLists)
  loadShoppingLists(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { groupId }: LoadShoppingLists
  ) {
    return this.shoppingListService.getShoppingListsForGroup(groupId).pipe(
      take(1),
      tap((lists) => {
        const { selectedListId } = getState();
        const sorted = sortLists(lists);
        patchState({
          groupId,
          lists: sorted,
          selectedListId: resolveSelection(sorted, selectedListId),
        });
      })
    );
  }

  @Action(SelectShoppingList)
  selectShoppingList(
    { patchState }: StateContext<ShoppingListStateInterface>,
    { listId }: SelectShoppingList
  ) {
    patchState({ selectedListId: listId });
  }

  @Action(ApplyShoppingListEvent)
  applyShoppingListEvent(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { event }: ApplyShoppingListEvent
  ) {
    const state = getState();
    if (event.groupId !== state.groupId) {
      return;
    }

    const lists = applyEvent(state.lists, event);
    if (lists === state.lists) {
      return;
    }

    patchState({
      lists,
      selectedListId: resolveSelection(lists, state.selectedListId),
    });
  }
}

function compareByCreation(a: ShoppingListItem, b: ShoppingListItem): number {
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id - b.id;
}

function sortLists(lists: ShoppingList[]): ShoppingList[] {
  return [...lists].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

/** Keeps the current selection while it still exists, otherwise falls back to the first list. */
function resolveSelection(lists: ShoppingList[], selectedListId?: number): number | undefined {
  if (lists.some((list) => list.id === selectedListId)) {
    return selectedListId;
  }
  return lists[0]?.id;
}

function upsertById<T extends { id: number }>(entities: T[], entity: T): T[] {
  const index = entities.findIndex((existing) => existing.id === entity.id);
  if (index === -1) {
    return [...entities, entity];
  }
  const copy = [...entities];
  copy[index] = entity;
  return copy;
}

function updateItems(
  lists: ShoppingList[],
  listId: number,
  update: (items: ShoppingListItem[]) => ShoppingListItem[]
): ShoppingList[] {
  const list = lists.find((candidate) => candidate.id === listId);
  if (!list) {
    // An item event for a list this tab doesn't have yet; the next refetch reconciles it.
    return lists;
  }
  return upsertById(lists, { ...list, items: update(list.items ?? []) });
}

/** Returns the same array when the event changes nothing, so callers can skip the patch. */
export function applyEvent(lists: ShoppingList[], event: ShoppingListEvent): ShoppingList[] {
  switch (event.type) {
    case ShoppingListEventType.ListCreated:
    case ShoppingListEventType.ListUpdated:
      return event.list ? sortLists(upsertById(lists, { ...event.list, items: event.list.items ?? [] })) : lists;

    case ShoppingListEventType.ListDeleted:
      return lists.filter((list) => list.id !== event.shoppingListId);

    case ShoppingListEventType.ItemAdded:
    case ShoppingListEventType.ItemUpdated:
    case ShoppingListEventType.ItemToggled: {
      const item = event.item;
      return item ? updateItems(lists, event.shoppingListId, (items) => upsertById(items, item)) : lists;
    }

    case ShoppingListEventType.ItemDeleted: {
      const itemId = event.item?.id;
      return itemId === undefined
        ? lists
        : updateItems(lists, event.shoppingListId, (items) => items.filter((item) => item.id !== itemId));
    }

    case ShoppingListEventType.CheckedCleared: {
      const removed = new Set(event.itemIds ?? []);
      return updateItems(lists, event.shoppingListId, (items) => items.filter((item) => !removed.has(item.id)));
    }

    default:
      return lists;
  }
}
