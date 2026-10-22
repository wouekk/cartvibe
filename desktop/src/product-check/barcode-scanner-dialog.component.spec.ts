import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialogRef } from "../dialog/app-dialog";
import { BarcodeImageService } from "./barcode-image.service";
import { BarcodeScannerDialogComponent } from "./barcode-scanner-dialog.component";
import * as scannerModule from "./barcode-scanner.service";
import { BarcodeScannerService } from "./barcode-scanner.service";

describe("BarcodeScannerDialogComponent", () => {
  let fixture: ComponentFixture<BarcodeScannerDialogComponent>;
  let close: jest.Mock;
  let track: { stop: jest.Mock };
  let stopScan: jest.Mock;
  let onCode: (code: string) => void;
  let getUserMedia: jest.Mock;
  let decode: jest.Mock;

  const state = (): string => fixture.componentInstance.state();

  beforeEach(async () => {
    close = jest.fn();
    track = { stop: jest.fn() };
    stopScan = jest.fn();
    decode = jest.fn();
    getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(globalThis.navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    jest.spyOn(scannerModule, "canUseCamera").mockReturnValue(true);
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [BarcodeScannerDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AppDialogRef, useValue: { close } },
        { provide: BarcodeImageService, useValue: { decode } },
        {
          provide: BarcodeScannerService,
          useValue: {
            start: jest.fn(async (_stream: unknown, _video: unknown, callback: (code: string) => void) => {
              onCode = callback;

              return { stop: stopScan };
            }),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis.navigator as any).mediaDevices;
  });

  const start = async () => {
    fixture = TestBed.createComponent(BarcodeScannerDialogComponent);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };

  it("asks for the back camera and starts scanning", async () => {
    await start();

    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" }, audio: false });
    expect(state()).toBe("scanning");
  });

  it("closes with the barcode it found and stops the camera", async () => {
    await start();

    onCode("3017620422003");

    expect(close).toHaveBeenCalledWith("3017620422003");
    expect(stopScan).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops the camera when the dialog is destroyed", async () => {
    await start();

    fixture.destroy();

    expect(track.stop).toHaveBeenCalled();
    expect(stopScan).toHaveBeenCalled();
  });

  it("says the camera is blocked when permission is refused", async () => {
    getUserMedia.mockRejectedValue({ name: "NotAllowedError" });

    await start();

    expect(state()).toBe("denied");
  });

  it("says no camera is available for any other failure", async () => {
    getUserMedia.mockRejectedValue({ name: "NotFoundError" });

    await start();

    expect(state()).toBe("unavailable");
  });

  describe("the photo route", () => {
    const choose = async (testId: string) => {
      const input = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [new File(["x"], "code.jpg")], configurable: true });
      input.dispatchEvent(new Event("change"));
      await fixture.whenStable();
      await Promise.resolve();
      fixture.detectChanges();
    };

    it("is offered when the camera permission is refused, and closes with the barcode it reads", async () => {
      getUserMedia.mockRejectedValue({ name: "NotAllowedError" });
      decode.mockResolvedValue("3017620422003");
      await start();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="barcode-photo-bar"]')).not.toBeNull();

      await choose("barcode-photo-capture");

      expect(close).toHaveBeenCalledWith("3017620422003");
    });

    it("is offered without a secure context, with a message when the photo has no barcode", async () => {
      jest.spyOn(scannerModule, "canUseCamera").mockReturnValue(false);
      decode.mockResolvedValue(null);
      await start();
      fixture.detectChanges();

      await choose("barcode-photo-upload");
      fixture.changeDetectorRef.markForCheck();
      await fixture.whenStable();

      expect(close).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[data-testid="barcode-scanner-photo-failed"]')).not.toBeNull();
    });

    it("is not offered while the live scanner works", async () => {
      await start();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="barcode-photo-bar"]')).toBeNull();
    });
  });

  it("is unavailable without a secure context", async () => {
    jest.spyOn(scannerModule, "canUseCamera").mockReturnValue(false);

    await start();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(state()).toBe("unavailable");
  });
});
