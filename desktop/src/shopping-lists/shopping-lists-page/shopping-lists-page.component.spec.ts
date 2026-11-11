import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission, ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ScreenWakeLockService } from "../../services/screen-wake-lock.service";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { ShoppingListSyncService } from "../../services/shopping-list-sync.service";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { ShoppingListsPageComponent } from "./shopping-lists-page.component";

import type { Mock } from "vitest";
const item = (id: number, listId: number, isChecked = false): ShoppingListItem =>
  ({ id, shoppingListId: listId, name: `item-${id}`, isChecked, checkedAt: isChecked ? "2026-10-21T10:00:00Z" : undefined }) as ShoppingListItem;

const list = (id: number, name: string, createdAt: string, items: ShoppingListItem[]): ShoppingList =>
  ({ id, groupId: 1, name, createdAt, items }) as ShoppingList;

/** Aldi is the newest list, Lidl an older one still being shopped, Market finished. */
const lists = (): ShoppingList[] => [
  list(1, "Lidl", "2026-10-20T08:00:00Z", [item(10, 1)]),
  list(2, "Aldi", "2026-10-22T08:00:00Z", [item(20, 2), item(21, 2, true)]),
  list(3, "Market", "2026-10-21T08:00:00Z", [item(30, 3, true)]),
];

/** What the server answers for PUT /{listId}/checked. */
const setChecked = (listId: number, command: { isChecked: boolean; itemIds?: number[] }) => {
  const target = lists().find((candidate) => candidate.id === listId)!;
  return of({
    ...target,
    items: target.items.map((existing) =>
      !command.itemIds || command.itemIds.includes(existing.id) ? { ...existing, isChecked: command.isChecked } : existing
    ),
  });
};

