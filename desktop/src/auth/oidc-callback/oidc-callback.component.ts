import { ChangeDetectionStrategy, Component, inject, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, EMPTY, finalize, switchMap, take, tap } from "rxjs";
import { UserService } from "../../open-api";
import { SignInTransitionService } from "../../services/sign-in-transition.service";
import { CartVibeLoaderComponent } from "../../shared-ui/cartvibe-loader/cartvibe-loader.component";
import { GroupStore } from "../../store";
import { AppDataService } from "../../services/app-data.service";

/**
 * Where the server sends the browser after a sign-in at an identity provider (`/auth/callback`). The session
 * cookies are set by then, but a browser that never signed in here has an empty store, and the app only loads the
 * account at start for a store that already holds a session: so this page loads it, then opens the Dashboard. A
 * browser whose store does hold a session never gets here (the auth guard sends it on, and the start already
 * loaded the account with the new cookies).
 *
 * The sign-in splash covers it, like a password sign-in. If the account cannot be loaded (the cookies did not
 * survive the trip, or the session was refused) the login page says so.
 */
@Component({
  selector: "app-oidc-callback",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartVibeLoaderComponent],
  host: { class: "flex min-h-dvh items-center justify-center bg-background" },
  template: `<app-cartvibe-loader data-testid="oidc-callback"></app-cartvibe-loader>`,
})
export class OidcCallbackComponent implements OnInit {
  private readonly groupStore = inject(GroupStore);

  private readonly router = inject(Router);
  private readonly appData = inject(AppDataService);
  private readonly userService = inject(UserService);
  private readonly signInTransition = inject(SignInTransitionService);

  public ngOnInit(): void {
    this.signInTransition.start();
    this.userService
      .getAppData()
      .pipe(
        take(1),
        tap((appData) => this.appData.set(appData)),
        switchMap(() => this.router.navigate([this.groupStore.overviewLink()])),
        catchError(() => {
          void this.router.navigate(["/auth/login"], { queryParams: { oidcError: "invalid_state" } });
          return EMPTY;
        }),
        finalize(() => this.signInTransition.finish())
      )
      .subscribe();
  }
}
