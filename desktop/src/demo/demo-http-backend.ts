import { HttpBackend, HttpErrorResponse, HttpEvent, HttpRequest, HttpXhrBackend } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, throwError } from "rxjs";

/**
 * The last stop of every HTTP client in the demo, also the ones built straight on `HttpBackend` (Open Food Facts, the
 * translation files). A request to another origin fails as an offline browser would; same-origin files go on to the
 * normal XHR backend. Together with the interceptor this is what keeps the promise that no network call leaves the page.
 */
@Injectable()
export class DemoHttpBackend implements HttpBackend {
  private readonly xhr = inject(HttpXhrBackend);

  public handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const target = new URL(req.urlWithParams, window.location.href);
    if (target.origin !== window.location.origin) {
      return throwError(() => new HttpErrorResponse({ status: 0, statusText: "Offline", url: req.url }));
    }

    return this.xhr.handle(req);
  }
}
