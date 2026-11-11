import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, CanActivateFn, Router } from "@angular/router";
import { AuthStore } from "../store/auth.store";
import { GroupStore } from "../store/group.store";
import { groupPermissionGuard } from "./group-permission.guard";

import type { MockInstance } from "vitest";
describe("groupPermissionGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => groupPermissionGuard(...params));
  let navigateSpy: MockInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    navigateSpy = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true);
  });

  it("allows when the user holds the group permission for the selected group", () => {
    TestBed.inject(GroupStore).setSelectedGroupId("1");
    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.view"] });

    const route = {
      data: { groupPermission: "group.view" },
    } as unknown as ActivatedRouteSnapshot;

    expect(executeGuard(route, {} as any)).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("denies and redirects when the user lacks the group permission", () => {
    TestBed.inject(GroupStore).setSelectedGroupId("1");
    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.receipts.read"] });

    const route = {
      data: { groupPermission: "group.view" },
    } as unknown as ActivatedRouteSnapshot;

    expect(executeGuard(route, {} as any)).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith([
      TestBed.inject(GroupStore).dashboardLink(),
    ]);
  });

  it("resolves the group id from the route param when useRouteGroupId is set", () => {
    TestBed.inject(GroupStore).setSelectedGroupId("99"); // selected group differs from route
    TestBed.inject(AuthStore).setPermissions([], { 5: ["group.view"] });

    const route = {
      data: { groupPermission: "group.view", useRouteGroupId: true },
      params: { id: "5" },
    } as unknown as ActivatedRouteSnapshot;

    expect(executeGuard(route, {} as any)).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("resolves the group id from the parent route param when not on the param itself", () => {
    TestBed.inject(AuthStore).setPermissions([], { 7: ["group.view"] });

    const route = {
      data: { groupPermission: "group.view", useRouteGroupId: true },
      params: {},
      parent: { params: { id: "7" } },
    } as unknown as ActivatedRouteSnapshot;

    expect(executeGuard(route, {} as any)).toBe(true);
  });

  describe("useAddTargetGroupId", () => {
    const route = {
      data: {
        groupPermission: "group.receipts.create",
        useAddTargetGroupId: true,
      },
    } as unknown as ActivatedRouteSnapshot;

    const groups = (...ids: number[]) =>
      [
        { id: 1, name: "All Groups", isAllGroup: true, groupMembers: [] },
        ...ids.map((id) => ({
          id,
          name: `Group ${id}`,
          isAllGroup: false,
          groupMembers: [],
        })),
      ] as any[];

    it("gates on the user's only group while they browse the All group", () => {
      // Login lands a single-group user on the All group, whose own membership
      // can lack create while their real group has it. Gating on the browsed
      // group would bounce them off /receipts/add entirely.
      TestBed.inject(GroupStore).setGroups(groups(7));
      TestBed.inject(GroupStore).setSelectedGroupId("1");
      TestBed.inject(AuthStore).setPermissions([], { 7: ["group.receipts.create"] });

      expect(executeGuard(route, {} as any)).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("falls back to the browsed group when there is no single add target", () => {
      // Multi-group user on the All group: unchanged from the plain behaviour.
      TestBed.inject(GroupStore).setGroups(groups(7, 8));
      TestBed.inject(GroupStore).setSelectedGroupId("1");
      TestBed.inject(AuthStore).setPermissions([], { 1: ["group.receipts.create"] });

      expect(executeGuard(route, {} as any)).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("still denies when the add target lacks the permission", () => {
      TestBed.inject(GroupStore).setGroups(groups(7));
      TestBed.inject(GroupStore).setSelectedGroupId("1");
      TestBed.inject(AuthStore).setPermissions([], { 1: ["group.receipts.create"] });

      expect(executeGuard(route, {} as any)).toBe(false);
      expect(navigateSpy).toHaveBeenCalled();
    });
  });

  it("allows a non-member who holds an orApp fallback permission", () => {
    TestBed.inject(GroupStore).setSelectedGroupId("3");
    // No group permissions for group 3, but the app fallback is held.
    TestBed.inject(AuthStore).setPermissions(["app.groups.read"], {});

    const route = {
      data: {
        groupPermission: "group.view",
        orAppPermissions: ["app.groups.read"],
      },
    } as unknown as ActivatedRouteSnapshot;

    expect(executeGuard(route, {} as any)).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
