import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";

import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { ShoppingListComponent } from "./shopping-list.component";

import type { Mock } from "vitest";
const milk = {
  id: 1,
  shoppingListId: 1,
  name: "Milk",
  unit: "",
  quantity: "",
  note: "",
  isChecked: false,
} as ShoppingListItem;

const supermarket: ShoppingList = { id: 1, groupId: 1, name: "Supermarket", items: [milk] };

describe("ShoppingListComponent", () => {
  let fixture: ComponentFixture<ShoppingListComponent>;
  let component: ShoppingListComponent;
  let store: Store;
  let shoppingListService: Record<"getShoppingListsForGroup" | "setShoppingListItemChecked" | "addShoppingListItem" | "setShoppingListItemClassification", Mock>;
  let snackbarService: { error: Mock };

  beforeEach(async () => {
    shoppingListService = {
      getShoppingListsForGroup: vi.fn().mockReturnValue(of([supermarket])),
      setShoppingListItemChecked: vi.fn(),
      addShoppingListItem: vi.fn(),
      setShoppingListItemClassification: vi.fn(),
    };
    snackbarService = { error: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [ShoppingListComponent],
      imports: [
        NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]),
        PipesModule,
        ReactiveFormsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShoppingListService, useValue: shoppingListService },
        { provide: SnackbarService, useValue: snackbarService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(Store);
    store.dispatch(new LoadShoppingLists(1));

    fixture = TestBed.createComponent(ShoppingListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("list", supermarket);
    fixture.componentRef.setInput("groupId", 1);
  });

  const setCanUpdate = async (canUpdate: boolean) => {
    fixture.componentRef.setInput("canUpdate", canUpdate);
    await fixture.whenStable();
  };

  // Sending is ShoppingListSyncService's job (its own spec): the component only shows the change and queues it.
  it("crosses an item off at once and queues the change, without waiting for the server", async () => {
    await setCanUpdate(true);

    component.toggleItem(milk);

    expect(store.selectSnapshot(ShoppingListState.checkedItems).map((i) => i.id)).toEqual([1]);
    expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([
      expect.objectContaining({ kind: "toggle", groupId: 1, listId: 1, itemId: 1, isChecked: true }),
    ]);
    expect(store.selectSnapshot(ShoppingListState.pendingItemIds).has(1)).toBe(true);
    expect(shoppingListService.setShoppingListItemChecked).not.toHaveBeenCalled();
    expect(snackbarService.error).not.toHaveBeenCalled();
  });

  it("marks the row as not sent yet while its change waits", async () => {
    await setCanUpdate(true);

    component.toggleItem(milk);
    component.showCrossedOff.set(true);
    await fixture.whenStable();

    const row = fixture.nativeElement.querySelector('[data-testid="shopping-list-checked-items"] app-shopping-list-item');
    expect(row).not.toBeNull();
    expect(component.pendingItemIds().has(1)).toBe(true);
  });

  it("puts a crossed-off item back with one waiting change, not two", async () => {
    await setCanUpdate(true);
    const other = { ...milk, id: 9, name: "Eggs" };

    // A change at the head of the queue may already be on its way, so the pair for Milk sits behind another one.
    component.toggleItem(other);
    component.toggleItem(milk);
    component.toggleItem({ ...milk, isChecked: true });

    const pending = store.selectSnapshot(ShoppingListState.pending);
    expect(pending.map((change) => (change.kind === "toggle" ? [change.itemId, change.isChecked] : null))).toEqual([
      [9, true],
      [1, false],
    ]);
    expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([1]);
  });

  it("sends a tag correction and applies the corrected item", async () => {
    shoppingListService["setShoppingListItemClassification"].mockReturnValue(
      of({ ...milk, health: "MEDIUM", classificationOverridden: true })
    );

    component.correctTags({ item: milk, health: "MEDIUM" });

    expect(shoppingListService["setShoppingListItemClassification"]).toHaveBeenCalledWith(1, { health: "MEDIUM" });
    expect((store.selectSnapshot(ShoppingListState.activeItems)[0] as any).health).toBe("MEDIUM");
  });

  it("shows a trimmed item at once, queues its add and clears the bar", async () => {
    await setCanUpdate(true);

    component.addForm.patchValue({ name: "  Bread ", amount: "1,5", unit: "kg", note: "" });
    component.addItem();

    const active = store.selectSnapshot(ShoppingListState.activeItems);
    expect(active.map((i) => i.name)).toEqual(["Milk", "Bread"]);
    const bread = active[1];
    // A row of this device only: a negative id, and the client id the server will know the add by.
    expect(bread.id).toBeLessThan(0);
    expect(bread.clientId).toBeTruthy();
    expect(bread).toEqual(expect.objectContaining({ amount: "1.5", unit: "kg", isChecked: false, shoppingListId: 1 }));

    expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([
      expect.objectContaining({
        kind: "add",
        groupId: 1,
        listId: 1,
        clientId: bread.clientId,
        command: { name: "Bread", amount: "1.5", unit: "kg", quantity: "", note: "" },
      }),
    ]);
    expect(shoppingListService.addShoppingListItem).not.toHaveBeenCalled();
    expect(component.addForm.value.name).toBe("");
  });

  it("crosses off an item that has not reached the server by its client id", async () => {
    await setCanUpdate(true);
    component.addForm.patchValue({ name: "Bread" });
    component.addItem();
    const bread = store.selectSnapshot(ShoppingListState.activeItems)[1];

    component.toggleItem(bread);

    expect(store.selectSnapshot(ShoppingListState.checkedItems).map((i) => i.name)).toEqual(["Bread"]);
    expect(store.selectSnapshot(ShoppingListState.pending)[1]).toEqual(
      expect.objectContaining({ kind: "toggle", itemId: bread.id, clientId: bread.clientId, isChecked: true })
    );
  });

  it("takes back an item that has not reached the server without calling it", async () => {
    await setCanUpdate(true);
    component.addForm.patchValue({ name: "Bread" });
    component.addItem();
    const bread = store.selectSnapshot(ShoppingListState.activeItems)[1];
    component.toggleItem(bread);

    const dialog = TestBed.inject(AppDialog);
    vi.spyOn(dialog, "open").mockReturnValue({ componentInstance: {}, afterClosed: () => of(true) } as never);
    component.deleteItem({ ...bread, isChecked: true });

    expect(store.selectSnapshot(ShoppingListState.pending)).toEqual([]);
    expect(store.selectSnapshot(ShoppingListState.lists)[0].items.map((i) => i.name)).toEqual(["Milk"]);
  });

  it("does not send a blank item", async () => {
    await setCanUpdate(true);
    component.addForm.patchValue({ name: "   " });
    component.addItem();

    // ...and tells the person why: the add box shakes and is outlined in red.
    expect(fixture.nativeElement.querySelector(".add-name").classList).toContain("cv-shake");
    expect(fixture.nativeElement.querySelector(".add-name").classList).toContain("cv-field-error");
    expect(shoppingListService.addShoppingListItem).not.toHaveBeenCalled();
  });

  it("hides the add bar from a member who cannot update", async () => {
    await setCanUpdate(false);
    expect(fixture.nativeElement.querySelector(".add-bar")).toBeNull();

    await setCanUpdate(true);
    expect(fixture.nativeElement.querySelector(".add-bar")).not.toBeNull();
  });

  describe("suggestions from earlier items", () => {
    it("fills the amount and unit of a picked suggestion, but never over one the user typed", () => {
      component.nameControl.setValue("Oat milk");
      component.suggestionPicked({ name: "Oat milk", amount: "2", unit: "l" });
      expect(component.addForm.value).toEqual(expect.objectContaining({ amount: "2", unit: "l" }));

      component.addForm.patchValue({ amount: "5", unit: "pack" });
      component.suggestionPicked({ name: "Oat milk", amount: "2", unit: "l" });
      expect(component.addForm.value).toEqual(expect.objectContaining({ amount: "5", unit: "pack" }));
    });

    it("leaves the amount alone for a suggestion that had none", () => {
      component.suggestionPicked({ name: "Salt" });
      expect(component.addForm.value.amount).toBe("");
    });

    it("offers names from other lists but not what is already open on this one", () => {
      expect(component.suggestions().map((suggestion) => suggestion.name)).not.toContain("Milk");
    });
  });
});