describe("ShoppingListsPageComponent", () => {
  let fixture: ComponentFixture<ShoppingListsPageComponent>;
  let component: ShoppingListsPageComponent;
  let store: Store;
  let shoppingListService: { [method: string]: Mock };
  let snackbarService: { [method: string]: Mock };
  let confirmed: boolean | undefined;
  let wakeLock: { supported: boolean; enabled: ReturnType<typeof signal<boolean>>; enable: Mock; disable: Mock };

  beforeEach(async () => {
    confirmed = true;
    wakeLock = {
      supported: true,
      enabled: signal(false),
      enable: vi.fn().mockResolvedValue(true),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    shoppingListService = {
      getShoppingListsForGroup: vi.fn().mockReturnValue(of(lists())),
      deleteShoppingList: vi.fn().mockReturnValue(of(undefined)),
      announceGoingShopping: vi.fn().mockReturnValue(of(undefined)),
      setShoppingListChecked: vi.fn().mockImplementation(setChecked),
    };
    snackbarService = {
      error: vi.fn(),
      success: vi.fn(),
      hint: vi.fn(),
      successFromTemplate: vi.fn().mockReturnValue({ dismiss: vi.fn() }),
    };

    await TestBed.configureTestingModule({
    imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]), ShoppingListsPageComponent],
    providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map([["groupId", "1"]]) as any), snapshot: undefined } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ShoppingListService, useValue: shoppingListService },
        { provide: ShoppingListStreamService, useValue: { connect: vi.fn(), disconnect: vi.fn(), status: signal("live") } },
        { provide: ShoppingListSyncService, useValue: { stalled: signal(false), drained: vi.fn().mockResolvedValue(true) } },
        { provide: SnackbarService, useValue: snackbarService },
        { provide: ScreenWakeLockService, useValue: wakeLock },
        {
            provide: AppDialog,
            useValue: { open: vi.fn().mockImplementation(() => ({ componentInstance: {}, afterClosed: () => of(confirmed) })) },
        },
    ],
    schemas: [NO_ERRORS_SCHEMA],
}).compileComponents();

    store = TestBed.inject(Store);
    store.reset({
      ...store.snapshot(),
      auth: {
        ...store.snapshot().auth,
        groupPermissions: {
          1: [Permission.GroupShoppingListsCreate, Permission.GroupShoppingListsUpdate, Permission.GroupShoppingListsDelete],
        },
      },
    });
    store.dispatch(new LoadShoppingLists(1));

    fixture = TestBed.createComponent(ShoppingListsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const testId = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  it("opens the newest list and puts the list switcher above the open list", () => {
    expect(component.selectedList()?.id).toBe(2);

    const workspace = testId("shopping-list-workspace")!;
    const cards = testId("shopping-list-cards")!;
    expect(cards.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows each list being shopped as a chip with what is left to buy, the open one pressed", () => {
    expect(testId("shopping-list-card-2")?.textContent).toContain("Aldi");
    expect(testId("shopping-list-card-2")?.textContent).toContain("1");
    expect(testId("shopping-list-card-2")?.getAttribute("aria-pressed")).toBe("true");
    expect(testId("shopping-list-card-1")?.getAttribute("aria-pressed")).toBe("false");
    expect(testId("shopping-list-card-1")?.getAttribute("title")).toBe("item-10");
  });

  it("lists the lists being shopped newest first, and the finished ones apart", () => {
    expect(component.activeCards().map((card) => card.id)).toEqual([2, 1]);
    expect(component.completedCards().map((card) => card.id)).toEqual([3]);
  });

  it("keeps finished lists folded away until Completed is opened", async () => {
    expect(testId("shopping-list-completed-toggle")?.textContent).toContain("Completed (1)");
    expect(testId("shopping-list-completed-cards")).toBeNull();

    (testId("shopping-list-completed-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(testId("shopping-list-completed-cards")).not.toBeNull();
    expect(testId("shopping-list-card-3")).not.toBeNull();
  });

  it("leaves the active cards out when the only one is the open list", async () => {
    shoppingListService["getShoppingListsForGroup"].mockReturnValue(of([lists()[0]]));
    store.dispatch(new LoadShoppingLists(1));
    await fixture.whenStable();

    expect(component.showActiveCards()).toBe(false);
    expect(testId("shopping-list-cards")).toBeNull();
    expect(testId("shopping-list-completed-toggle")).toBeNull();
  });

  it("opens a list from its card", async () => {
    (testId("shopping-list-card-1") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(component.selectedList()?.id).toBe(1);
  });

  it("deletes the open list after confirming", async () => {
    component.deleteList(component.selectedList()!);
    await fixture.whenStable();

    expect(shoppingListService["deleteShoppingList"]).toHaveBeenCalledWith(2);
    expect(component.lists().map((l) => l.id)).toEqual([3, 1]);
    // The next list still being shopped opens, so pressing Delete again removes that one.
    expect(component.selectedList()?.id).toBe(1);
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    confirmed = undefined;

    component.deleteList(component.selectedList()!);
    await fixture.whenStable();

    expect(shoppingListService["deleteShoppingList"]).not.toHaveBeenCalled();
  });

  it("keeps Delete list out of the page header: it lives in the list's menu, for those who may delete", async () => {
    // The menu's entries render only once it opens; the header must not carry the red button any more.
    expect(testId("shopping-list-delete")).toBeNull();
    expect(component.canDelete()).toBe(true);

    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, groupPermissions: { 1: [] } } });
    await fixture.whenStable();

    expect(component.canDelete()).toBe(false);
  });

  describe("Shop mode", () => {
    it("shows the open list alone and keeps the screen on", async () => {
      expect(testId("shopping-list-shop-mode-leave")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-table-header")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("app-shopping-trips")).not.toBeNull();

      component.setShopMode(true);
      await fixture.whenStable();

      expect(wakeLock.enable).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector("app-table-header")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-shopping-trips")).toBeNull();
      expect(testId("shopping-list-cards")).toBeNull();
      expect(testId("shopping-list-completed-toggle")).toBeNull();
      expect(testId("shopping-list-going-shopping")).toBeNull();
      expect(testId("shopping-list-import-recipe")).toBeNull();
      expect(testId("shopping-list-workspace")).not.toBeNull();
      expect(testId("shopping-list-complete")).not.toBeNull();
    });

    it("is left from the button in the list's header, which lets the screen sleep again", async () => {
      component.setShopMode(true);
      await fixture.whenStable();

      (testId("shopping-list-shop-mode-leave") as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(component.shopMode()).toBe(false);
      expect(wakeLock.disable).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector("app-table-header")).not.toBeNull();
      expect(testId("shopping-list-cards")).not.toBeNull();
    });

    it("starts by itself once the household has been told about the shopping trip", async () => {
      (testId("shopping-list-going-shopping") as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(shoppingListService["announceGoingShopping"]).toHaveBeenCalledWith(1);
      expect(component.shopMode()).toBe(true);
    });

    it("stays on, with a word about the screen, when the browser refuses to keep it awake", async () => {
      wakeLock.enable.mockResolvedValue(false);

      component.setShopMode(true);
      await fixture.whenStable();
      await Promise.resolve();

      expect(component.shopMode()).toBe(true);
      expect(snackbarService["hint"]).toHaveBeenCalledWith("Could not keep the screen on.");
    });

    it("works without the wake lock where the browser has none, and ends with the page", async () => {
      wakeLock.supported = false;

      component.setShopMode(true);
      await fixture.whenStable();

      expect(component.shopMode()).toBe(true);
      expect(wakeLock.enable).not.toHaveBeenCalled();

      fixture.destroy();
      expect(wakeLock.disable).toHaveBeenCalled();
    });
  });

  it("marks the open list complete, opens the next list and offers Undo", async () => {
    (testId("shopping-list-complete") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(shoppingListService["setShoppingListChecked"]).toHaveBeenCalledWith(2, { isChecked: true, itemIds: undefined });
    expect(component.lists().find((l) => l.id === 2)?.items.every((i) => i.isChecked)).toBe(true);
    expect(component.selectedList()?.id).toBe(1);
    expect(component.activeCards().map((card) => card.id)).toEqual([1]);
    expect(component.completedCards().map((card) => card.id)).toEqual([2, 3]);
    expect(snackbarService["successFromTemplate"]).toHaveBeenCalled();
    expect(component.lastCompleted()).toEqual({ listId: 2, name: "Aldi", itemIds: [20] });
  });

  it("Undo puts back only the items Mark as complete crossed off and reopens the list", async () => {
    component.completeList(component.selectedList()!);
    await fixture.whenStable();

    component.undoComplete();
    await fixture.whenStable();

    expect(shoppingListService["setShoppingListChecked"]).toHaveBeenLastCalledWith(2, { isChecked: false, itemIds: [20] });
    expect(component.selectedList()?.id).toBe(2);
    expect(component.selectedList()?.items.map((i) => i.isChecked)).toEqual([false, true]);
  });

  it("restores a finished list and opens it", async () => {
    component.restoreList(component.lists().find((l) => l.id === 3)!);
    await fixture.whenStable();

    expect(shoppingListService["setShoppingListChecked"]).toHaveBeenCalledWith(3, { isChecked: false, itemIds: undefined });
    expect(component.selectedList()?.id).toBe(3);
    expect(component.activeCards().map((card) => card.id)).toContain(3);
    expect(component.completedCards()).toEqual([]);
  });

  it("gives finished lists a menu, and lists being shopped none", async () => {
    component.showCompleted.set(true);
    await fixture.whenStable();

    expect(testId("shopping-list-past-menu-3")).not.toBeNull();
    expect(testId("shopping-list-past-menu-1")).toBeNull();
  });
});
