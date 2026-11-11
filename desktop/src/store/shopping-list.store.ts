import { computed, inject, Injectable } from "@angular/core";
import { Observable, ReplaySubject, Subject, take } from "rxjs";
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
import { AuthStore } from "./auth.store";
import { GroupStore } from "./group.store";
import { StateStore } from "./state-store";

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
 * The open household's shopping lists and the changes made on this device that the server does not have yet.
 *
 * The server wins on conflict, and the device keeps a copy: a visit shows the copy at once and the server's answer
 * replaces it when it arrives. The copy and the queue are written by `ShoppingListSyncService` (IndexedDB), so this
 * store has no storage key of its own.
 */
@Injectable({ providedIn: "root" })
export class ShoppingListStore extends StateStore<ShoppingListStateInterface> {
  private readonly shoppingListService = inject(ShoppingListService);

  private readonly offlineStorage = inject(OfflineStorageService);

  private readonly groupStore = inject(GroupStore);

  private readonly authStore = inject(AuthStore);

  /** The group asked for last, so a device copy that arrives late for an earlier group is not shown. */
  private requestedGroupId?: number;

  /** The slice after each change, at once: a signal's own effect would wait for the next tick. */
  public readonly changes = new Subject<ShoppingListStateInterface>();

  /** Every event handed to `applyEvent`, whichever household it is for (the trips panel listens for its own). */
  public readonly events = new Subject<ShoppingListEvent>();

  /** The household whose lists were just asked for again. */
  public readonly loads = new Subject<number>();

  /**
   * The real groups whose shopping lists the user may read. The synthetic "All" group is never one:
   * the API rejects it as a shopping list group.
   */
  public readonly readableGroups = computed((): Group[] => {
    const groupPermissions = this.authStore.groupPermissions();
    return this.groupStore.groupsWithoutAll().filter((group) => hasAll(groupPermissions[group.id] ?? [], Permission.GroupShoppingListsRead));
  });

  /**
   * Where the shopping list button lands: the selected group when it is a readable real group,
   * otherwise the first readable one. Undefined when the user can read no group's lists.
   */
  public readonly targetGroupId = computed((): number | undefined => {
    const readableGroups = this.readableGroups();
    const selected = readableGroups.find((group) => group.id.toString() === this.groupStore.selectedGroupId());
    return (selected ?? readableGroups[0])?.id;
  });

  public readonly lists = computed(() => this.state().lists);

  public readonly groupId = computed(() => this.state().groupId);

  public readonly selectedList = computed((): ShoppingList | undefined => {
    const state = this.state();
    return state.lists.find((list) => list.id === state.selectedListId);
  });

  /** Items still to buy, in the order they were added. */
  public readonly activeItems = computed((): ShoppingListItem[] =>
    (this.selectedList()?.items ?? []).filter((item) => !item.isChecked).sort(compareByCreation)
  );

