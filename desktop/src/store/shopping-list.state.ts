import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { catchError, EMPTY, take, tap } from "rxjs";
import {
  Group,
  Permission,
  ShoppingList,
  ShoppingListEvent,
  ShoppingListItem,
  ShoppingListService,
} from "../open-api";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { isPastList } from "../shopping-lists/shopping-list-groups";
import {
  enqueue,
  overlayPending,
  PendingChange,
  pendingItemIds,
  settle,
} from "../shopping-lists/shopping-list-pending";
import { hasAll } from "../utils/permission.utils";
import { AuthState } from "./auth.state";
import { Logout } from "./auth.state.actions";
import { GroupState } from "./group.state";
import {
  ApplyShoppingListEvent,
  DiscardLocalShoppingListItem,
  LoadShoppingLists,
  QueueShoppingListChange,
  RestorePendingShoppingListChanges,
  SelectShoppingList,
  SettleShoppingListChange,
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
  // Carries no entity and changes no list: ShoppingTripsComponent refetches its trips on it.
  TripsChanged: "TRIPS_CHANGED",
} as const;

export interface ShoppingListStateInterface {
  groupId?: number;
  lists: ShoppingList[];
  selectedListId?: number;
  /** Changes made on this device that the server has not confirmed yet, oldest first (any group). */
  pending: PendingChange[];
  /** The group whose lists could not be read and of which the device has no copy either. */
  loadFailedGroupId?: number;
}

/** What the device keeps of one group's lists (`OfflineStorageService`), so the page opens without a connection. */
export interface CachedShoppingLists {
  lists: ShoppingList[];
  selectedListId?: number;
}

export function shoppingListsCacheKey(groupId: number): string {
  return `shopping-lists:${groupId}`;
}

/**
 * The server wins on conflict, and the device keeps a copy: a visit shows the copy at once and the server's answer
 * replaces it when it arrives. The copy and the queue are written by `ShoppingListSyncService` (IndexedDB), not by
 * the NGXS storage plugin: the slice stays out of `ngxsStorageKeys`.
 */
@State<ShoppingListStateInterface>({
  name: "shoppingLists",
  defaults: {
    lists: [],
    pending: [],
  },
})
@Injectable()
export class ShoppingListState {
  /** The group asked for last, so a device copy that arrives late for an earlier group is not shown. */
  private requestedGroupId?: number;

  constructor(
    private shoppingListService: ShoppingListService,
    private offlineStorage: OfflineStorageService
  ) {}

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

  @Selector()
  static pending(state: ShoppingListStateInterface): PendingChange[] {
    return state.pending;
  }

  /** How many changes of the open group are still waiting to be sent. */
  @Selector()
  static pendingCount(state: ShoppingListStateInterface): number {
    return state.pending.filter((change) => change.groupId === state.groupId).length;
  }

  /** The rows with a change still waiting, for their "not sent yet" mark. */
  @Selector()
  static pendingItemIds(state: ShoppingListStateInterface): Set<number> {
    return pendingItemIds(state.pending, state.groupId);
  }

  /** True when a group's lists could be read neither from the server nor from the device. */
  @Selector()
  static loadFailedGroupId(state: ShoppingListStateInterface): number | undefined {
    return state.loadFailedGroupId;
  }

  /** What the device keeps of the open group. */
  @Selector()
  static cacheSnapshot(state: ShoppingListStateInterface): { groupId?: number } & CachedShoppingLists {
    return { groupId: state.groupId, lists: state.lists, selectedListId: state.selectedListId };
  }

