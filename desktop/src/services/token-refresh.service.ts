import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, finalize, map, Observable, shareReplay, tap, throwError } from "rxjs";
import { AuthService, Claims } from "../open-api";
import { Logout, SetAuthState } from "../store";
import { clearSessionStorage, isSessionRefused } from "../utils/session-storage";

@Injectable({
  providedIn: "root",
})
export class TokenRefreshService {
  private refreshInFlight$: Observable<Claims> | null = null;

  constructor(
    private authService: AuthService,
    private store: Store,
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
        this.store.dispatch(new SetAuthState(claims));
      }),
      catchError((err) => {
        if (isSessionRefused(err)) {
          this.store.dispatch(new Logout());
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
}
