import { ShoppingListEvent } from "../open-api";

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
