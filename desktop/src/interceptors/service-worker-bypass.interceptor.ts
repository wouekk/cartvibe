import { HttpInterceptorFn } from "@angular/common/http";

/** The header Angular's service worker checks to leave a request alone (`ngsw-worker.js`, `onFetch`). */
export const SERVICE_WORKER_BYPASS_HEADER = "ngsw-bypass";

const API_URL = /(^|\/)api(\/|$|\?)/;

/**
 * API calls skip the service worker and go straight to the network. It caches nothing for them (no `dataGroups`), and
 * passing a request through it re-sends the body from the worker, which can lose a file upload on the way: Quick Scan
 * reached the API with a cut-off multipart body ("multipart: NextPart: EOF").
 */
export const serviceWorkerBypassInterceptor: HttpInterceptorFn = (req, next) =>
  next(API_URL.test(req.url) ? req.clone({ setHeaders: { [SERVICE_WORKER_BYPASS_HEADER]: "true" } }) : req);
