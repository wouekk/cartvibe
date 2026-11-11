import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { retry, throwError, timer } from "rxjs";
import { QUIET_ERRORS } from "./http-interceptor";

/** The waits before the second and the third try, in milliseconds. */
export const RATE_LIMIT_RETRY_DELAYS = [1000, 2000];

/**
 * True for a 429 from the request limit in front of the API's handlers (api/internal/edge), which refuses a
 * request before one sees it: its body is plain text, not the API's `{ errorMsg }`. A 429 the API writes itself
 * is an answer and is left alone.
 */
export function isRefusedByRequestLimit(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 429 && !error.error?.errorMsg;
}

/**
 * Sends a request the limit refused again, twice at most, after a second and then two. The limit counts requests
 * per address (ten a second with a burst of twenty), so a page that asks for a lot at once, or two people behind
 * one router, can go over it for a moment; the wait is all it takes. Safe for a write too: a refused request never
 * reached the API. Background work marked `QUIET_ERRORS` is skipped, because it has its own retry.
 */
export const rateLimitRetryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(QUIET_ERRORS)) {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: RATE_LIMIT_RETRY_DELAYS.length,
      delay: (error, attempt) => (isRefusedByRequestLimit(error) ? timer(RATE_LIMIT_RETRY_DELAYS[attempt - 1]) : throwError(() => error)),
    })
  );
};
