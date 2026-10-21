import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HlmButton } from "@spartan-ng/helm/button";

import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { provideRouter, RouterLink } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { Permission, ShoppingListService, ShoppingTripView } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { ShoppingListEventType, ShoppingListState } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ShoppingTripsComponent } from "./shopping-trips.component";

const LIST_PERMISSIONS = [Permission.GroupShoppingListsRead, Permission.GroupShoppingListsUpdate];

const doneTrip: ShoppingTripView = {
  id: 4,
  shoppingListId: 1,
  createdAt: "2026-10-20T10:00:00Z",
  status: "DONE",
  lastError: "",
  waitingForPhoto: false,
  receipt: { id: 9, name: "Supermarket", date: "2026-10-20T00:00:00Z", amount: "23.40" },
  plannedItemCount: 5,
  productCount: 7,
  unplannedAmount: "4.98",
  unplannedProducts: ["Crisps", "Chocolate"],
};

describe("ShoppingTripsComponent", () => {
  let fixture: ComponentFixture<ShoppingTripsComponent>;
  let shoppingListService: { [method: string]: jest.Mock };

  const element = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const render = async (permissions: string[]) => {
    TestBed.inject(Store).dispatch(new SetPermissions([], { 1: permissions }));
    fixture = TestBed.createComponent(ShoppingTripsComponent);
    fixture.componentRef.setInput("listId", 1);
    fixture.componentRef.setInput("groupId", 1);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    shoppingListService = {
      getShoppingTrips: jest.fn().mockReturnValue(of([doneTrip])),
      uploadShoppingTripPhoto: jest.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      declarations: [ShoppingTripsComponent],
      imports: [
        NgxsModule.forRoot([AuthState, ShoppingListState, SystemSettingsState]),
        HlmButton,
        AppIconComponent,
        PipesModule,
        RouterLink,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ShoppingListService, useValue: shoppingListService },
        { provide: SnackbarService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
  });

  it("shows what each trip bought that was not on the list", async () => {
    await render([...LIST_PERMISSIONS, Permission.GroupReceiptsRead]);

    expect(shoppingListService.getShoppingTrips).toHaveBeenCalledWith(1);
    const status = element("shopping-trip-status")?.textContent ?? "";
    expect(status).toContain("4.98");
    expect(status).toContain("not on the list: Crisps, Chocolate");
    expect(element("shopping-trip")?.textContent).toContain("Supermarket");
  });

  it("stays hidden, and asks for nothing, without receipt access", async () => {
    await render(LIST_PERMISSIONS);

    expect(element("shopping-trips")).toBeNull();
    expect(shoppingListService.getShoppingTrips).not.toHaveBeenCalled();
  });

  it("offers scanning only with Quick Scan", async () => {
    await render([...LIST_PERMISSIONS, Permission.GroupReceiptsRead]);
    expect(element("shopping-trip-scan")).toBeNull();
    expect(element("shopping-trip-attach")).not.toBeNull();

    await render([...LIST_PERMISSIONS, Permission.GroupReceiptsRead, Permission.GroupReceiptsQuickScan]);
    expect(element("shopping-trip-scan")).not.toBeNull();
  });

  it("uploads the chosen photo and refetches", async () => {
    await render([...LIST_PERMISSIONS, Permission.GroupReceiptsRead, Permission.GroupReceiptsQuickScan]);
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    const input = element("shopping-trip-photo-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });

    input.dispatchEvent(new Event("change"));
    await fixture.whenStable();

    expect(shoppingListService.uploadShoppingTripPhoto).toHaveBeenCalledWith(1, file);
    expect(shoppingListService.getShoppingTrips).toHaveBeenCalledTimes(2);
  });

  it("refetches when the stream says this list's trips changed, and only then", async () => {
    await render([...LIST_PERMISSIONS, Permission.GroupReceiptsRead]);
    const store = TestBed.inject(Store);

    store.dispatch(
      new ApplyShoppingListEvent({ type: ShoppingListEventType.TripsChanged, groupId: 1, shoppingListId: 2 })
    );
    expect(shoppingListService.getShoppingTrips).toHaveBeenCalledTimes(1);

    store.dispatch(
      new ApplyShoppingListEvent({ type: ShoppingListEventType.TripsChanged, groupId: 1, shoppingListId: 1 })
    );
    expect(shoppingListService.getShoppingTrips).toHaveBeenCalledTimes(2);
  });
});
