import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { Permission } from "../open-api";
import { AuthStore } from "../store/auth.store";
import { GroupStore } from "../store/group.store";
import { settingsLandingGuard } from "./settings-landing.guard";

describe("settingsLandingGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => settingsLandingGuard(...params));
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    router = TestBed.inject(Router);
  });

  const run = (): UrlTree => executeGuard({} as any, {} as any) as UrlTree;

  it("redirects to user-profile when account is readable", () => {
    TestBed.inject(AuthStore).setPermissions([Permission.AppAccountRead], {});

    expect(run().toString()).toBe("/settings/user-profile/view");
  });

  it("falls through to user-preferences when account is not readable", () => {
    TestBed.inject(AuthStore).setPermissions([Permission.AppUserPreferencesRead], {});

    expect(run().toString()).toBe("/settings/user-preferences/view");
  });

  it("redirects to the dashboard when no tab is readable", () => {
    TestBed.inject(AuthStore).setPermissions([], {});

    const dashboard = TestBed.inject(GroupStore).dashboardLink();
    expect(run().toString()).toBe(router.parseUrl(dashboard).toString());
  });
});
