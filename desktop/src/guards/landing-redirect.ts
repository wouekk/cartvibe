import { Router } from "@angular/router";

/**
 * Sends a denied user to the landing page, unless that is the page they were denied: a guard that redirects to the
 * very route it protects loops forever (a member without receipt access is denied /receipts, whose fallback is
 * /receipts). `landing` is `GroupStore.dashboardLink()`. Returns false either way, so the caller can
 * `return redirectToLanding(...)`.
 */
export function redirectToLanding(router: Router, landing: string, attemptedUrl: string | undefined): false {
  const attempted = (attemptedUrl ?? "").split("?")[0];

  if (attempted !== landing) {
    router.navigate([landing]);
  }

  return false;
}
