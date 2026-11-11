import { TranslatePipe } from "../../i18n/translate.pipe";
import { Component, Input } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";

import { SourceFileViewerDialogComponent } from "./source-file-viewer-dialog.component";

// Stubbed rather than pulled in from SharedUiModule: the real app-image-viewer
// renders an image canvas that wants a live image load, and the point here is the
// binding, not their rendering.
@Component({
    selector: "app-dialog", template: "<ng-content></ng-content>",
    imports: [TranslatePipe]
})
class DialogStubComponent {
  @Input() public headerText?: string;
}

@Component({
    selector: "app-image-viewer", template: "",
    imports: [TranslatePipe]
})
class ImageViewerStubComponent {
  @Input() public imageBase64?: string;
}

describe("SourceFileViewerDialogComponent", () => {
  let component: SourceFileViewerDialogComponent;
  let fixture: ComponentFixture<SourceFileViewerDialogComponent>;
  const dialogRef = { close: vi.fn() };
  const data = { name: "receipt.png", encodedImage: "data:image/png;base64,AAA" };

  beforeEach(async () => {
    TestBed.configureTestingModule({
    imports: [SourceFileViewerDialogComponent],
    providers: [
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: APP_DIALOG_DATA, useValue: data },
    ],
});
    // The stand-ins take the place of the real children the component imports.
    TestBed.overrideComponent(SourceFileViewerDialogComponent, {
      set: { imports: [TranslatePipe, DialogStubComponent, ImageViewerStubComponent] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SourceFileViewerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders the upload and heads the dialog with its file name", () => {
    const viewer = fixture.debugElement.query(By.directive(ImageViewerStubComponent)).componentInstance;
    const dialog = fixture.debugElement.query(By.directive(DialogStubComponent)).componentInstance;

    expect(viewer.imageBase64).toBe(data.encodedImage);
    expect(dialog.headerText).toBe(data.name);
  });

  it("closes through the dialog ref", () => {
    component.close();

    expect(dialogRef.close).toHaveBeenCalled();
  });
});
