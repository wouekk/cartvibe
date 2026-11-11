import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { GroupStore, AuthStore } from "../store";
import { redirectToLanding } from "./landing-redirect";

/**
 * Allows activation when the user holds ANY of the app-scoped permissions
 * declared on `route.data['appPermissions']`. On deny, redirects to the group
 * dashboard.
 */
export const appPermissionGuard: CanActivateFn = (route, state) => {
  const authStore = inject(AuthStore);
  const router: Router = inject(Router);

  const required = (route.data["appPermissions"] as string[]) ?? [];

  if (authStore.hasAnyAppPermission(required)) {
    return true;
  }

  return redirectToLanding(router, inject(GroupStore).dashboardLink(), state.url);
};
