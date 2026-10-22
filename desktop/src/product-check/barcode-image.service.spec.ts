import { TestBed } from "@angular/core/testing";
import { BarcodeImageService, fitWithin, MAX_DECODE_SIDE } from "./barcode-image.service";

class TestDecoder extends BarcodeImageService {
  public calls: string[] = [];
  public closed = false;
  public native: string | null = null;
  public zxing: string | null = null;
  public loadError = false;
  public drawn: { width: number; height: number } | null = null;

  protected override async loadImage(): Promise<any> {
    this.calls.push("load");
    if (this.loadError) {
      throw new Error("not an image");
    }

    return { width: 4000, height: 3000, close: () => (this.closed = true) };
  }

  protected override drawScaled(image: { width: number; height: number }): HTMLCanvasElement {
    this.calls.push("draw");
    this.drawn = fitWithin(image.width, image.height);

    return {} as HTMLCanvasElement;
  }

  protected override async decodeNative(): Promise<string | null> {
    this.calls.push("native");

    return this.native;
  }

  protected override async decodeZxing(): Promise<string | null> {
    this.calls.push("zxing");

    return this.zxing;
  }
}

describe("fitWithin", () => {
  it("shrinks the longer side to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_DECODE_SIDE, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: MAX_DECODE_SIDE });
    expect(fitWithin(8000, 8000)).toEqual({ width: MAX_DECODE_SIDE, height: MAX_DECODE_SIDE });
  });

  it("never enlarges a small image", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_DECODE_SIDE, 10)).toEqual({ width: MAX_DECODE_SIDE, height: 10 });
  });

  it("keeps a thin image at least one pixel tall", () => {
    expect(fitWithin(100000, 10).height).toBe(1);
  });
});

describe("BarcodeImageService", () => {
  let service: TestDecoder;
  const photo = new File(["x"], "code.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: BarcodeImageService, useClass: TestDecoder }] });
    service = TestBed.inject(BarcodeImageService) as TestDecoder;
  });

  it("shrinks a large photo before decoding it", async () => {
    service.zxing = "3017620422003";

    await service.decode(photo);

    expect(service.drawn).toEqual({ width: MAX_DECODE_SIDE, height: 960 });
    expect(service.calls).toEqual(["load", "draw", "native", "zxing"]);
  });

  it("uses the native detector's answer and does not load zxing", async () => {
    service.native = "5449000000996";

    expect(await service.decode(photo)).toBe("5449000000996");
    expect(service.calls).not.toContain("zxing");
  });

  it("falls back to zxing when the native detector finds nothing", async () => {
    service.zxing = "96385074";

    expect(await service.decode(photo)).toBe("96385074");
  });

  it("answers null when neither decoder finds a code", async () => {
    expect(await service.decode(photo)).toBeNull();
  });

  it("answers null for a file that is not an image, and never throws", async () => {
    service.loadError = true;

    expect(await service.decode(photo)).toBeNull();
  });

  it("releases the decoded bitmap", async () => {
    await service.decode(photo);

    expect(service.closed).toBe(true);
  });
});
