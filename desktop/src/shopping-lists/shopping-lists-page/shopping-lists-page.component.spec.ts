import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission, ShoppingList, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { ShoppingListsPageComponent } from "./shopping-lists-page.component";

const list = (id: number, name: string): ShoppingList => ({ id, groupId: 1, name, items: [] });

describe("ShoppingListsPageComponent: choosing lists to delete", () => {
  let fixture: ComponentFixture<ShoppingListsPageComponent>;
  let component: ShoppingListsPageComponent;
  let store: Store;
  let shoppingListService: { [method: string]: jest.Mock };
  let snackbarService: { error: jest.Mock; success: jest.Mock; hint: jest.Mock };
  let confirmed: boolean | undefined;

  beforeEach(async () => {
    confirmed = true;
    shoppingListService = {
      getShoppingListsForGroup: jest.fn().mockReturnValue(of([list(1, "Lidl"), list(2, "Aldi"), list(3, "Market")])),
      deleteShoppingList: jest.fn().mockReturnValue(of(undefined)),
    };
    snackbarService = { error: jest.fn(), success: jest.fn(), hint: jest.fn() };

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
      auth: { ...store.snapshot().auth, groupPermissions: { 1: [Permission.GroupShoppingListsDelete] } },
    });
    store.dispatch(new LoadShoppingLists(1));

    fixture = TestBed.createComponent(ShoppingListsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("offers Delete list only to someone who may delete lists", () => {
    expect(component.canDeleteLists()).toBe(true);

    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, groupPermissions: { 1: [] } } });

    expect(component.canDeleteLists()).toBe(false);
  });

  it("ticks lists instead of opening them while choosing, and unticks on a second click", () => {
    component.startSelecting();

    component.pick(1);
    component.pick(2);
    component.pick(1);

    expect([...component.selectedIds()]).toEqual([2]);
    expect(component.selectedCount()).toBe(1);
  });

  it("opens the list on a click when not choosing", () => {
    const open = jest.spyOn(component, "selectList");

    component.pick(2);

    expect(open).toHaveBeenCalledWith("2");
    expect(component.selectedCount()).toBe(0);
  });

  it("deletes every ticked list after confirming and leaves choosing mode", async () => {
    component.startSelecting();
    component.pick(1);
    component.pick(3);

    component.deleteSelected();
    await fixture.whenStable();

    expect(shoppingListService.deleteShoppingList.mock.calls.map((call) => call[0])).toEqual([1, 3]);
    expect(component.lists().map((l) => l.id)).toEqual([2]);
    expect(component.selecting()).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    confirmed = undefined;
    component.startSelecting();
    component.pick(1);

    component.deleteSelected();
    await fixture.whenStable();

    expect(shoppingListService.deleteShoppingList).not.toHaveBeenCalled();
    expect(component.selecting()).toBe(true);
  });

  it("keeps the lists the server refused ticked and says so", async () => {
    shoppingListService.deleteShoppingList.mockImplementation((id: number) =>
      id === 2 ? throwError(() => new Error("forbidden")) : of(undefined)
    );
    component.startSelecting();
    component.pick(1);
    component.pick(2);

    component.deleteSelected();
    await fixture.whenStable();

    expect(component.lists().map((l) => l.id)).toEqual([2, 3]);
    expect([...component.selectedIds()]).toEqual([2]);
    expect(component.selecting()).toBe(true);
    expect(snackbarService.error).toHaveBeenCalledWith("Some lists could not be deleted.");
  });

  it("cancel leaves choosing mode and forgets the ticks", () => {
    component.startSelecting();
    component.pick(1);

    component.cancelSelecting();

    expect(component.selecting()).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });
});
