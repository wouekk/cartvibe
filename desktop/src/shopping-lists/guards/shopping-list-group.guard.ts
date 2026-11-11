import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { GroupStore } from "../../store";
import { ShoppingListStore } from "../../store/shopping-list.store";

/**
 * Allows `/shopping-lists/group/:groupId` only for a real group whose lists the user may read. Any
 * other id — the synthetic "All" group, a group they can't read, a stale bookmark — is redirected to
 * the group the header button would pick, or to the receipt list when they can read none, instead
 * of letting the page load into a 400 or 403. A redirect keeps the query string: a recipe shared from a phone arrives
 * as `/shopping-lists?recipeUrl=…` with no group, and the page reads it after the redirect.
 */
export const shoppingListGroupGuard: CanActivateFn = (route) => {
  const groupStore = inject(GroupStore);
  const lists = inject(ShoppingListStore);
  const router = inject(Router);
  const groupId = Number(route.params["groupId"]);
  const queryParams = route.queryParams ?? {};

  const readableGroups = lists.readableGroups();
  if (readableGroups.some((group) => group.id === groupId)) {
    return true;
  }

  const targetGroupId = lists.targetGroupId();
  if (targetGroupId !== undefined) {
    return router.createUrlTree(["/shopping-lists/group", targetGroupId], { queryParams });
  }

  return router.createUrlTree([groupStore.receiptListLink()]);
};
