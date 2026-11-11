import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { ShoppingList, ShoppingListItem } from "../open-api";
import { PendingAdd, PendingToggle } from "../shopping-lists/shopping-list-pending";
import { AuthStore } from "./auth.store";
import { CachedShoppingLists, ShoppingListEventType, shoppingListsCacheKey } from "./shopping-list.store";
import {
  ShoppingListStore,
} from "./shopping-list.store";

const item = (id: number, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem =>
  ({
    id,
    shoppingListId: 1,
    name: `item-${id}`,
    unit: "",
    quantity: "",
    note: "",
    isChecked: false,
    createdAt: "2026-11-10T10:00:00Z",
    ...overrides,
  }) as ShoppingListItem;

const list = (id: number, name: string, items: ShoppingListItem[] = []): ShoppingList => ({ id, groupId: 1, name, items });

const breadAdd: PendingAdd = {
  kind: "add",
  opId: "a",
  groupId: 1,
  listId: 1,
  clientId: "a",
  item: item(-1, { clientId: "a", name: "Bread", createdAt: "2026-11-10T11:00:00Z" }),
  command: { name: "Bread" },
};

const crossOff = (opId: string, itemId: number, overrides: Partial<PendingToggle> = {}): PendingToggle => ({
  kind: "toggle",
  opId,
  groupId: 1,
  listId: 1,
  itemId,
  isChecked: true,
  checkedAt: "2026-11-10T12:00:00Z",
  checkedByUserId: 7,
  ...overrides,
});

/** Lets the device copy's promise (and anything chained on it) settle. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve));

describe("ShoppingListStore without a connection", () => {
  let store: Store;
  let listStore: ShoppingListStore;
  let httpMock: HttpTestingController;
  let storage: OfflineStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([])],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    store = TestBed.inject(Store);
    listStore = TestBed.inject(ShoppingListStore);
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(OfflineStorageService);
  });

  afterEach(() => httpMock.verify());

  const request = (groupId = 1) =>
    httpMock.expectOne((r) => r.method === "GET" && r.url.endsWith(`/shopping-list/group/${groupId}`));

  const load = (lists: ShoppingList[], groupId = 1) => {
    listStore.load(groupId);
    request(groupId).flush(lists);
  };

  const names = () => listStore.lists().find((l) => l.id === 1)?.items.map((row) => row.name);

  describe("the device's copy", () => {
    it("shows the copy at once, and the server's answer replaces it", async () => {
      await storage.set(shoppingListsCacheKey(1), {
        lists: [list(1, "Supermarket", [item(1)]), list(2, "Market")],
        selectedListId: 2,
      } satisfies CachedShoppingLists);

      listStore.load(1);
      await settled();

      expect(listStore.groupId()).toBe(1);
      expect(listStore.lists().map((l) => l.name)).toEqual(["Market", "Supermarket"]);
      expect(listStore.selectedList()?.id).toBe(2);

      request().flush([list(1, "Supermarket", [item(1), item(2)]), list(2, "Market")]);

      expect(names()).toEqual(["item-1", "item-2"]);
      // The list the person had open stays open across the answer.
      expect(listStore.selectedList()?.id).toBe(2);
    });

    it("keeps showing the copy when the server cannot be reached", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Supermarket", [item(1)])] } satisfies CachedShoppingLists);

      listStore.load(1);
      request().error(new ProgressEvent("error"), { status: 0 });
      await settled();

      expect(names()).toEqual(["item-1"]);
      expect(listStore.loadFailedGroupId()).toBeUndefined();
    });

    it("says so when there is neither a connection nor a copy, and recovers on the next answer", async () => {
      listStore.load(1);
      request().error(new ProgressEvent("error"), { status: 0 });
      await settled();

      expect(listStore.groupId()).toBeUndefined();
      expect(listStore.loadFailedGroupId()).toBe(1);

      load([list(1, "Supermarket")]);

      expect(listStore.loadFailedGroupId()).toBeUndefined();
      expect(listStore.groupId()).toBe(1);
    });

    it("does not put a late copy over the server's answer", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Old name")] } satisfies CachedShoppingLists);

      load([list(1, "New name")]);
      await settled();

      expect(listStore.lists().map((l) => l.name)).toEqual(["New name"]);
    });

    it("does not show one group's copy after the page moved on to another", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Group one")] } satisfies CachedShoppingLists);

      listStore.load(1);
      listStore.load(2);
      await settled();
      request(1).flush([list(1, "Group one")]);
      request(2).flush([{ ...list(5, "Group two"), groupId: 2 }]);

      expect(listStore.groupId()).toBe(2);
      expect(listStore.lists().map((l) => l.name)).toEqual(["Group two"]);
    });

    it("ignores a copy that is not a list of lists", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: "broken" });

      listStore.load(1);
      await settled();
      expect(listStore.groupId()).toBeUndefined();
      request().flush([]);
    });
  });

  describe("waiting changes", () => {
    beforeEach(() => load([list(1, "Supermarket", [item(1), item(2)])]));

    it("show at once and are counted for the open group", () => {
      listStore.queueChange(breadAdd);
      listStore.queueChange(crossOff("t", 2));
      listStore.queueChange(crossOff("other", 99, { groupId: 2 }));

      expect(listStore.activeItems().map((row) => row.name)).toEqual(["item-1", "Bread"]);
      expect(listStore.checkedItems().map((row) => row.id)).toEqual([2]);
      expect(listStore.pendingCount()).toBe(2);
      expect([...listStore.pendingItemIds()].sort((a, b) => a - b)).toEqual([-1, 2]);
    });

    it("survive a refetch that does not know them yet", () => {
      listStore.queueChange(breadAdd);
      listStore.queueChange(crossOff("t", 2));

      load([list(1, "Supermarket", [item(1), item(2), item(3)])]);

      expect(listStore.activeItems().map((row) => row.name)).toEqual(["item-1", "item-3", "Bread"]);
      expect(listStore.checkedItems().map((row) => row.id)).toEqual([2]);
    });

    it("survive someone else's live change to the same item", () => {
      listStore.queueChange(crossOff("t", 2));

      listStore.applyEvent({
          type: ShoppingListEventType.ItemUpdated,
          groupId: 1,
          shoppingListId: 1,
          item: item(2, { note: "the big one" }),
        });

      const crossed = listStore.checkedItems()[0];
      expect(crossed).toEqual(expect.objectContaining({ id: 2, note: "the big one", isChecked: true }));
    });

    it("are replaced by the server's item when the add is saved", () => {
      listStore.queueChange(breadAdd);
      listStore.queueChange(crossOff("t", -1, { clientId: "a" }));

      listStore.settleChange("a", item(40, { clientId: "a", name: "Bread" }));

      // The row now has the server's id, and its cross-off still waits, pointed at that id.
      expect(listStore.lists()[0].items.map((row) => row.id)).toEqual([1, 2, 40]);
      expect(listStore.checkedItems().map((row) => row.id)).toEqual([40]);
      expect(listStore.pending()).toEqual([
        expect.objectContaining({ opId: "t", itemId: 40, clientId: undefined }),
      ]);
    });

    it("make way for a crossed-off item the server brought back instead of adding", () => {
      load([list(1, "Supermarket", [item(1), item(5, { name: "Bread", isChecked: true, checkedAt: "2026-11-01T10:00:00Z" })])]);
      listStore.queueChange(breadAdd);

      listStore.settleChange("a", item(5, { name: "Bread", clientId: "a" }));

      expect(listStore.lists()[0].items.map((row) => row.id)).toEqual([1, 5]);
      expect(listStore.activeItems().map((row) => row.id)).toEqual([1, 5]);
    });

    it("are not shown twice when the live event arrives before the answer to the add", () => {
      listStore.queueChange(breadAdd);
      const saved = item(40, { clientId: "a", name: "Bread" });

      listStore.applyEvent({ type: ShoppingListEventType.ItemAdded, groupId: 1, shoppingListId: 1, item: saved });
      expect(names()).toEqual(["item-1", "item-2", "Bread"]);
      expect(listStore.lists()[0].items.map((row) => row.id)).toEqual([1, 2, 40]);

      listStore.settleChange("a", saved);
      expect(listStore.lists()[0].items.map((row) => row.id)).toEqual([1, 2, 40]);
      expect(listStore.pending()).toEqual([]);
    });

    it("disappear with a refused add, together with what waited for it", () => {
      listStore.queueChange(breadAdd);
      listStore.queueChange(crossOff("t", -1, { clientId: "a" }));

      listStore.settleChange("a");

      expect(names()).toEqual(["item-1", "item-2"]);
      expect(listStore.pending()).toEqual([]);
    });

    it("are dropped for an item or a list someone removed", () => {
      listStore.queueChange(crossOff("first", 1));
      listStore.queueChange(crossOff("second", 2));

      listStore.applyEvent({ type: ShoppingListEventType.ItemDeleted, groupId: 1, shoppingListId: 1, item: item(2) });
      expect(listStore.pending().map((change) => change.opId)).toEqual(["first"]);

      listStore.queueChange(breadAdd);
      listStore.applyEvent({ type: ShoppingListEventType.ListDeleted, groupId: 1, shoppingListId: 1 });
      expect(listStore.pending()).toEqual([]);
    });

    it("are taken back with a local item the person deletes", () => {
      listStore.queueChange(crossOff("keep", 1));
      listStore.queueChange(breadAdd);
      listStore.queueChange(crossOff("t", -1, { clientId: "a" }));

      listStore.discardLocalItem("a");

      expect(names()).toEqual(["item-1", "item-2"]);
      expect(listStore.pending().map((change) => change.opId)).toEqual(["keep"]);
    });

    it("come back after a reload ahead of anything queued since", () => {
      listStore.queueChange(crossOff("new", 1));

      listStore.restorePending([breadAdd, crossOff("new", 1)]);

      expect(listStore.pending().map((change) => change.opId)).toEqual(["a", "new"]);
      expect(names()).toEqual(["item-1", "item-2", "Bread"]);
    });

    it("of another group only leave the queue when settled", () => {
      listStore.queueChange(crossOff("other", 2, { groupId: 2, listId: 9 }));

      listStore.settleChange("other", item(2, { shoppingListId: 9, isChecked: true }));

      expect(listStore.pending()).toEqual([]);
      expect(listStore.checkedItems()).toEqual([]);
    });

    it("leave with the account that signs out", () => {
      listStore.queueChange(breadAdd);

      TestBed.inject(AuthStore).logout();

      expect(listStore.pending()).toEqual([]);
      expect(listStore.lists()).toEqual([]);
      expect(listStore.groupId()).toBeUndefined();
    });
  });
});
