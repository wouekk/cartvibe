import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { Group, Permission, ShoppingList, ShoppingListItem } from "../open-api";
import { AuthState } from "./auth.state";
import { SetPermissions } from "./auth.state.actions";
import { GroupState } from "./group.state";
import { SetGroups, SetSelectedGroupId } from "./group.state.actions";
import { applyEvent, ShoppingListEventType, ShoppingListState } from "./shopping-list.state";
import { ApplyShoppingListEvent, LoadShoppingLists, SelectShoppingList } from "./shopping-list.state.actions";

const item = (id: number, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem => ({
  id,
  shoppingListId: 1,
  name: `item-${id}`,
  quantity: "",
  note: "",
  isChecked: false,
  createdAt: `2026-10-19T10:00:0${id}Z`,
  ...overrides,
});

const list = (id: number, name: string, items: ShoppingListItem[] = []): ShoppingList => ({
  id,
  groupId: 1,
  name,
  items,
});

const group = (id: number, isAllGroup = false): Group => ({ id, name: `group-${id}`, isAllGroup }) as Group;

describe("ShoppingListState", () => {
  let store: Store;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState])],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    store = TestBed.inject(Store);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const load = (groupId: number, lists: ShoppingList[]) => {
    store.dispatch(new LoadShoppingLists(groupId));
    httpMock
      .expectOne((r) => r.method === "GET" && r.url.endsWith(`/shopping-list/group/${groupId}`))
      .flush(lists);
  };

  describe("LoadShoppingLists", () => {
    it("stores the group's lists sorted by name and selects the first", () => {
      load(1, [list(2, "Pharmacy"), list(1, "Supermarket")]);

      expect(store.selectSnapshot(ShoppingListState.groupId)).toBe(1);
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["Pharmacy", "Supermarket"]);
      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(2);
    });

    it("keeps the selection across a refetch while the list still exists", () => {
      load(1, [list(1, "A"), list(2, "B")]);
      store.dispatch(new SelectShoppingList(2));

      load(1, [list(1, "A"), list(2, "B")]);

      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(2);
    });

    it("falls back to the first list when the selected one is gone", () => {
      load(1, [list(1, "A"), list(2, "B")]);
      store.dispatch(new SelectShoppingList(2));

      load(1, [list(1, "A")]);

      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(1);
    });
  });

  describe("item selectors", () => {
    it("splits the selected list into items to buy (by creation) and crossed off (latest first)", () => {
      load(1, [
        list(1, "A", [
          item(3),
          item(1),
          item(2, { isChecked: true, checkedAt: "2026-10-19T11:00:00Z" }),
          item(4, { isChecked: true, checkedAt: "2026-10-19T12:00:00Z" }),
        ]),
      ]);

      expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([1, 3]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems).map((i) => i.id)).toEqual([4, 2]);
    });
  });

  describe("ApplyShoppingListEvent", () => {
    beforeEach(() => load(1, [list(1, "Supermarket", [item(1)])]));

    const apply = (event: Parameters<typeof applyEvent>[1]) => store.dispatch(new ApplyShoppingListEvent(event));

    it("adds an item, and applying the same event again changes nothing", () => {
      const event = { type: ShoppingListEventType.ItemAdded, groupId: 1, shoppingListId: 1, item: item(2) };
      apply(event);
      apply(event);

      expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([1, 2]);
    });

    it("moves a toggled item to crossed off", () => {
      apply({
        type: ShoppingListEventType.ItemToggled,
        groupId: 1,
        shoppingListId: 1,
        item: item(1, { isChecked: true, checkedAt: "2026-10-19T12:00:00Z" }),
      });

      expect(store.selectSnapshot(ShoppingListState.activeItems)).toEqual([]);
      expect(store.selectSnapshot(ShoppingListState.checkedItems).map((i) => i.id)).toEqual([1]);
    });

    it("removes a deleted item and cleared items", () => {
      apply({ type: ShoppingListEventType.ItemAdded, groupId: 1, shoppingListId: 1, item: item(2) });
      apply({ type: ShoppingListEventType.ItemDeleted, groupId: 1, shoppingListId: 1, item: item(1) });
      expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([2]);

      apply({ type: ShoppingListEventType.CheckedCleared, groupId: 1, shoppingListId: 1, itemIds: [2] });
      expect(store.selectSnapshot(ShoppingListState.selectedList)?.items).toEqual([]);
    });

    it("creates, renames and deletes lists, keeping them sorted and the selection valid", () => {
      apply({ type: ShoppingListEventType.ListCreated, groupId: 1, shoppingListId: 2, list: list(2, "Bakery") });
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["Bakery", "Supermarket"]);

      apply({
        type: ShoppingListEventType.ListUpdated,
        groupId: 1,
        shoppingListId: 1,
        list: list(1, "Aldi", [item(1)]),
      });
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.name)).toEqual(["Aldi", "Bakery"]);

      apply({ type: ShoppingListEventType.ListDeleted, groupId: 1, shoppingListId: 1 });
      expect(store.selectSnapshot(ShoppingListState.lists).map((l) => l.id)).toEqual([2]);
      expect(store.selectSnapshot(ShoppingListState.selectedList)?.id).toBe(2);
    });

    it("ignores events for another group, unknown types, and items of unknown lists", () => {
      const before = store.selectSnapshot(ShoppingListState.lists);

      apply({ type: ShoppingListEventType.ItemAdded, groupId: 2, shoppingListId: 1, item: item(9) });
      apply({ type: "SOMETHING_NEW", groupId: 1, shoppingListId: 1, item: item(9) });
      apply({ type: ShoppingListEventType.ItemAdded, groupId: 1, shoppingListId: 99, item: item(9) });

      expect(store.selectSnapshot(ShoppingListState.lists)).toBe(before);
    });
  });

  describe("targetGroupId", () => {
    beforeEach(() => {
      store.dispatch(new SetGroups([group(10, true), group(1), group(2)]));
      store.dispatch(
        new SetPermissions([], {
          10: [Permission.GroupShoppingListsRead],
          2: [Permission.GroupShoppingListsRead],
        })
      );
    });

    it("never offers the All group, even when its permissions include read", () => {
      expect(store.selectSnapshot(ShoppingListState.readableGroups).map((g) => g.id)).toEqual([2]);
    });

    it("uses the selected group when its lists are readable", () => {
      store.dispatch(new SetSelectedGroupId("2"));
      expect(store.selectSnapshot(ShoppingListState.targetGroupId)).toBe(2);
    });

    it("falls back to the first readable group otherwise", () => {
      store.dispatch(new SetSelectedGroupId("1"));
      expect(store.selectSnapshot(ShoppingListState.targetGroupId)).toBe(2);

      store.dispatch(new SetSelectedGroupId("10"));
      expect(store.selectSnapshot(ShoppingListState.targetGroupId)).toBe(2);
    });

    it("is undefined when no group's lists are readable", () => {
      store.dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead] }));
      expect(store.selectSnapshot(ShoppingListState.targetGroupId)).toBeUndefined();
    });
  });
});
