import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, map, Observable, of } from "rxjs";
import { TokenRefreshService } from "../services";
import { AuthState, GroupState } from "../store";

@Injectable({
  providedIn: "root",
})
export class AuthGuard {
  constructor(
    private router: Router,
    private store: Store,
    private tokenRefreshService: TokenRefreshService,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    const isLoggedIn = this.store.selectSnapshot(AuthState.isLoggedIn);
    const navigatingToAuth = route.url.toString().includes("auth");

    // if user tries to go to login screens while already logged in
    if (navigatingToAuth && isLoggedIn) {
      this.router.navigate([
        this.store.selectSnapshot(GroupState.overviewLink),
      ]);
      return false;
    } else if (navigatingToAuth && !isLoggedIn) {
      return true;
    }

    if (!isLoggedIn) {
      return this.router.createUrlTree(["/auth/login"]);
    }

    if (!this.store.selectSnapshot(AuthState.isTokenExpired)) {
      return true;
    }

    // A session whose access token ran out: renew it on the way in. When the server refuses, the refresh service has
    // already signed the person out and the login page follows. When the server could not be reached (no signal),
    // the session stands and the page opens with what it has.
    return this.tokenRefreshService.refreshToken().pipe(
      map(() => true),
      catchError(() =>
        of(this.store.selectSnapshot(AuthState.isLoggedIn) ? true : this.router.createUrlTree(["/auth/login"]))
      ),
    );
  }
}
