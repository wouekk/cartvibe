import { ShoppingList, ShoppingListItem, UpsertShoppingListItemCommand } from "../open-api";

/**
 * A change made on this device that the server has not confirmed yet. In a shop the phone loses its signal between
 * the shelves, so adding an item and crossing one off never wait for the network: the change shows at once, waits
 * here (and on the device, across a reload), and is sent when the server can be reached.
 *
 * The rules when two people changed the same thing:
 *  - the last change to reach the server wins, per item;
 *  - an item someone deleted stays deleted: a waiting cross-off for it is dropped;
 *  - a change the server refuses (no permission any more, the list is gone) is dropped and the lists are read again.
 */
export type PendingChange = PendingAdd | PendingToggle;

/** A new item. `item` is the row shown meanwhile: a negative id, and the `clientId` the server will know it by. */
export interface PendingAdd {
  kind: "add";
  opId: string;
  groupId: number;
  listId: number;
  clientId: string;
  item: ShoppingListItem;
  command: UpsertShoppingListItemCommand;
}

/** An item crossed off or put back. `clientId` is set while the item itself has not reached the server. */
export interface PendingToggle {
  kind: "toggle";
  opId: string;
  groupId: number;
  listId: number;
  itemId: number;
  clientId?: string;
  isChecked: boolean;
  checkedAt?: string;
  checkedByUserId?: number;
}

/** A row that exists on this device only: its add is still waiting. */
export function isLocalItem(item: ShoppingListItem): boolean {
  return item.id < 0;
}

let localIdCounter = 0;

/** Ids of rows the server has not seen are negative, so they can never collide with a real one. */
export function nextLocalItemId(): number {
  localIdCounter = (localIdCounter + 1) % 1000;
  return -(Date.now() * 1000 + localIdCounter);
}

/** The key an add is known by on the server, so sending it twice adds one line. */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Plain http on a LAN address has no crypto.randomUUID (it needs a secure context).
  const random = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${Date.now().toString(16)}-${random()}-${random()}`;
}

function targets(change: PendingToggle, item: ShoppingListItem): boolean {
  return item.id === change.itemId || (!!change.clientId && item.clientId === change.clientId);
}

function sameItem(a: PendingToggle, b: PendingToggle): boolean {
  return a.itemId === b.itemId || (!!a.clientId && a.clientId === b.clientId);
}

/**
 * Adds a change to the queue. Crossing the same item off and on again while nothing could be sent leaves one
 * waiting change with the last state, except when the earlier one is at the head of the queue: that one may be on
 * its way to the server already.
 */
export function enqueue(pending: PendingChange[], change: PendingChange): PendingChange[] {
  if (change.kind === "toggle") {
    for (let index = pending.length - 1; index > 0; index--) {
      const earlier = pending[index];
      if (earlier.kind === "toggle" && sameItem(earlier, change)) {
        const copy = [...pending];
        copy[index] = { ...earlier, isChecked: change.isChecked, checkedAt: change.checkedAt, checkedByUserId: change.checkedByUserId };
        return copy;
      }
    }
  }

  return [...pending, change];
}

/**
 * Lays the waiting changes of one group over its lists as the server (or the device's copy) has them, so a refetch
 * or a live event never hides what this device is still about to send. Applying it twice changes nothing. Returns
 * the same array when there is nothing to lay over.
 */
export function overlayPending(lists: ShoppingList[], pending: PendingChange[], groupId: number | undefined): ShoppingList[] {
  let result = lists;

  for (const change of pending) {
    if (change.groupId !== groupId) {
      continue;
    }

    const index = result.findIndex((list) => list.id === change.listId);
    if (index === -1) {
      continue;
    }

    const list = result[index];
    const items = list.items ?? [];
    let nextItems = items;

    if (change.kind === "add") {
      if (!items.some((item) => item.clientId === change.clientId)) {
        nextItems = [...items, change.item];
      }
    } else if (items.some((item) => targets(change, item) && item.isChecked !== change.isChecked)) {
      nextItems = items.map((item) =>
        targets(change, item)
          ? {
              ...item,
              isChecked: change.isChecked,
              checkedAt: change.isChecked ? change.checkedAt : undefined,
              checkedByUserId: change.isChecked ? change.checkedByUserId : undefined,
            }
          : item
      );
    }

    if (nextItems !== items) {
      result = result === lists ? [...lists] : result;
      result[index] = { ...list, items: nextItems };
    }
  }

  return result;
}

/**
 * Takes a change out of the queue once the server answered. For an add that was saved, the cross-offs waiting for
 * that row now point at the server's item; for an add that was refused they are dropped with it.
 */
export function settle(pending: PendingChange[], opId: string, saved?: ShoppingListItem): PendingChange[] {
  const change = pending.find((candidate) => candidate.opId === opId);
  if (!change) {
    return pending;
  }

  const rest = pending.filter((candidate) => candidate.opId !== opId);
  if (change.kind !== "add") {
    return rest;
  }

  return rest.flatMap((candidate): PendingChange[] => {
    if (candidate.kind !== "toggle" || candidate.clientId !== change.clientId) {
      return [candidate];
    }
    return saved ? [{ ...candidate, itemId: saved.id, clientId: undefined }] : [];
  });
}

/** The ids of the rows with a change still waiting, for the "not sent yet" mark. */
export function pendingItemIds(pending: PendingChange[], groupId: number | undefined): Set<number> {
  const ids = new Set<number>();
  for (const change of pending) {
    if (change.groupId === groupId) {
      ids.add(change.kind === "add" ? change.item.id : change.itemId);
    }
  }
  return ids;
}
