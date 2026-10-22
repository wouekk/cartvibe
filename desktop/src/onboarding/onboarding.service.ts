import { effect, inject, Injectable, untracked } from "@angular/core";
import { Store } from "@ngxs/store";
import { AppDialog } from "../dialog/app-dialog";
import { AuthState } from "../store/auth.state";
import { WelcomeDialogComponent } from "./welcome-dialog.component";

/**
 * Opens the welcome once for an account whose `onboardingPending` is on (new accounts, see the API's CreateUser). It
 * watches the signed-in preferences, so it fires after the sign-in loads them and never on the login page. Once per
 * session: if the save failed and the flag is still on, the next sign-in or reload asks again.
 */
@Injectable({ providedIn: "root" })
export class OnboardingService {
  private readonly dialog = inject(AppDialog);
  private readonly store = inject(Store);

  private readonly preferences = this.store.selectSignal(AuthState.userPreferences);

  private shownForUser: number | undefined;

  constructor() {
    effect(() => {
      const preferences = this.preferences();
      untracked(() => {
        if (!preferences) {
          this.shownForUser = undefined;
          return;
        }
        if (preferences.onboardingPending && this.shownForUser !== preferences.userId) {
          this.shownForUser = preferences.userId;
          this.dialog.open(WelcomeDialogComponent, { width: "34rem", disableClose: true, autoFocus: "dialog" });
        }
      });
    });
  }
}
