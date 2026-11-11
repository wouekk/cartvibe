import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";

import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ViewportService } from "../../services/viewport.service";
import { ShoppingListSyncService } from "../../services/shopping-list-sync.service";
import { AuthState } from "../../store/auth.state";
import { ShoppingListStore } from "../../store/shopping-list.store";
import { ShoppingListComponent } from "./shopping-list.component";
import { seedStore } from "../../testing/seed-store";

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
  let shoppingListService: Record<"getShoppingListsForGroup" | "setShoppingListItemChecked" | "addShoppingListItem" | "setShoppingListItemClassification" | "clearCheckedShoppingListItems", Mock>;
  let snackbarService: { error: Mock };
  let drained: Mock;
  const isHandset = signal(false);

  beforeEach(async () => {
    isHandset.set(false);
    shoppingListService = {
      getShoppingListsForGroup: vi.fn().mockReturnValue(of([supermarket])),
      setShoppingListItemChecked: vi.fn(),
      addShoppingListItem: vi.fn(),
      setShoppingListItemClassification: vi.fn(),
      clearCheckedShoppingListItems: vi.fn().mockReturnValue(of(undefined)),
    };
    snackbarService = { error: vi.fn() };
    drained = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
    imports: [
        NgxsModule.forRoot([AuthState]),
        ReactiveFormsModule,
        ShoppingListComponent,
    ],
    providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShoppingListService, useValue: shoppingListService },
        { provide: SnackbarService, useValue: snackbarService },
        // Sending the queue has its own spec; here it only answers whether the queue went out.
        { provide: ShoppingListSyncService, useValue: { drained } },
        { provide: ViewportService, useValue: { isHandset } },
    ],
    schemas: [NO_ERRORS_SCHEMA],
}).compileComponents();

    store = TestBed.inject(Store);
    TestBed.inject(ShoppingListStore).load(1);

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

    expect(TestBed.inject(ShoppingListStore).checkedItems().map((i) => i.id)).toEqual([1]);
    expect(TestBed.inject(ShoppingListStore).pending()).toEqual([
      expect.objectContaining({ kind: "toggle", groupId: 1, listId: 1, itemId: 1, isChecked: true }),
    ]);
    expect(TestBed.inject(ShoppingListStore).pendingItemIds().has(1)).toBe(true);
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

    const pending = TestBed.inject(ShoppingListStore).pending();
    expect(pending.map((change) => (change.kind === "toggle" ? [change.itemId, change.isChecked] : null))).toEqual([
      [9, true],
      [1, false],
    ]);
    expect(TestBed.inject(ShoppingListStore).activeItems().map((i) => i.id)).toEqual([1]);
  });

  it("sends a tag correction and applies the corrected item", async () => {
    shoppingListService["setShoppingListItemClassification"].mockReturnValue(
      of({ ...milk, health: "MEDIUM", classificationOverridden: true })
    );

    component.correctTags({ item: milk, health: "MEDIUM" });

    expect(shoppingListService["setShoppingListItemClassification"]).toHaveBeenCalledWith(1, { health: "MEDIUM" });
    expect((TestBed.inject(ShoppingListStore).activeItems()[0] as any).health).toBe("MEDIUM");
  });

  it("shows a trimmed item at once, queues its add and clears the bar", async () => {
    await setCanUpdate(true);

    component.addForm.patchValue({ name: "  Bread ", amount: "1,5", unit: "kg", note: "" });
    component.addItem();

    const active = TestBed.inject(ShoppingListStore).activeItems();
    expect(active.map((i) => i.name)).toEqual(["Milk", "Bread"]);
    const bread = active[1];
    // A row of this device only: a negative id, and the client id the server will know the add by.
    expect(bread.id).toBeLessThan(0);
    expect(bread.clientId).toBeTruthy();
    expect(bread).toEqual(expect.objectContaining({ amount: "1.5", unit: "kg", isChecked: false, shoppingListId: 1 }));

    expect(TestBed.inject(ShoppingListStore).pending()).toEqual([
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
    const bread = TestBed.inject(ShoppingListStore).activeItems()[1];

    component.toggleItem(bread);

    expect(TestBed.inject(ShoppingListStore).checkedItems().map((i) => i.name)).toEqual(["Bread"]);
    expect(TestBed.inject(ShoppingListStore).pending()[1]).toEqual(
      expect.objectContaining({ kind: "toggle", itemId: bread.id, clientId: bread.clientId, isChecked: true })
    );
  });

  describe("clearing what is crossed off", () => {
    const confirmClear = () => {
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({ componentInstance: {}, afterClosed: () => of(true) } as never);
      component.clearCrossedOff();
    };

    const settled = () => new Promise<void>((resolve) => setTimeout(resolve));

    it("clears at once when nothing of this device's is waiting", async () => {
      await setCanUpdate(true);
      seedStore(TestBed.inject(ShoppingListStore), { ...store.snapshot().shoppingLists, lists: [{ ...supermarket, items: [{ ...milk, isChecked: true }] }] });

      confirmClear();

      expect(drained).not.toHaveBeenCalled();
      expect(shoppingListService.clearCheckedShoppingListItems).toHaveBeenCalledWith(1);
      expect(TestBed.inject(ShoppingListStore).lists()[0].items).toEqual([]);
    });

    // The server clears what it has as crossed off: a cross-off still waiting here must reach it first, or the row
    // would vanish on this device and come back crossed off.
    it("sends the waiting cross-offs first", async () => {
      await setCanUpdate(true);
      component.toggleItem(milk);

      confirmClear();
      expect(shoppingListService.clearCheckedShoppingListItems).not.toHaveBeenCalled();
      await settled();

      expect(drained).toHaveBeenCalledTimes(1);
      expect(shoppingListService.clearCheckedShoppingListItems).toHaveBeenCalledWith(1);
    });

    it("clears nothing, and says why, when the waiting changes cannot be sent", async () => {
      await setCanUpdate(true);
      drained.mockResolvedValue(false);
      component.toggleItem(milk);

      confirmClear();
      await settled();

      expect(shoppingListService.clearCheckedShoppingListItems).not.toHaveBeenCalled();
      expect(snackbarService.error).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(ShoppingListStore).checkedItems().map((i) => i.id)).toEqual([1]);
    });
  });

  it("takes back an item that has not reached the server without calling it", async () => {
    await setCanUpdate(true);
    component.addForm.patchValue({ name: "Bread" });
    component.addItem();
    const bread = TestBed.inject(ShoppingListStore).activeItems()[1];
    component.toggleItem(bread);

    const dialog = TestBed.inject(AppDialog);
    vi.spyOn(dialog, "open").mockReturnValue({ componentInstance: {}, afterClosed: () => of(true) } as never);
    component.deleteItem({ ...bread, isChecked: true });

    expect(TestBed.inject(ShoppingListStore).pending()).toEqual([]);
    expect(TestBed.inject(ShoppingListStore).lists()[0].items.map((i) => i.name)).toEqual(["Milk"]);
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

  describe("the add bar on a phone", () => {
    const bar = (): HTMLElement => fixture.nativeElement.querySelector("[data-testid=shopping-list-add-bar]");
    const amountShown = (): boolean => !!fixture.nativeElement.querySelector("app-shopping-list-amount-fields");
    const focusLeaves = (to: EventTarget | null) =>
      bar().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));

    it("is one row until it is used, and always shows the amount on a wider screen", async () => {
      await setCanUpdate(true);
      expect(amountShown()).toBe(true);

      isHandset.set(true);
      await fixture.whenStable();
      expect(amountShown()).toBe(false);
      expect(bar().getAttribute("data-expanded")).toBe("false");

      bar().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await fixture.whenStable();
      expect(amountShown()).toBe(true);
      expect(bar().getAttribute("data-expanded")).toBe("true");
    });

    it("folds back when the focus leaves it empty, and not while something typed would be hidden", async () => {
      isHandset.set(true);
      await setCanUpdate(true);
      component.addInUse.set(true);
      component.addForm.patchValue({ name: "Milk" });

      focusLeaves(null);
      await fixture.whenStable();
      expect(amountShown()).toBe(true);

      component.addForm.patchValue({ name: "", amount: "2" });
      focusLeaves(null);
      await fixture.whenStable();
      expect(amountShown()).toBe(true);

      component.addForm.patchValue({ name: " ", amount: "" });
      focusLeaves(null);
      await fixture.whenStable();
      expect(amountShown()).toBe(false);
    });

    it("stays open while the focus moves to another of its fields or to the unit's menu", async () => {
      isHandset.set(true);
      await setCanUpdate(true);
      component.addInUse.set(true);
      const overlay = document.createElement("div");
      overlay.className = "cdk-overlay-container";
      const option = document.createElement("button");
      overlay.append(option);
      document.body.append(overlay);

      try {
        focusLeaves(bar().querySelector("button"));
        focusLeaves(option);
        await fixture.whenStable();

        expect(amountShown()).toBe(true);
      } finally {
        overlay.remove();
      }
    });
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

  describe("Shop mode: what is left to buy, in the order the household usually shops", () => {
    const lastWeek = Date.parse("2026-11-04T10:00:00Z");
    const crossedOff = (id: number, name: string, minute: number): ShoppingListItem =>
      ({ ...milk, id, shoppingListId: 2, name, isChecked: true, checkedAt: new Date(lastWeek + minute * 60_000).toISOString() }) as ShoppingListItem;
    const toBuy = (id: number, name: string, second: number): ShoppingListItem =>
      ({ ...milk, id, name, createdAt: `2026-11-11T08:00:${String(second).padStart(2, "0")}Z` }) as ShoppingListItem;

    // Last week's trip went apples, milk, bread. Today's list was typed in another order, with something new.
    const lastTrip: ShoppingList = {
      id: 2,
      groupId: 1,
      name: "Last week",
      items: [crossedOff(21, "Bread", 30), crossedOff(22, "apples", 2), crossedOff(23, "Milk", 15)],
    };
    const today: ShoppingList = {
      id: 1,
      groupId: 1,
      name: "Supermarket",
      items: [toBuy(11, "Bread", 1), toBuy(12, "Candles", 2), toBuy(13, "Milk", 3), toBuy(14, "Apples", 4)],
    };

    const show = async (lists: ShoppingList[], shopMode: boolean) => {
      seedStore(TestBed.inject(ShoppingListStore), { ...store.snapshot().shoppingLists, groupId: 1, selectedListId: 1, lists });
      fixture.componentRef.setInput("list", lists.find((list) => list.id === 1));
      fixture.componentRef.setInput("large", shopMode);
      await fixture.whenStable();
    };
    const shown = () => component.shownItems().map((item) => item.name);
    const caption = (): HTMLElement | null => fixture.nativeElement.querySelector('[data-testid="shopping-list-usual-order"]');

    it("keeps the order things were added in outside Shop mode, and says nothing", async () => {
      await show([today, lastTrip], false);

      expect(shown()).toEqual(["Bread", "Candles", "Milk", "Apples"]);
      expect(caption()).toBeNull();
    });

    it("sorts by where things were crossed off before, puts what is new last, and says so", async () => {
      await show([today, lastTrip], true);

      expect(shown()).toEqual(["Apples", "Milk", "Bread", "Candles"]);
      expect(caption()?.textContent).toContain("In the order you usually pick things up.");
    });

    it("says nothing when there is no earlier trip to learn from", async () => {
      await show([today], true);

      expect(shown()).toEqual(["Bread", "Candles", "Milk", "Apples"]);
      expect(caption()).toBeNull();
    });

    it("does not reshuffle what is left as things are crossed off on this trip", async () => {
      await show([today, lastTrip], true);
      const now = new Date().toISOString();

      // Bread first, then milk: not the usual order, and it must not become it mid-trip.
      const during: ShoppingList = {
        ...today,
        items: today.items.map((item) => (item.name === "Bread" || item.name === "Milk" ? { ...item, isChecked: true, checkedAt: now } : item)),
      };
      seedStore(TestBed.inject(ShoppingListStore), { ...store.snapshot().shoppingLists, lists: [during, lastTrip] });
      await fixture.whenStable();

      expect(shown()).toEqual(["Apples", "Candles"]);
    });

    it("goes back to the order things were added in when Shop mode is left", async () => {
      await show([today, lastTrip], true);
      fixture.componentRef.setInput("large", false);
      await fixture.whenStable();

      expect(shown()).toEqual(["Bread", "Candles", "Milk", "Apples"]);
      expect(caption()).toBeNull();
    });
  });
});
