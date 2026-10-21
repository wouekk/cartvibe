import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { UploadProgressComponent } from "./upload-progress.component";

describe("UploadProgressComponent", () => {
  let fixture: ComponentFixture<UploadProgressComponent>;

  const text = (testId: string): string => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadProgressComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(UploadProgressComponent);
  });

  it("renders nothing while idle", async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="upload-progress"]')).toBeNull();
  });

  it("shows the percent while uploading", async () => {
    fixture.componentRef.setInput("stage", { stage: "uploading", percent: 42 });
    await fixture.whenStable();

    expect(text("upload-progress-label")).toBe("Uploading 42%");
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")).toBe("42");
    expect(fixture.nativeElement.querySelector('[data-testid="upload-progress-fill"]').style.width).toBe("42%");
  });

  it("says it is saving once everything is sent, with a full bar", async () => {
    fixture.componentRef.setInput("stage", { stage: "saving" });
    await fixture.whenStable();

    expect(text("upload-progress-label")).toBe("Saving…");
    expect(fixture.nativeElement.querySelector('[data-testid="upload-progress-fill"]').style.width).toBe("100%");
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")).toBeNull();
  });
});
