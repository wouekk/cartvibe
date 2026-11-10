import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { ShoppingList, ShoppingListItem } from "../open-api";
import { PendingAdd, PendingToggle } from "../shopping-lists/shopping-list-pending";
import { AuthState } from "./auth.state";
import { Logout } from "./auth.state.actions";
import { GroupState } from "./group.state";
import { CachedShoppingLists, ShoppingListEventType, ShoppingListState, shoppingListsCacheKey } from "./shopping-list.state";
import {
  ApplyShoppingListEvent,
  DiscardLocalShoppingListItem,
  LoadShoppingLists,
  QueueShoppingListChange,
  RestorePendingShoppingListChanges,
  SettleShoppingListChange,
} from "./shopping-list.state.actions";

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

describe("ShoppingListState without a connection", () => {
  let store: Store;
  let httpMock: HttpTestingController;
  let storage: OfflineStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState])],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    store = TestBed.inject(Store);
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(OfflineStorageService);
  });

  afterEach(() => httpMock.verify());

  const request = (groupId = 1) =>
    httpMock.expectOne((r) => r.method === "GET" && r.url.endsWith(`/shopping-list/group/${groupId}`));

  const load = (lists: ShoppingList[], groupId = 1) => {
    store.dispatch(new LoadShoppingLists(groupId));
    request(groupId).flush(lists);
  };

  const names = () => store.selectSnapshot(ShoppingListState.lists).find((l) => l.id === 1)?.items.map((row) => row.name);

  describe("the device's copy", () => {
    it("shows the copy at once, and the server's answer replaces it", async () => {
      await storage.set(shoppingListsCacheKey(1), {
        lists: [list(1, "Supermarket", [item(1)]), list(2, "Market")],
        selectedListId: 2,
      } satisfies CachedShoppingLists);

      store.dispatch(new LoadShoppingLists(1));
      await settled();

      expect(store.selectSnapshot(ShoppingListState.groupId)).toBe(1);
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["Market", "Supermarket"]);
      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(2);

      request().flush([list(1, "Supermarket", [item(1), item(2)]), list(2, "Market")]);

      expect(names()).toEqual(["item-1", "item-2"]);
      // The list the person had open stays open across the answer.
      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(2);
    });

    it("keeps showing the copy when the server cannot be reached", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Supermarket", [item(1)])] } satisfies CachedShoppingLists);

      store.dispatch(new LoadShoppingLists(1));
      request().error(new ProgressEvent("error"), { status: 0 });
      await settled();

      expect(names()).toEqual(["item-1"]);
      expect(store.selectSnapshot(ShoppingListState.loadFailedGroupId)).toBeUndefined();
    });

    it("says so when there is neither a connection nor a copy, and recovers on the next answer", async () => {
      store.dispatch(new LoadShoppingLists(1));
      request().error(new ProgressEvent("error"), { status: 0 });
      await settled();

      expect(store.selectSnapshot(ShoppingListState.groupId)).toBeUndefined();
      expect(store.selectSnapshot(ShoppingListState.loadFailedGroupId)).toBe(1);

      load([list(1, "Supermarket")]);

      expect(store.selectSnapshot(ShoppingListState.loadFailedGroupId)).toBeUndefined();
      expect(store.selectSnapshot(ShoppingListState.groupId)).toBe(1);
    });

    it("does not put a late copy over the server's answer", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Old name")] } satisfies CachedShoppingLists);

      load([list(1, "New name")]);
      await settled();

      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["New name"]);
    });

    it("does not show one group's copy after the page moved on to another", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: [list(1, "Group one")] } satisfies CachedShoppingLists);

      store.dispatch(new LoadShoppingLists(1));
      store.dispatch(new LoadShoppingLists(2));
      await settled();
      request(1).flush([list(1, "Group one")]);
      request(2).flush([{ ...list(5, "Group two"), groupId: 2 }]);

      expect(store.selectSnapshot(ShoppingListState.groupId)).toBe(2);
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["Group two"]);
    });

    it("ignores a copy that is not a list of lists", async () => {
      await storage.set(shoppingListsCacheKey(1), { lists: "broken" });

      store.dispatch(new LoadShoppingLists(1));
      await settled();
      expect(store.selectSnapshot(ShoppingListState.groupId)).toBeUndefined();
      request().flush([]);
    });
  });

  describe("waiting changes", () => {
    beforeEach(() => load([list(1, "Supermarket", [item(1), item(2)])]));

    it("show at once and are counted for the open group", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new QueueShoppingListChange(crossOff("t", 2)));
      store.dispatch(new QueueShoppingListChange(crossOff("other", 99, { groupId: 2 })));

      expect(store.selectSnapshot(ShoppingListState.activeItems).map((row) => row.name)).toEqual(["item-1", "Bread"]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems).map((row) => row.id)).toEqual([2]);
      expect(store.selectSnapshot(ShoppingListState.pendingCount)).toBe(2);
      expect([...store.selectSnapshot(ShoppingListState.pendingItemIds)].sort((a, b) => a - b)).toEqual([-1, 2]);
    });

    it("survive a refetch that does not know them yet", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new QueueShoppingListChange(crossOff("t", 2)));

      load([list(1, "Supermarket", [item(1), item(2), item(3)])]);

      expect(store.selectSnapshot(ShoppingListState.activeItems).map((row) => row.name)).toEqual(["item-1", "item-3", "Bread"]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems).map((row) => row.id)).toEqual([2]);
    });

    it("survive someone else's live change to the same item", () => {
      store.dispatch(new QueueShoppingListChange(crossOff("t", 2)));

      store.dispatch(
        new ApplyShoppingListEvent({
          type: ShoppingListEventType.ItemUpdated,
          groupId: 1,
          shoppingListId: 1,
          item: item(2, { note: "the big one" }),
        })
      );

      const crossed = store.selectSnapshot(ShoppingListState.checkedItems)[0];
      expect(crossed).toEqual(expect.objectContaining({ id: 2, note: "the big one", isChecked: true }));
    });

    it("are replaced by the server's item when the add is saved", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new QueueShoppingListChange(crossOff("t", -1, { clientId: "a" })));

      store.dispatch(new SettleShoppingListChange("a", item(40, { clientId: "a", name: "Bread" })));

      // The row now has the server's id, and its cross-off still waits, pointed at that id.
      expect(store.selectSnapshot(ShoppingListState.lists)[0].items.map((row) => row.id)).toEqual([1, 2, 40]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems).map((row) => row.id)).toEqual([40]);
      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([
        expect.objectContaining({ opId: "t", itemId: 40, clientId: undefined }),
      ]);
    });

    it("make way for a crossed-off item the server brought back instead of adding", () => {
      load([list(1, "Supermarket", [item(1), item(5, { name: "Bread", isChecked: true, checkedAt: "2026-11-01T10:00:00Z" })])]);
      store.dispatch(new QueueShoppingListChange(breadAdd));

      store.dispatch(new SettleShoppingListChange("a", item(5, { name: "Bread", clientId: "a" })));

      expect(store.selectSnapshot(ShoppingListState.lists)[0].items.map((row) => row.id)).toEqual([1, 5]);
      expect(store.selectSnapshot(ShoppingListState.activeItems).map((row) => row.id)).toEqual([1, 5]);
    });

    it("are not shown twice when the live event arrives before the answer to the add", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));
      const saved = item(40, { clientId: "a", name: "Bread" });

      store.dispatch(new ApplyShoppingListEvent({ type: ShoppingListEventType.ItemAdded, groupId: 1, shoppingListId: 1, item: saved }));
      expect(names()).toEqual(["item-1", "item-2", "Bread"]);
      expect(store.selectSnapshot(ShoppingListState.lists)[0].items.map((row) => row.id)).toEqual([1, 2, 40]);

      store.dispatch(new SettleShoppingListChange("a", saved));
      expect(store.selectSnapshot(ShoppingListState.lists)[0].items.map((row) => row.id)).toEqual([1, 2, 40]);
      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
    });

    it("disappear with a refused add, together with what waited for it", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new QueueShoppingListChange(crossOff("t", -1, { clientId: "a" })));

      store.dispatch(new SettleShoppingListChange("a"));

      expect(names()).toEqual(["item-1", "item-2"]);
      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
    });

    it("are dropped for an item or a list someone removed", () => {
      store.dispatch(new QueueShoppingListChange(crossOff("first", 1)));
      store.dispatch(new QueueShoppingListChange(crossOff("second", 2)));

      store.dispatch(new ApplyShoppingListEvent({ type: ShoppingListEventType.ItemDeleted, groupId: 1, shoppingListId: 1, item: item(2) }));
      expect(store.selectSnapshot(ShoppingListState.pending).map((change) => change.opId)).toEqual(["first"]);

      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new ApplyShoppingListEvent({ type: ShoppingListEventType.ListDeleted, groupId: 1, shoppingListId: 1 }));
      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
    });

    it("are taken back with a local item the person deletes", () => {
      store.dispatch(new QueueShoppingListChange(crossOff("keep", 1)));
      store.dispatch(new QueueShoppingListChange(breadAdd));
      store.dispatch(new QueueShoppingListChange(crossOff("t", -1, { clientId: "a" })));

      store.dispatch(new DiscardLocalShoppingListItem("a"));

      expect(names()).toEqual(["item-1", "item-2"]);
      expect(store.selectSnapshot(ShoppingListState.pending).map((change) => change.opId)).toEqual(["keep"]);
    });

    it("come back after a reload ahead of anything queued since", () => {
      store.dispatch(new QueueShoppingListChange(crossOff("new", 1)));

      store.dispatch(new RestorePendingShoppingListChanges([breadAdd, crossOff("new", 1)]));

      expect(store.selectSnapshot(ShoppingListState.pending).map((change) => change.opId)).toEqual(["a", "new"]);
      expect(names()).toEqual(["item-1", "item-2", "Bread"]);
    });

    it("of another group only leave the queue when settled", () => {
      store.dispatch(new QueueShoppingListChange(crossOff("other", 2, { groupId: 2, listId: 9 })));

      store.dispatch(new SettleShoppingListChange("other", item(2, { shoppingListId: 9, isChecked: true })));

      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems)).toEqual([]);
    });

    it("leave with the account that signs out", () => {
      store.dispatch(new QueueShoppingListChange(breadAdd));

      store.dispatch(new Logout());

      expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
      expect(store.selectSnapshot(ShoppingListState.lists)).toEqual([]);
      expect(store.selectSnapshot(ShoppingListState.groupId)).toBeUndefined();
    });
  });
});
