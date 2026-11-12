import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { SnackbarService } from "../services";
import { AuthStore } from "../store";
import { marker } from "../i18n/marker";

const FORBIDDEN_MESSAGE = marker("You do not have permission to perform this action.");

const TOO_MANY_REQUESTS_MESSAGE = marker("Too many requests at once. Try again in a moment.");

/** The server takes 50 MB in one request; its refusal carries no message of its own, so this one is said here. */
const TOO_LARGE_MESSAGE = marker("That is more than the server takes at once. Send fewer or smaller files.");

/**
 * Set on a request whose failure its caller reports itself (or retries without a word): work sent in the
 * background, such as the shopping list's waiting changes, would otherwise toast on every attempt while a server
 * restarts. Pass it as `{ context: new HttpContext().set(QUIET_ERRORS, true) }`.
 */
export const QUIET_ERRORS = new HttpContextToken<boolean>(() => false);

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const activatedRoute = inject(ActivatedRoute);
  const snackbarService = inject(SnackbarService);

  return next(req).pipe(
    catchError((e: HttpErrorResponse) => {
      if (req.context.get(QUIET_ERRORS)) {
        return throwError(() => e);
      }

      const isLoggedIn = authStore.isLoggedIn();

      // Don't intercept errors from token refresh requests — let TokenRefreshService handle them
      if (req.url.includes("/api/token/")) {
        return throwError(() => e);
      }

      // NOTE: We check for queueMode to gracefully handle creating queues with mixed permissions
      const receiptQueueMode = activatedRoute.snapshot.queryParams["queueMode"];

      // The backend returns 403 for genuine permission denials too, not just auth. With a
      // still-valid token this is a permission denial, so surface it instead of logging the
      // user out. Token freshness is handled proactively elsewhere (15-min refresh timer,
      // app-init, and the auth guard).
      if (e.status === 403 && isLoggedIn) {
        // Toast only user-initiated actions; background GET reads are handled by their callers.
        if (req.method !== "GET" && !receiptQueueMode) {
          snackbarService.error(FORBIDDEN_MESSAGE);
        }
        return throwError(() => e);
      }

      // The server's errorMsg is the user-friendly message and always wins when
      // present. Angular's generic HttpErrorResponse.message ("Http failure
      // response for /api/login/: 500 Internal Server Error") is only a fallback
      // for a 5xx that carries no message at all, so an infra-level failure is
      // not silent. These must stay mutually exclusive: the toast
      // dismisses whatever is already showing, so toasting both replaced the
      // useful message with the useless one before the user could read it.
      if (!receiptQueueMode) {
        const serverMessage = e.error?.errorMsg;

        if (serverMessage) {
          snackbarService.error(serverMessage);
        } else if (e.status === 429) {
          // The request limit in front of the API refused it, and the tries after it (rateLimitRetryInterceptor).
          snackbarService.error(TOO_MANY_REQUESTS_MESSAGE);
        } else if (e.status === 413) {
          // An upload over the limit used to fail without a word: the progress bar went away and nothing was said.
          snackbarService.error(TOO_LARGE_MESSAGE);
        } else if (e.status >= 500) {
          snackbarService.error(e.message);
        }
      }

      return throwError(() => e);
    })
  );
};
