import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BarcodeImageService } from "./barcode-image.service";
import { BarcodePhotoActionsComponent } from "./barcode-photo-actions.component";

describe("BarcodePhotoActionsComponent", () => {
  let fixture: ComponentFixture<BarcodePhotoActionsComponent>;
  let decode: jest.Mock;
  let found: string[];
  let missed: number;
  let release: (code: string | null) => void;

  const create = async (liveCamera = false) => {
    fixture = TestBed.createComponent(BarcodePhotoActionsComponent);
    fixture.componentRef.setInput("liveCamera", liveCamera);
    fixture.componentInstance.barcodeFound.subscribe((code) => found.push(code));
    fixture.componentInstance.notFound.subscribe(() => missed++);
    await fixture.whenStable();
  };

  const input = (testId: string): HTMLInputElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const pick = async (testId: string, files: File[] = [new File(["x"], "code.jpg", { type: "image/jpeg" })]) => {
    const element = input(testId);
    Object.defineProperty(element, "files", { value: files, configurable: true });
    element.dispatchEvent(new Event("change"));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    found = [];
    missed = 0;
    decode = jest.fn().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    await TestBed.configureTestingModule({
      imports: [BarcodePhotoActionsComponent],
      providers: [provideZonelessChangeDetection(), { provide: BarcodeImageService, useValue: { decode } }],
    }).compileComponents();
  });

  it("offers the phone camera and the gallery as native labels around file inputs", async () => {
    await create();

    const capture = input("barcode-photo-capture");
    const upload = input("barcode-photo-upload");
    expect(capture.type).toBe("file");
    expect(capture.getAttribute("capture")).toBe("environment");
    expect(capture.accept).toBe("image/*");
    expect(capture.closest("label")).not.toBeNull();
    expect(upload.type).toBe("file");
    expect(upload.hasAttribute("capture")).toBe(false);
    expect(upload.closest("label")).not.toBeNull();
  });

  it("with live video, Take a photo is a button that asks the host for the scanner; Upload stays a label", async () => {
    await create(true);
    let asked = 0;
    fixture.componentInstance.takePhoto.subscribe(() => asked++);

    expect(input("barcode-photo-capture")).toBeNull();
    const live = input("barcode-photo-live");
    expect(live.tagName).toBe("BUTTON");
    expect(input("barcode-photo-upload").closest("label")).not.toBeNull();

    live.click();
    expect(asked).toBe(1);
  });

  it("decodes the chosen photo, shows progress, then emits the barcode", async () => {
    await create();

    await pick("barcode-photo-capture");
    expect(decode).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.decoding()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="barcode-photo-decoding"]')).not.toBeNull();

    release("3017620422003");
    await fixture.whenStable();
    await Promise.resolve();

    expect(found).toEqual(["3017620422003"]);
    expect(missed).toBe(0);
    expect(fixture.componentInstance.decoding()).toBe(false);
  });

  it("says so when the photo has no barcode, and can be tried again", async () => {
    await create();
    await pick("barcode-photo-upload");

    release(null);
    await fixture.whenStable();
    await Promise.resolve();

    expect(found).toEqual([]);
    expect(missed).toBe(1);
    expect(fixture.componentInstance.decoding()).toBe(false);

    await pick("barcode-photo-upload");
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("ignores a change that carries no file", async () => {
    await create();

    await pick("barcode-photo-capture", []);

    expect(decode).not.toHaveBeenCalled();
  });
});
