import { ShoppingList, ShoppingListItem } from "../open-api";
import {
  enqueue,
  isLocalItem,
  newClientId,
  nextLocalItemId,
  overlayPending,
  PendingAdd,
  PendingChange,
  pendingItemIds,
  PendingToggle,
  settle,
} from "./shopping-list-pending";

const item = (id: number, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem =>
  ({ id, shoppingListId: 1, name: `item-${id}`, unit: "", quantity: "", note: "", isChecked: false, ...overrides }) as ShoppingListItem;

const list = (id: number, items: ShoppingListItem[] = []): ShoppingList => ({ id, groupId: 1, name: `list-${id}`, items });

const add = (clientId: string, overrides: Partial<PendingAdd> = {}): PendingAdd => ({
  kind: "add",
  opId: clientId,
  groupId: 1,
  listId: 1,
  clientId,
  item: item(-1, { clientId, name: "Bread" }),
  command: { name: "Bread" },
  ...overrides,
});

const toggle = (opId: string, itemId: number, isChecked: boolean, overrides: Partial<PendingToggle> = {}): PendingToggle => ({
  kind: "toggle",
  opId,
  groupId: 1,
  listId: 1,
  itemId,
  isChecked,
  checkedAt: isChecked ? "2026-11-10T10:00:00Z" : undefined,
  checkedByUserId: isChecked ? 7 : undefined,
  ...overrides,
});

describe("shopping list pending changes", () => {
  describe("local rows", () => {
    it("have negative ids that never repeat, and a client id each", () => {
      const ids = new Set(Array.from({ length: 50 }, () => nextLocalItemId()));
      expect(ids.size).toBe(50);
      expect([...ids].every((id) => id < 0 && Number.isSafeInteger(id))).toBe(true);
      expect(isLocalItem(item(-5))).toBe(true);
      expect(isLocalItem(item(5))).toBe(false);

      const clientId = newClientId();
      expect(clientId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(newClientId()).not.toBe(clientId);
    });
  });

  describe("enqueue", () => {
    it("appends changes in the order they were made", () => {
      const pending = enqueue(enqueue([], add("a")), toggle("t1", 5, true));
      expect(pending.map((change) => change.opId)).toEqual(["a", "t1"]);
    });

    it("keeps one waiting change for an item crossed off and put back", () => {
      const pending = enqueue(enqueue(enqueue([], toggle("t0", 9, true)), toggle("t1", 5, true)), toggle("t2", 5, false));

      expect(pending.map((change) => change.opId)).toEqual(["t0", "t1"]);
      expect(pending[1]).toEqual(expect.objectContaining({ itemId: 5, isChecked: false, checkedAt: undefined }));
    });

    it("never rewrites the change at the head of the queue, which may be on its way", () => {
      const pending = enqueue(enqueue([], toggle("t1", 5, true)), toggle("t2", 5, false));

      expect(pending.map((change) => [change.opId, (change as PendingToggle).isChecked])).toEqual([
        ["t1", true],
        ["t2", false],
      ]);
    });

    it("matches a row that has not reached the server by its client id", () => {
      const first = toggle("t1", -1, true, { clientId: "a" });
      const pending = enqueue(enqueue(enqueue([], add("a")), first), toggle("t2", -1, false, { clientId: "a" }));

      expect(pending.map((change) => change.opId)).toEqual(["a", "t1"]);
      expect((pending[1] as PendingToggle).isChecked).toBe(false);
    });
  });

  describe("overlayPending", () => {
    it("returns the same lists when nothing is waiting for them", () => {
      const lists = [list(1, [item(1)])];
      expect(overlayPending(lists, [], 1)).toBe(lists);
      expect(overlayPending(lists, [toggle("t", 1, true, { groupId: 2 })], 1)).toBe(lists);
      expect(overlayPending(lists, [toggle("t", 1, false)], 1)).toBe(lists);
    });

    it("shows an added row the server does not have yet, once", () => {
      const lists = [list(1, [item(1)])];
      const once = overlayPending(lists, [add("a")], 1);
      const twice = overlayPending(once, [add("a")], 1);

      expect(once[0].items.map((row) => row.name)).toEqual(["item-1", "Bread"]);
      expect(twice).toBe(once);
      expect(lists[0].items).toHaveLength(1);
    });

    it("leaves the server's item alone once it carries the add's client id", () => {
      const lists = [list(1, [item(8, { clientId: "a", name: "Bread" })])];
      expect(overlayPending(lists, [add("a")], 1)).toBe(lists);
    });

    it("keeps a waiting cross-off over what the server says", () => {
      const lists = [list(1, [item(1), item(2)])];
      const result = overlayPending(lists, [toggle("t", 2, true)], 1);

      expect(result[0].items[1]).toEqual(expect.objectContaining({ isChecked: true, checkedByUserId: 7, checkedAt: "2026-11-10T10:00:00Z" }));
      expect(result[0].items[0]).toBe(lists[0].items[0]);
    });

    it("crosses off a row that is itself still waiting", () => {
      const result = overlayPending([list(1)], [add("a"), toggle("t", -1, true, { clientId: "a" })], 1);
      expect(result[0].items).toEqual([expect.objectContaining({ name: "Bread", isChecked: true })]);
    });

    it("skips changes for a list that is gone", () => {
      const lists = [list(2)];
      expect(overlayPending(lists, [add("a"), toggle("t", 1, true)], 1)).toBe(lists);
    });
  });

  describe("settle", () => {
    it("takes the answered change out of the queue", () => {
      const pending: PendingChange[] = [toggle("t1", 1, true), toggle("t2", 2, true)];
      expect(settle(pending, "t1").map((change) => change.opId)).toEqual(["t2"]);
      expect(settle(pending, "unknown")).toBe(pending);
    });

    it("points the cross-offs waiting for a saved add at the server's item", () => {
      const pending: PendingChange[] = [add("a"), toggle("t", -1, true, { clientId: "a" }), toggle("u", 3, true)];
      const rest = settle(pending, "a", item(42, { clientId: "a" }));

      expect(rest).toEqual([
        expect.objectContaining({ opId: "t", itemId: 42, clientId: undefined }),
        expect.objectContaining({ opId: "u", itemId: 3 }),
      ]);
    });

    it("drops the cross-offs waiting for an add the server refused", () => {
      const pending: PendingChange[] = [add("a"), toggle("t", -1, true, { clientId: "a" }), toggle("u", 3, true)];
      expect(settle(pending, "a").map((change) => change.opId)).toEqual(["u"]);
    });
  });

  it("names the rows with a change waiting, for the open group only", () => {
    const pending: PendingChange[] = [add("a"), toggle("t", 5, true), toggle("x", 6, true, { groupId: 2 })];
    expect([...pendingItemIds(pending, 1)].sort()).toEqual([-1, 5]);
  });
});
