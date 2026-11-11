import { inject } from "@angular/core";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { Permission } from "../open-api";
import { GroupStore, AuthStore } from "../store";

/**
 * Landing guard for the Settings shell. The avatar menu links to `/settings`;
 * this redirects to the first tab the user can read, in the same order the tab
 * bar renders them. Falls back to the group dashboard when the user can read
 * none of them.
 */
export const settingsLandingGuard: CanActivateFn = (): UrlTree => {
  const authStore = inject(AuthStore);
  const groupStore = inject(GroupStore);
  const router: Router = inject(Router);

  const tabs: { path: string; permission: Permission }[] = [
    { path: "user-profile/view", permission: Permission.AppAccountRead },
    {
      path: "user-preferences/view",
      permission: Permission.AppUserPreferencesRead,
    },
  ];

  for (const tab of tabs) {
    if (authStore.hasAppPermission(tab.permission)) {
      return router.parseUrl(`/settings/${tab.path}`);
    }
  }

  return router.parseUrl(groupStore.dashboardLink());
};
