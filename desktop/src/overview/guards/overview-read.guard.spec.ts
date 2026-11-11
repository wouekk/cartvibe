import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from "@angular/router";
import { Permission } from "../../open-api";
import { AuthStore } from "../../store/auth.store";
import { overviewReadGuard } from "./overview-read.guard";

describe("overviewReadGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => overviewReadGuard(...params));

  const route = { params: { groupId: "1" } } as unknown as ActivatedRouteSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it("allows a member who can read the group's receipts", () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: [Permission.GroupReceiptsRead] });

    expect(executeGuard(route, {} as any)).toBe(true);
  });

  it("sends anyone else to the group's receipts", () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: [Permission.GroupActivitiesRead] });

    const result = executeGuard(route, {} as any) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe("/receipts/group/1");
  });
});
