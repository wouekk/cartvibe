import { HttpEvent, HttpEventType, HttpResponse } from "@angular/common/http";
import { of, throwError } from "rxjs";
import { UploadStage, withUploadProgress } from "./upload-progress";

describe("withUploadProgress", () => {
  const progress = (loaded: number, total?: number): HttpEvent<string> => ({ type: HttpEventType.UploadProgress, loaded, total });

  it("reports the percent while uploading, then saving, then clears, and emits only the body", () => {
    const stages: (UploadStage | null)[] = [];
    const bodies: string[] = [];

    withUploadProgress(
      of<HttpEvent<string>>(
        { type: HttpEventType.Sent },
        progress(25, 100),
        progress(70, 100),
        progress(100, 100),
        new HttpResponse({ body: "done" })
      ),
      (stage) => stages.push(stage)
    ).subscribe((body) => bodies.push(body));

    expect(stages).toEqual([{ stage: "uploading", percent: 25 }, { stage: "uploading", percent: 70 }, { stage: "saving" }, null]);
    expect(bodies).toEqual(["done"]);
  });

  it("shows 0 percent when the total is unknown and never goes above 100", () => {
    const stages: (UploadStage | null)[] = [];

    withUploadProgress(of(progress(10), progress(500, 100)), (stage) => stages.push(stage)).subscribe();

    expect(stages).toEqual([{ stage: "uploading", percent: 0 }, { stage: "saving" }]);
  });

  it("passes an error on and leaves clearing the bar to the caller", () => {
    const failure = new Error("offline");
    let seen: unknown;

    withUploadProgress(throwError(() => failure), () => undefined).subscribe({ error: (error) => (seen = error) });

    expect(seen).toBe(failure);
  });
});
