import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { GroupState } from "../store";

/**
 * Sends a denied user to the landing page, unless that is the page they were denied: a guard that redirects to the
 * very route it protects loops forever (a member without receipt access is denied /receipts, whose fallback is
 * /receipts). Returns false either way, so the caller can `return redirectToLanding(...)`.
 */
export function redirectToLanding(router: Router, store: Store, attemptedUrl: string | undefined): false {
  const landing = store.selectSnapshot(GroupState.dashboardLink);
  const attempted = (attemptedUrl ?? "").split("?")[0];

  if (attempted !== landing) {
    router.navigate([landing]);
  }

  return false;
}
