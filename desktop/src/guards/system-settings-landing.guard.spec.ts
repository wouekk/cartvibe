import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { Permission } from "../open-api";
import { AuthStore } from "../store/auth.store";
import { GroupStore } from "../store/group.store";
import { systemSettingsLandingGuard } from "./system-settings-landing.guard";

describe("systemSettingsLandingGuard", () => {
  const executeGuard: CanActivateFn = (...params) =>
    TestBed.runInInjectionContext(() => systemSettingsLandingGuard(...params));
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    router = TestBed.inject(Router);
  });

  const run = (): UrlTree =>
    executeGuard({} as any, {} as any) as UrlTree;

  it("lands on General & Currency for a user who can read the settings", () => {
    TestBed.inject(AuthStore).setPermissions([Permission.AppSystemSettingsRead], {});

    expect(run().toString()).toBe("/system-settings/general");
  });

  it("redirects to the dashboard when the settings are not readable, whatever else is", () => {
    TestBed.inject(AuthStore).setPermissions([Permission.AppSystemTasksRead, Permission.AppReceiptProcessingSettingsRead],
        {});

    const dashboard = TestBed.inject(GroupStore).dashboardLink();
    expect(run().toString()).toBe(router.parseUrl(dashboard).toString());
  });
});
