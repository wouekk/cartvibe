import { TestBed } from "@angular/core/testing";
import { BarcodeScannerService } from "./barcode-scanner.service";

class TestScanner extends BarcodeScannerService {
  public zxingLoads = 0;
  public zxingCallback: ((result: { getText(): string } | null) => void) | null = null;
  public stopped = false;

  protected override loadZxing(): Promise<any> {
    this.zxingLoads++;

    return Promise.resolve({
      BrowserMultiFormatReader: class {
        public async decodeFromStream(_stream: unknown, _video: unknown, callback: any) {
          (globalThis as any).__zxingCallback = callback;

          return { stop: () => ((globalThis as any).__zxingStopped = true) };
        }
      },
    });
  }
}

describe("BarcodeScannerService", () => {
  const stream = {} as MediaStream;
  const video = {} as HTMLVideoElement;

  afterEach(() => {
    delete (globalThis as any).BarcodeDetector;
    delete (globalThis as any).__zxingCallback;
    delete (globalThis as any).__zxingStopped;
    jest.useRealTimers();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: BarcodeScannerService, useClass: TestScanner }] });
  });

  it("falls back to zxing, loaded on demand, when the browser has no BarcodeDetector", async () => {
    const service = TestBed.inject(BarcodeScannerService) as TestScanner;
    const codes: string[] = [];

    expect(service.supportsNative()).toBe(false);
    const handle = await service.start(stream, video, (code) => codes.push(code));

    expect(service.zxingLoads).toBe(1);
    (globalThis as any).__zxingCallback({ getText: () => "3017620422004" });
    (globalThis as any).__zxingCallback(null);
    (globalThis as any).__zxingCallback({ getText: () => "3017620422003" });
    expect(codes).toEqual(["3017620422003"]);

    handle.stop();
    expect((globalThis as any).__zxingStopped).toBe(true);
  });

  it("uses the native detector when there is one, and only accepts a valid barcode", async () => {
    jest.useFakeTimers();
    const reads = [[{ rawValue: "1234567890123" }], [], [{ rawValue: "5449000000996" }]];
    (globalThis as any).BarcodeDetector = class {
      public detect = jest.fn(async () => reads.shift() ?? []);
    };
    const service = TestBed.inject(BarcodeScannerService) as TestScanner;
    const codes: string[] = [];

    expect(service.supportsNative()).toBe(true);
    await service.start(stream, video, (code) => codes.push(code));
    for (let i = 0; i < 4; i++) {
      await jest.advanceTimersByTimeAsync(200);
    }

    expect(service.zxingLoads).toBe(0);
    expect(codes).toEqual(["5449000000996"]);
  });

  it("stops looking when stopped", async () => {
    jest.useFakeTimers();
    const detect = jest.fn(async () => []);
    (globalThis as any).BarcodeDetector = class {
      public detect = detect;
    };
    const service = TestBed.inject(BarcodeScannerService) as TestScanner;

    const handle = await service.start(stream, video, () => undefined);
    await jest.advanceTimersByTimeAsync(200);
    handle.stop();
    detect.mockClear();
    await jest.advanceTimersByTimeAsync(1000);

    expect(detect).not.toHaveBeenCalled();
  });
});
