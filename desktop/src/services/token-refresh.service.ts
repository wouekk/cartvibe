import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, finalize, map, Observable, shareReplay, tap, throwError } from "rxjs";
import { AuthService, Claims } from "../open-api";
import { Logout, SetAuthState } from "../store";

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
        this.store.dispatch(new Logout());
        localStorage.clear();
        this.router.navigate(["/auth/login"]);
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
