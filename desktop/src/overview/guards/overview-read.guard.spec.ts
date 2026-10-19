import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { Permission } from "../../open-api";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { overviewReadGuard } from "./overview-read.guard";

describe("overviewReadGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => overviewReadGuard(...params));
  let store: Store;

  const route = { params: { groupId: "1" } } as unknown as ActivatedRouteSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection()],
    });
    store = TestBed.inject(Store);
  });

  it("allows a member who can read the group's receipts", () => {
    store.dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead] }));

    expect(executeGuard(route, {} as any)).toBe(true);
  });

  it("sends anyone else to the group's dashboards", () => {
    store.dispatch(new SetPermissions([], { 1: [Permission.GroupDashboardsRead] }));

    const result = executeGuard(route, {} as any) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe("/dashboard/group/1");
  });
});
