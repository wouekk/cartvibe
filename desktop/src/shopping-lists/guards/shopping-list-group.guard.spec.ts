import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { Group, Permission } from "../../open-api";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { GroupState } from "../../store/group.state";
import { SetGroups, SetSelectedGroupId } from "../../store/group.state.actions";
import { ShoppingListState } from "../../store/shopping-list.state";
import { shoppingListGroupGuard } from "./shopping-list-group.guard";

const group = (id: number, isAllGroup = false): Group => ({ id, name: `group-${id}`, isAllGroup }) as Group;

describe("shoppingListGroupGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => shoppingListGroupGuard(...params));
  let store: Store;
  let router: Router;

  const routeFor = (groupId?: string) =>
    ({ params: groupId === undefined ? {} : { groupId } }) as unknown as ActivatedRouteSnapshot;

  const redirectOf = (result: ReturnType<CanActivateFn>) => router.serializeUrl(result as UrlTree);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState, GroupState, ShoppingListState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });

    store = TestBed.inject(Store);
    router = TestBed.inject(Router);
    store.dispatch(new SetGroups([group(10, true), group(1), group(2)]));
    store.dispatch(new SetSelectedGroupId("1"));
  });

  it("allows a real group whose lists the user can read", () => {
    store.dispatch(new SetPermissions([], { 1: [Permission.GroupShoppingListsRead] }));

    expect(executeGuard(routeFor("1"), {} as any)).toBe(true);
  });

  it("redirects the All group to a readable real group", () => {
    store.dispatch(
      new SetPermissions([], { 10: [Permission.GroupShoppingListsRead], 2: [Permission.GroupShoppingListsRead] })
    );

    expect(redirectOf(executeGuard(routeFor("10"), {} as any))).toBe("/shopping-lists/group/2");
  });

  it("redirects a group the user cannot read, and a missing group id", () => {
    store.dispatch(new SetPermissions([], { 2: [Permission.GroupShoppingListsRead] }));

    expect(redirectOf(executeGuard(routeFor("1"), {} as any))).toBe("/shopping-lists/group/2");
    expect(redirectOf(executeGuard(routeFor(), {} as any))).toBe("/shopping-lists/group/2");
  });

  it("sends a user who can read no group's lists to the receipt list", () => {
    store.dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead] }));

    expect(redirectOf(executeGuard(routeFor("1"), {} as any))).toBe("/receipts/group/1");
  });
});
