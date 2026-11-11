import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { ShoppingListItem, User } from "../../open-api";
import { UserStore } from "../../store/user.store";
import { ShoppingListsModule } from "../shopping-lists.module";
import { ShoppingListItemClassification, ShoppingListItemComponent } from "./shopping-list-item.component";

const milk = {
  id: 4,
  shoppingListId: 1,
  name: "Milk",
  amount: "1.5",
  unit: "l",
  quantity: "",
  note: "the green one",
  isChecked: false,
  health: "HEALTHY",
  seasonality: "",
} as unknown as ShoppingListItem;

describe("ShoppingListItemComponent", () => {
  let fixture: ComponentFixture<ShoppingListItemComponent>;

  const el = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  // The menu opens in an overlay, outside the component's own element.
  const menuItem = (testId: string): HTMLElement | null => document.querySelector(`[data-testid="${testId}"]`);

  const render = async (item: ShoppingListItem, canUpdate: boolean) => {
    fixture.componentRef.setInput("item", item);
    fixture.componentRef.setInput("canUpdate", canUpdate);
    await fixture.whenStable();
  };

  const openMenu = async () => {
    el("shopping-list-item-menu")!.click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListsModule, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListItemComponent);
  });

  afterEach(() => {
    fixture.destroy();
    document.querySelectorAll(".cdk-overlay-container").forEach((container) => (container.innerHTML = ""));
  });

  it("shows the name, the note, the amount with its unit and the health tag", async () => {
    await render(milk, true);

    expect(el("shopping-list-item-name")?.textContent?.trim()).toBe("Milk");
    expect(fixture.nativeElement.textContent).toContain("the green one");
    expect(el("shopping-list-item-amount")?.textContent?.trim()).toBe("1.5 L");
    expect(el("food-tag-healthy")).not.toBeNull();
  });

  it("shows no amount badge for an item without one", async () => {
    await render({ ...milk, amount: undefined, unit: "" } as ShoppingListItem, true);

    expect(el("shopping-list-item-amount")).toBeNull();
  });

  it("is a larger row in Shop mode", async () => {
    await render(milk, true);
    expect(fixture.nativeElement.querySelector("[data-size=large]")).toBeNull();

    fixture.componentRef.setInput("large", true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-size=large]")).not.toBeNull();
  });

  it("is a checkbox whose state follows the item, and a tap emits the item", async () => {
    await render(milk, true);
    const toggled: ShoppingListItem[] = [];
    fixture.componentInstance.toggled.subscribe((item) => toggled.push(item));

    const toggle = el("shopping-list-item-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("role")).toBe("checkbox");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();
    expect(toggled).toEqual([milk]);

    await render({ ...milk, isChecked: true }, true);
    expect(el("shopping-list-item-toggle")?.getAttribute("aria-checked")).toBe("true");
  });

  it("cannot be crossed off or edited without permission", async () => {
    await render(milk, false);
    const toggled: ShoppingListItem[] = [];
    fixture.componentInstance.toggled.subscribe((item) => toggled.push(item));

    const toggle = el("shopping-list-item-toggle") as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    toggle.click();
    expect(toggled).toEqual([]);
    expect(el("shopping-list-item-menu")).toBeNull();
  });

  it("emits edit and delete from its menu", async () => {
    await render(milk, true);
    const edits: ShoppingListItem[] = [];
    const deletes: ShoppingListItem[] = [];
    fixture.componentInstance.editClicked.subscribe((item) => edits.push(item));
    fixture.componentInstance.deleteClicked.subscribe((item) => deletes.push(item));

    expect(el("shopping-list-item-menu")?.getAttribute("aria-label")).toBe("Item actions");
    await openMenu();
    menuItem("shopping-list-item-edit")!.click();
    expect(edits).toEqual([milk]);

    await openMenu();
    menuItem("shopping-list-item-delete")!.click();
    expect(deletes).toEqual([milk]);
  });

  it("offers seasonality only for produce the AI tagged, and a correction keeps the health", () => {
    fixture.componentRef.setInput("item", { ...milk, seasonality: "SEASONAL" });
    expect(fixture.componentInstance.canCorrectSeasonality()).toBe(true);

    fixture.componentRef.setInput("item", { ...milk, seasonality: "NOT_PRODUCE" });
    expect(fixture.componentInstance.canCorrectSeasonality()).toBe(false);

    fixture.componentRef.setInput("item", { ...milk, seasonality: "OUT_OF_SEASON", health: "UNKNOWN" });
    expect(fixture.componentInstance.canCorrectSeasonality()).toBe(false);
  });

  it("emits a health correction from the tags submenu", async () => {
    await render({ ...milk, seasonality: "SEASONAL" }, true);
    const corrections: ShoppingListItemClassification[] = [];
    fixture.componentInstance.classificationSelected.subscribe((value) => corrections.push(value));

    await openMenu();
    menuItem("shopping-list-item-tags")!.click();
    await fixture.whenStable();
    expect(menuItem("shopping-list-item-season-OUT_OF_SEASON")).not.toBeNull();
    menuItem("shopping-list-item-health-UNHEALTHY")!.click();

    expect(corrections).toEqual([{ item: { ...milk, seasonality: "SEASONAL" }, health: "UNHEALTHY" }]);
  });

  describe("a change that waits for the connection", () => {
    it("carries no mark by default", async () => {
      await render(milk, true);
      expect(el("shopping-list-item-pending")).toBeNull();
    });

    it("is marked as not sent yet, in words a screen reader gets too", async () => {
      fixture.componentRef.setInput("pending", true);
      await render(milk, true);

      expect(el("shopping-list-item-pending")?.textContent?.trim()).toBe("Not sent yet");
    });

    it("can be crossed off and deleted but not edited while the server has not seen the row", async () => {
      await render({ ...milk, id: -1700000000000001, clientId: "a" } as ShoppingListItem, true);
      expect((el("shopping-list-item-toggle") as HTMLButtonElement).disabled).toBe(false);

      await openMenu();

      expect(menuItem("shopping-list-item-edit")).toBeNull();
      expect(menuItem("shopping-list-item-tags")).toBeNull();
      expect(menuItem("shopping-list-item-delete")).not.toBeNull();
    });
  });
});

describe("ShoppingListItemComponent: who crossed it off", () => {
  let fixture: ComponentFixture<ShoppingListItemComponent>;

  const el = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const render = async (item: ShoppingListItem) => {
    fixture.componentRef.setInput("item", item);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListsModule, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(UserStore).setUsers([{ id: 7, displayName: "Ola", username: "ola" } as User]);
    fixture = TestBed.createComponent(ShoppingListItemComponent);
  });

  afterEach(() => fixture.destroy());

  it("shows that person's avatar on a crossed-off row", async () => {
    await render({ ...milk, isChecked: true, checkedByUserId: 7 } as ShoppingListItem);

    expect(el("shopping-list-item-checked-by")?.textContent?.trim()).toBe("O");
  });

  it("shows none on a row still to buy, or when the person is no longer known", async () => {
    await render({ ...milk, isChecked: false, checkedByUserId: 7 } as ShoppingListItem);
    expect(el("shopping-list-item-checked-by")).toBeNull();

    await render({ ...milk, isChecked: true, checkedByUserId: 99 } as ShoppingListItem);
    expect(el("shopping-list-item-checked-by")).toBeNull();

    await render({ ...milk, isChecked: true } as ShoppingListItem);
    expect(el("shopping-list-item-checked-by")).toBeNull();
  });
});
