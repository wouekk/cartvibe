import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { Group, Permission } from "../../open-api";
import { AuthStore } from "../../store/auth.store";
import { GroupStore } from "../../store/group.store";
import { shoppingListGroupGuard } from "./shopping-list-group.guard";

const group = (id: number, isAllGroup = false): Group => ({ id, name: `group-${id}`, isAllGroup }) as Group;

describe("shoppingListGroupGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => shoppingListGroupGuard(...params));
  let store: Store;
  let router: Router;

  const routeFor = (groupId?: string, queryParams: Record<string, string> = {}) =>
    ({ params: groupId === undefined ? {} : { groupId }, queryParams }) as unknown as ActivatedRouteSnapshot;

  const redirectOf = (result: ReturnType<CanActivateFn>) => router.serializeUrl(result as UrlTree);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });

    store = TestBed.inject(Store);
    router = TestBed.inject(Router);
    TestBed.inject(GroupStore).setGroups([group(10, true), group(1), group(2)]);
    TestBed.inject(GroupStore).setSelectedGroupId("1");
  });

  it("allows a real group whose lists the user can read", () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: [Permission.GroupShoppingListsRead] });

    expect(executeGuard(routeFor("1"), {} as any)).toBe(true);
  });

  it("redirects the All group to a readable real group", () => {
    TestBed.inject(AuthStore).setPermissions([], { 10: [Permission.GroupShoppingListsRead], 2: [Permission.GroupShoppingListsRead] });

    expect(redirectOf(executeGuard(routeFor("10"), {} as any))).toBe("/shopping-lists/group/2");
  });

  it("redirects a group the user cannot read, and a missing group id", () => {
    TestBed.inject(AuthStore).setPermissions([], { 2: [Permission.GroupShoppingListsRead] });

    expect(redirectOf(executeGuard(routeFor("1"), {} as any))).toBe("/shopping-lists/group/2");
    expect(redirectOf(executeGuard(routeFor(), {} as any))).toBe("/shopping-lists/group/2");
  });

  it("keeps the query string when it redirects, so a shared recipe survives the hop to a group", () => {
    TestBed.inject(AuthStore).setPermissions([], { 2: [Permission.GroupShoppingListsRead] });

    const shared = { recipeUrl: "https://example.com/pancakes?id=3", recipeText: "Pancakes https://example.com/pancakes" };
    const url = redirectOf(executeGuard(routeFor(undefined, shared), {} as any)) as string;
    const parsed = router.parseUrl(url);

    expect(parsed.root.children["primary"].segments.map((segment) => segment.path)).toEqual([
      "shopping-lists",
      "group",
      "2",
    ]);
    expect(parsed.queryParams).toEqual(shared);
  });

  it("sends a user who can read no group's lists to the receipt list", () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: [Permission.GroupReceiptsRead] });

    expect(redirectOf(executeGuard(routeFor("1"), {} as any))).toBe("/receipts/group/1");
  });
});
