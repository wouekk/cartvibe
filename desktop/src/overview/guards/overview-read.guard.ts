import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { Permission } from "../../open-api";
import { AuthState } from "../../store";

/**
 * Allows the overview only with group.receipts.read in the route's group — the permission its data
 * needs. On deny it falls back to the group's customizable dashboards, whose own guard redirects
 * further if that is not readable either, instead of letting the page load into a 403.
 */
export const overviewReadGuard: CanActivateFn = (route) => {
  const store = inject(Store);
  const router = inject(Router);
  const groupId = route.params["groupId"];

  if (store.selectSnapshot(AuthState.hasGroupPermission(+groupId, Permission.GroupReceiptsRead))) {
    return true;
  }

  return router.createUrlTree(["/dashboard/group", groupId]);
};
