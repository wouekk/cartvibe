import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { GroupGuard } from "./group.guard";
import { seedStore } from "../testing/seed-store";
import { GroupStore } from "../store/group.store";

import type { MockInstance } from "vitest";
describe("GroupGuard", () => {
  let guard: GroupGuard;
  let groups: GroupStore;
  let navigateSpy: MockInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
    });

    navigateSpy = vi.spyOn(TestBed.inject(Router), "navigate");
    navigateSpy.mockReturnValue(Promise.resolve(true));
    groups = TestBed.inject(GroupStore);
    guard = TestBed.inject(GroupGuard);
  });

  const visit = (groupId: string) =>
    guard.canActivate({ params: { groupId }, data: { groupGuardBasePath: "dashboard/group" } } as any, {} as any);

  it("should be created", () => {
    expect(guard).toBeTruthy();
  });

  it("lets a household the person belongs to through", () => {
    seedStore(groups, { groups: [{ id: "1" }] });

    expect(visit("1")).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("sends an unknown household to the first one the person has", () => {
    seedStore(groups, { groups: [{ id: "1" }] });

    expect(visit("2")).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(["dashboard/group/1"]);
    expect(groups.selectedGroupId()).toBe("1");
  });

  it("makes the household of the address the open one", () => {
    seedStore(groups, { groups: [{ id: "1" }], selectedGroupId: "3" });

    expect(visit("1")).toBe(true);
    expect(groups.selectedGroupId()).toBe("1");
  });

  it("opens the first household when the open one is not in the address either", () => {
    seedStore(groups, { groups: [{ id: "1" }], selectedGroupId: "3" });

    expect(visit("70")).toBe(false);
    expect(groups.selectedGroupId()).toBe("1");
    expect(navigateSpy).toHaveBeenCalledWith(["dashboard/group/1"]);
  });
});
