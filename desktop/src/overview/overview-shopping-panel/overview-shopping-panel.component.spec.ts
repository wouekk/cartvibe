import { HttpErrorResponse } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ShoppingListState } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import {
  MAX_UNDO_ROWS,
  OverviewShoppingPanelComponent,
  PANEL_ITEM_LIMIT,
  UNDO_WINDOW_MS,
} from "./overview-shopping-panel.component";

const item = (id: number, shoppingListId: number, name: string, isChecked = false): ShoppingListItem =>
  ({ id, shoppingListId, name, isChecked, createdAt: `2026-10-22T08:00:${String(id).padStart(2, "0")}Z` }) as unknown as ShoppingListItem;

const list = (id: number, name: string, items: ShoppingListItem[]): ShoppingList =>
  ({ id, name, items }) as unknown as ShoppingList;

describe("OverviewShoppingPanelComponent", () => {
  let fixture: ComponentFixture<OverviewShoppingPanelComponent>;
  let lists: ShoppingList[];
  let setChecked: jest.Mock;
  let snackbar: { error: jest.Mock };

  const el = (): HTMLElement => fixture.nativeElement;
  const rows = (): HTMLElement[] => Array.from(el().querySelectorAll("[data-testid=overview-shopping-item]"));
  const names = (): string[] => rows().map((row) => row.textContent?.trim() ?? "");
  const undoRows = (): HTMLElement[] => Array.from(el().querySelectorAll("[data-testid=overview-shopping-undo-row]"));

  const render = async (next: ShoppingList[]) => {
    lists = next;
    fixture.componentRef.setInput("lists", lists);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    setChecked = jest.fn((_id: number, body: { isChecked: boolean }) => {
      const found = lists.flatMap((l) => l.items).find((candidate) => candidate.id === _id)!;
      return of({ ...found, isChecked: body.isChecked });
    });
    snackbar = { error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [OverviewShoppingPanelComponent, NgxsModule.forRoot([ShoppingListState])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ShoppingListService, useValue: { setShoppingListItemChecked: setChecked } },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    // The page feeds the panel from the store; here a dispatched event stands in for that round trip.
    jest.spyOn(TestBed.inject(Store), "dispatch").mockImplementation((action: unknown) => {
      const event = (action as ApplyShoppingListEvent).event;
      const next = lists.map((l) =>
        l.id === event.shoppingListId
          ? { ...l, items: l.items.map((candidate) => (candidate.id === event.item!.id ? event.item! : candidate)) }
          : l
      );
      lists = next as ShoppingList[];
      fixture.componentRef.setInput("lists", lists);
      return of(undefined);
    });

    fixture = TestBed.createComponent(OverviewShoppingPanelComponent);
    fixture.componentRef.setInput("groupId", 1);
    fixture.componentRef.setInput("canUpdate", true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the list with the most items still to buy as a bulleted list", async () => {
    await render([
      list(1, "Small", [item(1, 1, "milk")]),
      list(2, "Weekly", [item(2, 2, "bread"), item(3, 2, "eggs"), item(4, 2, "tea", true)]),
    ]);

    expect(el().querySelector("[data-testid=overview-shopping-list-name]")?.textContent).toContain("Weekly");
    expect(el().querySelector("[data-testid=overview-shopping-list-count]")?.textContent).toContain("2");
    expect(names()).toEqual(["bread", "eggs"]);
  });

  it("caps the list and points at the rest", async () => {
    const many = Array.from({ length: PANEL_ITEM_LIMIT + 3 }, (_v, i) => item(i + 1, 1, `item ${i + 1}`));
    await render([list(1, "Big", many)]);

    expect(rows().length).toBe(PANEL_ITEM_LIMIT);
    expect(el().querySelector("[data-testid=overview-shopping-more]")?.textContent).toContain("3");
    expect(el().querySelector("[data-testid=overview-shopping-items]")?.hasAttribute("data-scrollable")).toBe(false);
  });

  it("with a mouse, lists every item in a box that scrolls", async () => {
    window.matchMedia = jest.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      fixture.destroy();
      fixture = TestBed.createComponent(OverviewShoppingPanelComponent);
      fixture.componentRef.setInput("groupId", 1);
      fixture.componentRef.setInput("canUpdate", true);
      await render([list(1, "Big", Array.from({ length: PANEL_ITEM_LIMIT + 3 }, (_v, i) => item(i + 1, 1, `item ${i + 1}`)))]);

      expect(rows().length).toBe(PANEL_ITEM_LIMIT + 3);
      expect(el().querySelector("[data-testid=overview-shopping-items]")?.hasAttribute("data-scrollable")).toBe(true);
      expect(el().querySelector("[data-testid=overview-shopping-more]")).toBeNull();
    } finally {
      delete (window as Partial<Window>).matchMedia;
    }
  });

  it("makes an item leave the list at once and offers Undo", async () => {
    await render([list(1, "Weekly", [item(1, 1, "milk"), item(2, 1, "bread")])]);

    rows()[0].click();
    await fixture.whenStable();

    expect(setChecked).toHaveBeenCalledWith(1, { isChecked: true });
    expect(names()).toEqual(["bread"]);
    expect(undoRows().length).toBe(1);
    expect(undoRows()[0].textContent).toContain("milk marked done");
  });

  it("puts the item back when Undo is pressed", async () => {
    await render([list(1, "Weekly", [item(1, 1, "milk"), item(2, 1, "bread")])]);

    rows()[0].click();
    await fixture.whenStable();
    (el().querySelector("[data-testid=overview-shopping-undo-button]") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(setChecked).toHaveBeenLastCalledWith(1, { isChecked: false });
    expect(names()).toEqual(["milk", "bread"]);
    expect(undoRows().length).toBe(0);
  });

  it("drops the Undo row after its window, leaving the item done", async () => {
    await render([list(1, "Weekly", [item(1, 1, "milk"), item(2, 1, "bread")])]);

    // Fake timers only around the click: the zoneless scheduler needs real ones for whenStable().
    jest.useFakeTimers();
    rows()[0].click();
    jest.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    jest.useRealTimers();
    await fixture.whenStable();

    expect(undoRows().length).toBe(0);
    expect(names()).toEqual(["bread"]);
  });

  it("keeps showing the same list while an Undo row is up, even if another becomes the largest", async () => {
    await render([
      list(1, "First", [item(1, 1, "a"), item(2, 1, "b")]),
      list(2, "Second", [item(3, 2, "c"), item(4, 2, "d")]),
    ]);

    rows()[0].click(); // First drops to 1 item, Second would now be the largest
    await fixture.whenStable();

    expect(el().querySelector("[data-testid=overview-shopping-list-name]")?.textContent).toContain("First");
  });

  it("limits the Undo rows and settles the oldest for good", async () => {
    const many = Array.from({ length: MAX_UNDO_ROWS + 1 }, (_v, i) => item(i + 1, 1, `item ${i + 1}`));
    await render([list(1, "Weekly", many)]);

    for (let i = 0; i <= MAX_UNDO_ROWS; i++) {
      rows()[0].click();
      await fixture.whenStable();
    }

    expect(undoRows().length).toBe(MAX_UNDO_ROWS);
  });

  it("puts the item back and says so when the server cannot be reached", async () => {
    setChecked.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await render([list(1, "Weekly", [item(1, 1, "milk")])]);

    rows()[0].click();
    await fixture.whenStable();

    expect(names()).toEqual(["milk"]);
    expect(undoRows().length).toBe(0);
    expect(snackbar.error).toHaveBeenCalled();
  });

  it("is read-only without the update permission", async () => {
    fixture.componentRef.setInput("canUpdate", false);
    await render([list(1, "Weekly", [item(1, 1, "milk")])]);

    expect((rows()[0] as HTMLButtonElement).disabled).toBe(true);
    rows()[0].click();
    expect(setChecked).not.toHaveBeenCalled();
  });

  it("says nothing is left when the last item is ticked, while its Undo row is up", async () => {
    await render([list(1, "Weekly", [item(1, 1, "milk")])]);

    rows()[0].click();
    await fixture.whenStable();

    expect(el().querySelector("[data-testid=overview-shopping-done]")).not.toBeNull();
    expect(undoRows().length).toBe(1);
  });

  it("shows an empty state when no list has anything left to buy", async () => {
    fixture.componentRef.setInput("canCreateList", true);
    await render([list(1, "Done", [item(1, 1, "milk", true)])]);

    expect(el().querySelector("[data-testid=overview-lists-empty]")).not.toBeNull();
    expect(el().querySelector("[data-testid=overview-empty-new-list]")).not.toBeNull();
  });
});
