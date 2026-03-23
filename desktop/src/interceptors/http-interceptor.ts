import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, switchMap, throwError } from "rxjs";
import { SnackbarService, TokenRefreshService } from "../services";
import { AuthState, Logout } from "../store";

const RETRY_HEADER = "X-Token-Retry";

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const router = inject(Router);
  const activatedRoute = inject(ActivatedRoute);
  const snackbarService = inject(SnackbarService);
  const tokenRefreshService = inject(TokenRefreshService);

  return next(req).pipe(
    catchError((e: HttpErrorResponse) => {
      const isLoggedIn = store.selectSnapshot(AuthState.isLoggedIn);

      // Don't intercept errors from token refresh requests — let TokenRefreshService handle them
      if (req.url.includes("/api/token/")) {
        return throwError(() => e);
      }

      if (e.status === 403 && isLoggedIn && !req.headers.has(RETRY_HEADER)) {
        // Attempt token refresh before giving up
        return tokenRefreshService.refreshToken().pipe(
          switchMap(() => {
            const retryReq = req.clone({
              headers: req.headers.set(RETRY_HEADER, "true"),
            });
            return next(retryReq);
          }),
          catchError((retryErr) => {
            store.dispatch(new Logout());
            localStorage.clear();
            router.navigate(["/auth/login"]);
            return throwError(() => retryErr);
          }),
        );
      }

      if (e.status === 403 && isLoggedIn && req.headers.has(RETRY_HEADER)) {
        store.dispatch(new Logout());
        localStorage.clear();
        router.navigate(["/auth/login"]);
        return throwError(() => e);
      }

      const regex = new RegExp("5\\d{2}");
      const receiptQueueMode = activatedRoute.snapshot.queryParams["queueMode"];

      // NOTE: We check for queueMode to gracefully handle creating queues with mixed permissions
      if (e.error?.errorMsg && !receiptQueueMode) {
        snackbarService.error(e.error?.errorMsg);
      }

      if (regex.test(e.status.toString())) {
        snackbarService.error(e.message);
      }

      return throwError(() => e);
    })
  );
};
