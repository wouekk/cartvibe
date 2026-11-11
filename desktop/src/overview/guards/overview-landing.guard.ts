import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { GroupStore } from "../../store";

/**
 * `/overview` with no household in the URL: goes to the selected household's Dashboard and keeps the query string. The
 * installed app's "Scan a receipt" shortcut arrives this way (`/overview?scan=1`), because a shortcut is written once
 * in the manifest and cannot know the household.
 */
export const overviewLandingGuard: CanActivateFn = (route) => {
  const groupStore = inject(GroupStore);
  const router = inject(Router);

  return router.createUrlTree([groupStore.overviewLink()], {
    queryParams: route.queryParams ?? {},
  });
};
