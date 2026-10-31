import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { Observable, from, switchMap, throwError, of } from "rxjs";
import { DemoRequest, DemoResponse } from "./backend/http";
import { DemoSession } from "./demo-session";

const API_PATH = /^(?:.*?)\/api(\/.*)?$/;

/** A multipart body, decoded to `field -> values`: JSON parts are parsed, files become `{ name, type, size }`. */
export async function decodeBody(body: unknown): Promise<unknown> {
  if (typeof FormData === "undefined" || !(body instanceof FormData)) {
    return body;
  }

  const fields: Record<string, unknown[]> = {};
  for (const [name, value] of body.entries()) {
    const list = (fields[name] ??= []);
    if (typeof value === "string") {
      list.push(value);
    } else if (value.type === "application/json" && value.name === "blob") {
      const text = await value.text();
      try {
        list.push(JSON.parse(text));
      } catch {
        // Not JSON after all: hand the handler the text, which it answers as a bad request instead of throwing here.
        list.push(text);
      }
    } else {
      list.push({ name: value.name, type: value.type, size: value.size });
    }
  }
  return fields;
}

function toDemoRequest(req: HttpRequest<unknown>, body: unknown): DemoRequest | undefined {
  const url = new URL(req.urlWithParams, window.location.href);
  const match = API_PATH.exec(url.pathname);
  if (url.origin !== window.location.origin || !match) {
    return undefined;
  }

  return { method: req.method, path: (match[1] ?? "/").replace(/\/+$/, "") || "/", query: url.searchParams, body };
}

function toHttpEvent(req: HttpRequest<unknown>, answer: DemoResponse): HttpEvent<unknown> {
  const url = req.urlWithParams;

  if (answer.status >= 400) {
    throw new HttpErrorResponse({ status: answer.status, statusText: "Error", url, error: answer.json });
  }

  if (answer.file) {
    return new HttpResponse({ status: 200, url, body: new Blob([answer.file.content], { type: answer.file.type }) });
  }

  if (req.responseType === "blob") {
    return new HttpResponse({ status: 200, url, body: new Blob([JSON.stringify(answer.json ?? "")], { type: "application/json" }) });
  }

  return new HttpResponse({ status: answer.status, url, body: answer.json ?? null });
}

/**
 * The end of the interceptor chain in the demo: every `/api` call is answered from memory and never reaches `next`. A
 * call to another origin (Open Food Facts, a logo, a font host) fails as an offline browser would, so nothing leaves
 * the page. Same-origin files (the translation JSON, assets) pass through to the static server.
 */
export const demoInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  const session = inject(DemoSession);
  const target = new URL(req.urlWithParams, window.location.href);

  if (target.origin !== window.location.origin) {
    return throwError(() => new HttpErrorResponse({ status: 0, statusText: "Offline", url: req.url, error: new ProgressEvent("error") }));
  }

  if (!API_PATH.test(target.pathname)) {
    return next(req);
  }

  return from(decodeBody(req.body)).pipe(
    switchMap((body) => {
      const demoRequest = toDemoRequest(req, body);
      if (!demoRequest) {
        return next(req);
      }

      try {
        return of(toHttpEvent(req, session.backend.handle(demoRequest)));
      } catch (error) {
        return throwError(() => error);
      }
    }),
  );
};
