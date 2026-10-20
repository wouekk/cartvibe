import { inject } from "@angular/core";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { Store } from "@ngxs/store";
import { Permission } from "../open-api";
import { AuthState, GroupState } from "../store";

/**
 * Landing guard for the System Settings shell. The sidebar links to `/system-settings`; this redirects
 * to the first tab (General & Currency) for anyone who can read the settings, and to the group dashboard
 * for everyone else. Every tab of the shell needs that same permission.
 */
export const systemSettingsLandingGuard: CanActivateFn = (): UrlTree => {
  const store: Store = inject(Store);
  const router: Router = inject(Router);

  if (store.selectSnapshot(AuthState.hasAppPermission(Permission.AppSystemSettingsRead))) {
    return router.parseUrl("/system-settings/general");
  }

  return router.parseUrl(store.selectSnapshot(GroupState.dashboardLink));
};
