import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { GroupStore } from "../../store/group.store";
import { seedStore } from "../../testing/seed-store";
import { overviewLandingGuard } from "./overview-landing.guard";

describe("overviewLandingGuard", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
    });
    seedStore(TestBed.inject(GroupStore), { selectedGroupId: "7" });
  });

  function run(queryParams: Record<string, string>): UrlTree {
    const route = { queryParams } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => overviewLandingGuard(route, {} as RouterStateSnapshot)) as UrlTree;
  }

  it("goes to the selected household's Dashboard", () => {
    expect(run({}).toString()).toBe("/overview/group/7");
  });

  // The installed app's "Scan a receipt" shortcut: the query must survive the redirect, the page reads it.
  it("keeps the query string of a home-screen shortcut", () => {
    expect(run({ scan: "1" }).toString()).toBe("/overview/group/7?scan=1");
  });
});
