import { Injectable } from "@angular/core";
import { asBarcode } from "./barcode";
import { centreInFrame, frameInVideo } from "./scan-frame";

export interface ScanHandle {
  stop(): void;
}

interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string; cornerPoints?: { x: number; y: number }[] }[]>;
}

type NativeBarcodeDetectorConstructor = new (options: { formats: string[] }) => NativeBarcodeDetector;

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const NATIVE_INTERVAL_MS = 200;

/** The camera needs a secure context (https or localhost) and a browser that has `getUserMedia`. */
export function canUseCamera(): boolean {
  return !!globalThis.isSecureContext && !!globalThis.navigator?.mediaDevices?.getUserMedia;
}

/**
 * Finds a product barcode in a live camera stream. Browsers with the native `BarcodeDetector` (Chrome, Edge, Android) use
 * it; the rest (iOS Safari, Firefox) load `@zxing/browser` on demand, so its code is a separate chunk that nobody pays
 * for until the camera is opened. A read only counts once it passes the EAN/UPC check digit, so a misread never opens a
 * wrong product, and only when the barcode sits between the brackets of the scan frame (`scan-frame.ts`), so another
 * code in view cannot be read by mistake.
 */
@Injectable({ providedIn: "root" })
export class BarcodeScannerService {
  public supportsNative(): boolean {
    return typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector === "function";
  }

  public async start(stream: MediaStream, video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScanHandle> {
    return this.supportsNative() ? this.startNative(video, onCode) : this.startZxing(stream, video, onCode);
  }

  private startNative(video: HTMLVideoElement, onCode: (code: string) => void): ScanHandle {
    const Detector = (globalThis as unknown as { BarcodeDetector: NativeBarcodeDetectorConstructor }).BarcodeDetector;
    const detector = new Detector({ formats: NATIVE_FORMATS });
    let stopped = false;

    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const found = await detector.detect(video);
        const frame = frameInVideo(video);
        const code = found
          .filter((item) => centreInFrame(frame, item.cornerPoints ?? []))
          .map((item) => asBarcode(item.rawValue))
          .find((value) => !!value);
        if (code && !stopped) {
          onCode(code);

          return;
        }
      } catch {
        // A frame that cannot be read yet (the video is still starting) is simply tried again.
      }
      setTimeout(tick, NATIVE_INTERVAL_MS);
    };
    void tick();

    return {
      stop: () => {
        stopped = true;
      },
    };
  }

  private async startZxing(stream: MediaStream, video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScanHandle> {
    const { BrowserMultiFormatReader } = await this.loadZxing();
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromStream(stream, video, (result) => {
      const points = (result?.getResultPoints?.() ?? []).map((point) => ({ x: point.getX(), y: point.getY() }));
      const code = result && centreInFrame(frameInVideo(video), points) ? asBarcode(result.getText()) : null;
      if (code) {
        onCode(code);
      }
    });

    return { stop: () => controls.stop() };
  }

  /** The seam a spec replaces; the dynamic import keeps zxing out of the main bundle. */
  protected loadZxing(): Promise<typeof import("@zxing/browser")> {
    return import("@zxing/browser");
  }
}
