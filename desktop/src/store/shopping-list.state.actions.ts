import { ShoppingListEvent, ShoppingListItem } from "../open-api";
import { PendingChange } from "../shopping-lists/shopping-list-pending";

export class LoadShoppingLists {
  static readonly type = "[Shopping Lists] Load shopping lists";

  constructor(public groupId: number) {}
}

export class SelectShoppingList {
  static readonly type = "[Shopping Lists] Select shopping list";

  constructor(public listId?: number) {}
}

/**
 * Applies one mutation to the store. Both the SSE stream and this tab's own HTTP responses go
 * through it, so "my write" and "someone else's write" share one code path. Applying is an
 * idempotent upsert/remove by id, so receiving the echo of our own write changes nothing.
 */
export class ApplyShoppingListEvent {
  static readonly type = "[Shopping Lists] Apply shopping list event";

  constructor(public event: ShoppingListEvent) {}
}

/**
 * A change made on this device (an item added, crossed off or put back): shown at once and kept in the queue until
 * the server has it. `ShoppingListSyncService` sends the queue.
 */
export class QueueShoppingListChange {
  static readonly type = "[Shopping Lists] Queue a change";

  constructor(public change: PendingChange) {}
}

/** The server answered a queued change: `saved` is its item, absent when the change was refused and is dropped. */
export class SettleShoppingListChange {
  static readonly type = "[Shopping Lists] Settle a queued change";

  constructor(
    public opId: string,
    public saved?: ShoppingListItem
  ) {}
}

/** Takes back an item that was added on this device and has not reached the server, with anything waiting for it. */
export class DiscardLocalShoppingListItem {
  static readonly type = "[Shopping Lists] Discard a local item";

  constructor(public clientId: string) {}
}

/** The queue as the device kept it across a reload. */
export class RestorePendingShoppingListChanges {
  static readonly type = "[Shopping Lists] Restore queued changes";

  constructor(public pending: PendingChange[]) {}
}
