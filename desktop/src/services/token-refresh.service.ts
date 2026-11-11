import { Injectable, inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, finalize, firstValueFrom, map, Observable, shareReplay, tap, throwError } from "rxjs";
import { AuthService, Claims } from "../open-api";
import { AuthStore } from "../store";
import { clearSessionStorage, isSessionRefused } from "../utils/session-storage";

@Injectable({
  providedIn: "root",
})
export class TokenRefreshService {
  private readonly authStore = inject(AuthStore);

  private refreshInFlight$: Observable<Claims> | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  /**
   * Renews the access token. Only the server can end a session: when it refuses the refresh token (401) the person is
   * signed out here. A refresh that never reached the server, or met one that is restarting, changes nothing: a phone
   * with no signal in the shop stays signed in, and the callers try again later.
   */
  public refreshToken(): Observable<Claims> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.authService.getNewRefreshToken().pipe(
      map((response) => response as Claims),
      tap((claims) => {
        this.authStore.setAuthState(claims);
      }),
      catchError((err) => {
        if (isSessionRefused(err)) {
          this.authStore.logout();
          clearSessionStorage();
          this.router.navigate(["/auth/login"]);
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay(1),
    );

    return this.refreshInFlight$;
  }

  /**
   * For work sent in the background (the shopping list's waiting changes, queued receipt photos): makes sure the
   * access token is good before a request goes out. A token that ran out while the phone had no signal would make
   * the server refuse the request, and background work drops what is refused. False means "not now": the renewal
   * could not reach the server, or the server ended the session (the person is then signed out).
   */
  public async ensureFreshToken(): Promise<boolean> {
    if (!this.authStore.isLoggedIn()) {
      return false;
    }
    if (!this.authStore.isAccessTokenExpired()) {
      return true;
    }

    try {
      await firstValueFrom(this.refreshToken());
      return true;
    } catch {
      return false;
    }
  }
}