  /** Crossed-off items, most recently crossed off first. */
  public readonly checkedItems = computed((): ShoppingListItem[] =>
    (this.selectedList()?.items ?? [])
      .filter((item) => item.isChecked)
      .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "") || b.id - a.id)
  );

  public readonly pending = computed(() => this.state().pending);

  /** How many changes of the open group are still waiting to be sent. */
  public readonly pendingCount = computed(() => {
    const state = this.state();
    return state.pending.filter((change) => change.groupId === state.groupId).length;
  });

  /** The rows with a change still waiting, for their "not sent yet" mark. */
  public readonly pendingItemIds = computed((): Set<number> => {
    const state = this.state();
    return pendingItemIds(state.pending, state.groupId);
  });

  /** The group whose lists could be read neither from the server nor from the device. */
  public readonly loadFailedGroupId = computed(() => this.state().loadFailedGroupId);

  /** What the device keeps of the open group. */
  public readonly cacheSnapshot = computed((): { groupId?: number } & CachedShoppingLists => {
    const state = this.state();
    return { groupId: state.groupId, lists: state.lists, selectedListId: state.selectedListId };
  });

  constructor() {
    super(() => ({ lists: [], pending: [] }));

    // The account that signs out takes its lists and its waiting changes with it.
    this.authStore.signedOut.subscribe(() => this.clear());
  }

  /**
   * Shows the device's copy of the group at once (when another group, or nothing, is on screen), then asks the
   * server; its answer replaces the copy. Without a connection the copy stays, with the waiting changes laid over
   * it either way. The answer completes once the server has answered or could not be reached.
   */
  public load(groupId: number): Observable<void> {
    this.requestedGroupId = groupId;
    this.loads.next(groupId);

    if (this.state().groupId !== groupId) {
      void this.offlineStorage.get<CachedShoppingLists>(shoppingListsCacheKey(groupId)).then((cached) => {
        const state = this.state();
        // The server may have answered first, or the page moved on to another group.
        if (!cached || !Array.isArray(cached.lists) || this.requestedGroupId !== groupId || state.groupId === groupId) {
          return;
        }

        const lists = overlayPending(sortLists(cached.lists), state.pending, groupId);
        this.patch({
          groupId,
          lists,
          selectedListId: resolveSelection(lists, cached.selectedListId),
          loadFailedGroupId: undefined,
        });
      });
    }

    const done = new ReplaySubject<void>(1);
    const finish = () => {
      done.next();
      done.complete();
    };
    this.shoppingListService
      .getShoppingListsForGroup(groupId)
      .pipe(take(1))
      .subscribe({
        next: (answer) => {
          if (this.requestedGroupId !== groupId) {
            return;
          }

          const state = this.state();
          const lists = overlayPending(sortLists(answer), state.pending, groupId);
          this.patch({
            groupId,
            lists,
            selectedListId: resolveSelection(lists, state.groupId === groupId ? state.selectedListId : undefined),
            loadFailedGroupId: undefined,
          });
        },
        error: () => {
          // No connection (or a server that is restarting): what is on screen stays. Only a group with nothing to
          // show says so; the stream service asks again when the connection is back.
          if (this.requestedGroupId === groupId && this.state().groupId !== groupId) {
            this.patch({ loadFailedGroupId: groupId });
          }
          finish();
        },
        complete: finish,
      });

    return done.asObservable();
  }

  public select(listId?: number): void {
    this.patch({ selectedListId: listId });
  }

  /**
   * Applies one mutation. Both the live stream and this tab's own HTTP answers go through it, so "my write" and
   * "someone else's write" share one path. Applying is an idempotent upsert or removal by id, so the echo of our
   * own write changes nothing.
   */
  public applyEvent(event: ShoppingListEvent): void {
    this.events.next(event);

    const state = this.state();
    if (event.groupId !== state.groupId) {
      return;
    }

    // What someone removed stays removed: a change still waiting for it is dropped, not sent.
    const pending = dropPendingForRemoved(state.pending, event);
    const lists = overlayPending(applyEvent(state.lists, event), pending, state.groupId);
    if (lists === state.lists && pending === state.pending) {
      return;
    }

    this.patch({
      lists,
      pending,
      selectedListId: resolveSelection(lists, state.selectedListId),
    });
  }

  /**
   * A change made on this device (an item added, crossed off or put back): shown at once and kept in the queue until
   * the server has it. `ShoppingListSyncService` sends the queue.
   */
  public queueChange(change: PendingChange): void {
    const state = this.state();
    const pending = enqueue(state.pending, change);
    this.patch({ pending, lists: overlayPending(state.lists, pending, state.groupId) });
  }

  /** The server answered a queued change: `saved` is its item, absent when the change was refused and is dropped. */
  public settleChange(opId: string, saved?: ShoppingListItem): void {
    const state = this.state();
    const change = state.pending.find((candidate) => candidate.opId === opId);
    const pending = settle(state.pending, opId, saved);
    // A change of another group than the one on screen only leaves the queue.
    if (change && change.groupId !== state.groupId) {
      this.patch({ pending });
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

    this.patch({ pending, lists: overlayPending(lists, pending, state.groupId) });
  }

  /** Takes back an item that was added on this device and has not reached the server, with anything waiting for it. */
  public discardLocalItem(clientId: string): void {
    const state = this.state();
    const pending = state.pending.filter((change) => change.clientId !== clientId);
    const lists = state.lists.map((list) =>
      list.items?.some((item) => item.clientId === clientId && item.id < 0)
        ? { ...list, items: list.items.filter((item) => !(item.clientId === clientId && item.id < 0)) }
        : list
    );
    this.patch({ pending, lists });
  }

  /** The queue as the device kept it across a reload. */
  public restorePending(kept: PendingChange[]): void {
    const state = this.state();
    // Anything queued since the page opened goes after what the device kept.
    const merged = [...kept.filter((change) => !state.pending.some((queued) => queued.opId === change.opId)), ...state.pending];
    this.patch({ pending: merged, lists: overlayPending(state.lists, merged, state.groupId) });
  }

  /** Forgets the lists and the waiting changes. */
  public clear(): void {
    this.requestedGroupId = undefined;
    this.reset();
  }

  protected override replace(next: ShoppingListStateInterface): void {
    super.replace(next);
    this.changes.next(next);
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
