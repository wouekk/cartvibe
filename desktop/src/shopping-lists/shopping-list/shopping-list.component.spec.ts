import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { MatDialogModule } from "@angular/material/dialog";
import { NgxsModule, Store } from "@ngxs/store";
import { Subject, of } from "rxjs";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { ShoppingListComponent } from "./shopping-list.component";

const milk: ShoppingListItem = {
  id: 1,
  shoppingListId: 1,
  name: "Milk",
  unit: "",
  quantity: "",
  note: "",
  isChecked: false,
};

const supermarket: ShoppingList = { id: 1, groupId: 1, name: "Supermarket", items: [milk] };

describe("ShoppingListComponent", () => {
  let fixture: ComponentFixture<ShoppingListComponent>;
  let component: ShoppingListComponent;
  let store: Store;
  let shoppingListService: { [method: string]: jest.Mock };
  let snackbarService: { error: jest.Mock };

  beforeEach(async () => {
    shoppingListService = {
      getShoppingListsForGroup: jest.fn().mockReturnValue(of([supermarket])),
      setShoppingListItemChecked: jest.fn(),
      addShoppingListItem: jest.fn(),
    };
    snackbarService = { error: jest.fn() };

    await TestBed.configureTestingModule({
      declarations: [ShoppingListComponent],
      imports: [
        NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]),
        MatDialogModule,
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

  it("crosses an item off immediately, before the server answers", async () => {
    await setCanUpdate(true);
    const response = new Subject<ShoppingListItem>();
    shoppingListService.setShoppingListItemChecked.mockReturnValue(response);

    component.toggleItem(milk);

    expect(store.selectSnapshot(ShoppingListState.checkedItems).map((i) => i.id)).toEqual([1]);
    expect(shoppingListService.setShoppingListItemChecked).toHaveBeenCalledWith(1, { isChecked: true });

    response.next({ ...milk, isChecked: true, checkedAt: "2026-10-19T12:00:00Z", checkedByUserId: 1 });
    expect(store.selectSnapshot(ShoppingListState.checkedItems)[0].checkedByUserId).toBe(1);
  });

  it("reverts the toggle and explains when the phone is offline", async () => {
    await setCanUpdate(true);
    const response = new Subject<ShoppingListItem>();
    shoppingListService.setShoppingListItemChecked.mockReturnValue(response);

    component.toggleItem(milk);
    response.error(new HttpErrorResponse({ status: 0 }));

    expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([1]);
    expect(snackbarService.error).toHaveBeenCalled();
  });

  it("reverts a refused toggle without a second toast (the interceptor already shows one)", async () => {
    await setCanUpdate(true);
    const response = new Subject<ShoppingListItem>();
    shoppingListService.setShoppingListItemChecked.mockReturnValue(response);

    component.toggleItem(milk);
    response.error(new HttpErrorResponse({ status: 403 }));

    expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.id)).toEqual([1]);
    expect(snackbarService.error).not.toHaveBeenCalled();
  });

  it("adds a trimmed item and clears the bar", async () => {
    await setCanUpdate(true);
    const bread: ShoppingListItem = { ...milk, id: 2, name: "Bread" };
    shoppingListService.addShoppingListItem.mockReturnValue(of(bread));

    component.addForm.patchValue({ name: "  Bread ", amount: "1,5", unit: "kg", note: "" });
    component.addItem();

    expect(shoppingListService.addShoppingListItem).toHaveBeenCalledWith(1, {
      name: "Bread",
      amount: "1.5",
      unit: "kg",
      quantity: "",
      note: "",
    });
    expect(store.selectSnapshot(ShoppingListState.activeItems).map((i) => i.name)).toEqual(["Milk", "Bread"]);
    expect(component.addForm.value.name).toBe("");
  });

  it("does not send a blank item", async () => {
    await setCanUpdate(true);
    component.addForm.patchValue({ name: "   " });
    component.addItem();

    expect(shoppingListService.addShoppingListItem).not.toHaveBeenCalled();
  });

  it("hides the add bar from a member who cannot update", async () => {
    await setCanUpdate(false);
    expect(fixture.nativeElement.querySelector(".add-bar")).toBeNull();

    await setCanUpdate(true);
    expect(fixture.nativeElement.querySelector(".add-bar")).not.toBeNull();
  });
});
