import { HttpEvent, HttpEventType } from "@angular/common/http";
import { filter, map, Observable, tap } from "rxjs";

/** Where an upload stands: `uploading` has a percent (0-100); `saving` is the wait for the server after the last byte. */
export type UploadStage = { stage: "uploading"; percent: number } | { stage: "saving" };

/**
 * Turns a request made with `observe: "events", reportProgress: true` back into the plain response body, reporting the
 * upload on the way: a percent while bytes go up, then "saving" once everything is sent and the server is working.
 * Anything else the request emits (headers, download progress) is ignored.
 */
export function withUploadProgress<T>(
  events: Observable<HttpEvent<T>>,
  onStage: (stage: UploadStage | null) => void
): Observable<T> {
  return events.pipe(
    tap((event) => {
      if (event.type === HttpEventType.UploadProgress) {
        const total = event.total ?? 0;
        const percent = total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0;
        onStage(percent >= 100 ? { stage: "saving" } : { stage: "uploading", percent });
      } else if (event.type === HttpEventType.Response) {
        onStage(null);
      }
    }),
    filter((event): event is Extract<HttpEvent<T>, { type: HttpEventType.Response }> => event.type === HttpEventType.Response),
    map((response) => response.body as T)
  );
}
