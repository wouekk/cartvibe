import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { GroupState } from "../../store";
import { ShoppingListState } from "../../store/shopping-list.state";

/**
 * Allows `/shopping-lists/group/:groupId` only for a real group whose lists the user may read. Any
 * other id — the synthetic "All" group, a group they can't read, a stale bookmark — is redirected to
 * the group the header button would pick, or to the receipt list when they can read none, instead
 * of letting the page load into a 400 or 403.
 */
export const shoppingListGroupGuard: CanActivateFn = (route) => {
  const store = inject(Store);
  const router = inject(Router);
  const groupId = Number(route.params["groupId"]);

  const readableGroups = store.selectSnapshot(ShoppingListState.readableGroups);
  if (readableGroups.some((group) => group.id === groupId)) {
    return true;
  }

  const targetGroupId = store.selectSnapshot(ShoppingListState.targetGroupId);
  if (targetGroupId !== undefined) {
    return router.createUrlTree(["/shopping-lists/group", targetGroupId]);
  }

  return router.createUrlTree([store.selectSnapshot(GroupState.receiptListLink)]);
};