  /**
   * Shows the device's copy of the group at once (when another group, or nothing, is on screen), then asks the
   * server; its answer replaces the copy. Without a connection the copy stays, with the waiting changes laid over
   * it either way.
   */
  @Action(LoadShoppingLists)
  loadShoppingLists(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { groupId }: LoadShoppingLists
  ) {
    this.requestedGroupId = groupId;

    if (getState().groupId !== groupId) {
      void this.offlineStorage.get<CachedShoppingLists>(shoppingListsCacheKey(groupId)).then((cached) => {
        const state = getState();
        // The server may have answered first, or the page moved on to another group.
        if (!cached || !Array.isArray(cached.lists) || this.requestedGroupId !== groupId || state.groupId === groupId) {
          return;
        }

        const lists = overlayPending(sortLists(cached.lists), state.pending, groupId);
        patchState({
          groupId,
          lists,
          selectedListId: resolveSelection(lists, cached.selectedListId),
          loadFailedGroupId: undefined,
        });
      });
    }

    return this.shoppingListService.getShoppingListsForGroup(groupId).pipe(
      take(1),
      tap((answer) => {
        if (this.requestedGroupId !== groupId) {
          return;
        }

        const state = getState();
        const lists = overlayPending(sortLists(answer), state.pending, groupId);
        patchState({
          groupId,
          lists,
          selectedListId: resolveSelection(lists, state.groupId === groupId ? state.selectedListId : undefined),
          loadFailedGroupId: undefined,
        });
      }),
      catchError(() => {
        // No connection (or a server that is restarting): what is on screen stays. Only a group with nothing to
        // show says so; the stream service asks again when the connection is back.
        if (this.requestedGroupId === groupId && getState().groupId !== groupId) {
          patchState({ loadFailedGroupId: groupId });
        }
        return EMPTY;
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

    // What someone removed stays removed: a change still waiting for it is dropped, not sent.
    const pending = dropPendingForRemoved(state.pending, event);
    const lists = overlayPending(applyEvent(state.lists, event), pending, state.groupId);
    if (lists === state.lists && pending === state.pending) {
      return;
    }

    patchState({
      lists,
      pending,
      selectedListId: resolveSelection(lists, state.selectedListId),
    });
  }

  @Action(QueueShoppingListChange)
  queueShoppingListChange(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { change }: QueueShoppingListChange
  ) {
    const state = getState();
    const pending = enqueue(state.pending, change);
    patchState({ pending, lists: overlayPending(state.lists, pending, state.groupId) });
  }

  @Action(SettleShoppingListChange)
  settleShoppingListChange(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { opId, saved }: SettleShoppingListChange
  ) {
    const state = getState();
    const change = state.pending.find((candidate) => candidate.opId === opId);
    const pending = settle(state.pending, opId, saved);
    // A change of another group than the one on screen only leaves the queue.
    if (change && change.groupId !== state.groupId) {
      patchState({ pending });
      return;
    }

    let lists = state.lists;
    if (change?.kind === "add") {
      // The row shown meanwhile makes way for the server's item (or for nothing, when the add was refused).
      lists = updateItems(lists, change.listId, (items) => items.filter((item) => item.id !== change.item.id));
    }
    if (saved) {
      lists = updateItems(lists, saved.shoppingListId, (items) => upsertItem(items, saved));
    }

    patchState({ pending, lists: overlayPending(lists, pending, state.groupId) });
  }

  @Action(DiscardLocalShoppingListItem)
  discardLocalShoppingListItem(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { clientId }: DiscardLocalShoppingListItem
  ) {
    const state = getState();
    const pending = state.pending.filter((change) => change.clientId !== clientId);
    const lists = state.lists.map((list) =>
      list.items?.some((item) => item.clientId === clientId && item.id < 0)
        ? { ...list, items: list.items.filter((item) => !(item.clientId === clientId && item.id < 0)) }
        : list
    );
    patchState({ pending, lists });
  }

  @Action(RestorePendingShoppingListChanges)
  restorePendingShoppingListChanges(
    { getState, patchState }: StateContext<ShoppingListStateInterface>,
    { pending }: RestorePendingShoppingListChanges
  ) {
    const state = getState();
    // Anything queued since the page opened goes after what the device kept.
    const merged = [...pending.filter((kept) => !state.pending.some((change) => change.opId === kept.opId)), ...state.pending];
    patchState({ pending: merged, lists: overlayPending(state.lists, merged, state.groupId) });
  }

  /** The account that signs out takes its lists and its waiting changes with it. */
  @Action(Logout)
  logout({ setState }: StateContext<ShoppingListStateInterface>) {
    this.requestedGroupId = undefined;
    setState({ lists: [], pending: [] });
  }
}

/** Drops the waiting changes whose item or list an event just removed. */
function dropPendingForRemoved(pending: PendingChange[], event: ShoppingListEvent): PendingChange[] {
  let removedItemIds: number[] = [];
  switch (event.type) {
    case ShoppingListEventType.ListDeleted: {
      const kept = pending.filter((change) => change.listId !== event.shoppingListId);
      return kept.length === pending.length ? pending : kept;
    }
    case ShoppingListEventType.ItemDeleted:
      removedItemIds = event.item ? [event.item.id] : [];
      break;
    case ShoppingListEventType.CheckedCleared:
      removedItemIds = event.itemIds ?? [];
      break;
    default:
      return pending;
  }

  const kept = pending.filter((change) => change.kind !== "toggle" || !removedItemIds.includes(change.itemId));
  return kept.length === pending.length ? pending : kept;
}

function compareByCreation(a: ShoppingListItem, b: ShoppingListItem): number {
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id - b.id;
}

/** Newest first: the list started last is the one being shopped for. */
function sortLists(lists: ShoppingList[]): ShoppingList[] {
  return [...lists].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id - a.id);
}

/**
 * Keeps the current selection while it still exists (a finished list can be viewed), otherwise falls
 * back to the newest list still being shopped, then the newest list.
 */
function resolveSelection(lists: ShoppingList[], selectedListId?: number): number | undefined {
  if (lists.some((list) => list.id === selectedListId)) {
    return selectedListId;
  }
  return (lists.find((list) => !isPastList(list)) ?? lists[0])?.id;
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

/**
 * Puts an item into its list by id, or in place of the row this device showed for it while its add was on the way
 * (the same `clientId`, a negative id): the live event can arrive before the answer to the add itself.
 */
function upsertItem(items: ShoppingListItem[], item: ShoppingListItem): ShoppingListItem[] {
  const index = items.findIndex(
    (existing) => existing.id === item.id || (!!item.clientId && existing.id < 0 && existing.clientId === item.clientId)
  );
  if (index === -1) {
    return [...items, item];
  }
  const copy = [...items];
  copy[index] = item;
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
      return item ? updateItems(lists, event.shoppingListId, (items) => upsertItem(items, item)) : lists;
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
