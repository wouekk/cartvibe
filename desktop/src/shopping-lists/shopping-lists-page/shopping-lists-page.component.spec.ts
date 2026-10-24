import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission, ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { ShoppingListsPageComponent } from "./shopping-lists-page.component";

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
  let shoppingListService: { [method: string]: jest.Mock };
  let snackbarService: { [method: string]: jest.Mock };
  let confirmed: boolean | undefined;

  beforeEach(async () => {
    confirmed = true;
    shoppingListService = {
      getShoppingListsForGroup: jest.fn().mockReturnValue(of(lists())),
      deleteShoppingList: jest.fn().mockReturnValue(of(undefined)),
      setShoppingListChecked: jest.fn().mockImplementation(setChecked),
    };
    snackbarService = {
      error: jest.fn(),
      success: jest.fn(),
      hint: jest.fn(),
      successFromTemplate: jest.fn().mockReturnValue({ dismiss: jest.fn() }),
    };

    await TestBed.configureTestingModule({
      declarations: [ShoppingListsPageComponent],
      imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]), PipesModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map([["groupId", "1"]]) as any), snapshot: undefined } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ShoppingListService, useValue: shoppingListService },
        { provide: ShoppingListStreamService, useValue: { connect: jest.fn(), disconnect: jest.fn() } },
        { provide: SnackbarService, useValue: snackbarService },
        {
          provide: AppDialog,
          useValue: { open: jest.fn().mockImplementation(() => ({ componentInstance: {}, afterClosed: () => of(confirmed) })) },
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

  it("opens the newest list and puts the open list above the list cards", () => {
    expect(component.selectedList()?.id).toBe(2);

    const workspace = testId("shopping-list-workspace")!;
    const cards = testId("shopping-list-cards")!;
    expect(workspace.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the cards newest first, finished lists last", () => {
    expect(component.listCards().map((card) => [card.id, card.past])).toEqual([
      [2, false],
      [1, false],
      [3, true],
    ]);
  });

  it("leaves the cards out when the only one is the open list", async () => {
    shoppingListService["getShoppingListsForGroup"].mockReturnValue(of([lists()[0]]));
    store.dispatch(new LoadShoppingLists(1));
    await fixture.whenStable();

    expect(component.showCards()).toBe(false);
    expect(testId("shopping-list-cards")).toBeNull();
  });

  it("opens a list from its card", async () => {
    (testId("shopping-list-card-1") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(component.selectedList()?.id).toBe(1);
  });

  it("deletes the open list from the header after confirming", async () => {
    (testId("shopping-list-delete") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(shoppingListService["deleteShoppingList"]).toHaveBeenCalledWith(2);
    expect(component.lists().map((l) => l.id)).toEqual([3, 1]);
    // The next list still being shopped opens, so pressing Delete again removes that one.
    expect(component.selectedList()?.id).toBe(1);
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    confirmed = undefined;

    (testId("shopping-list-delete") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(shoppingListService["deleteShoppingList"]).not.toHaveBeenCalled();
  });

  it("hides Delete list from someone who may not delete lists", async () => {
    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, groupPermissions: { 1: [] } } });
    await fixture.whenStable();

    expect(testId("shopping-list-delete")).toBeNull();
  });

  it("marks the open list complete, opens the next list and offers Undo", async () => {
    (testId("shopping-list-complete") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(shoppingListService["setShoppingListChecked"]).toHaveBeenCalledWith(2, { isChecked: true, itemIds: undefined });
    expect(component.lists().find((l) => l.id === 2)?.items.every((i) => i.isChecked)).toBe(true);
    expect(component.selectedList()?.id).toBe(1);
    expect(component.listCards().map((card) => [card.id, card.past])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ]);
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
    expect(component.listCards().find((card) => card.id === 3)?.past).toBe(false);
  });

  it("gives finished lists a menu, and lists being shopped none", () => {
    expect(testId("shopping-list-past-menu-3")).not.toBeNull();
    expect(testId("shopping-list-past-menu-1")).toBeNull();
  });
});
