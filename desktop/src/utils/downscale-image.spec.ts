import { downscaleImageForUpload, UPLOAD_IMAGE_MAX_SIDE, UPLOAD_IMAGE_MIN_BYTES } from "./downscale-image";

function fileOf(size: number, type: string, name = "IMG_0001.jpeg"): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 42 });
}

describe("downscaleImageForUpload", () => {
  const close = jest.fn();
  let drawn: { width: number; height: number } | undefined;
  let blobSize = 400_000;
  const originalCreateImageBitmap = (globalThis as any).createImageBitmap;

  beforeEach(() => {
    close.mockClear();
    drawn = undefined;
    blobSize = 400_000;
    (globalThis as any).createImageBitmap = jest.fn().mockResolvedValue({ width: 4032, height: 3024, close });
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      const canvas = this;
      return {
        fillStyle: "",
        fillRect: jest.fn(),
        drawImage: jest.fn(() => (drawn = { width: canvas.width, height: canvas.height })),
      } as unknown as CanvasRenderingContext2D;
    } as any);
    jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback: BlobCallback) => callback(new Blob([new Uint8Array(blobSize)], { type: "image/jpeg" })));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (globalThis as any).createImageBitmap = originalCreateImageBitmap;
  });

  it("shrinks a large photo to an upright JPEG on the long side", async () => {
    const result = await downscaleImageForUpload(fileOf(6_000_000, "image/jpeg"));

    expect(drawn).toEqual({ width: UPLOAD_IMAGE_MAX_SIDE, height: 2304 });
    expect((globalThis as any).createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0001.jpg");
    expect(result.size).toBe(400_000);
    expect(close).toHaveBeenCalled();
  });

  it("re-encodes a large photo that is already small enough in pixels without enlarging it", async () => {
    (globalThis as any).createImageBitmap = jest.fn().mockResolvedValue({ width: 1200, height: 1600, close });

    await downscaleImageForUpload(fileOf(2_000_000, "image/png", "scan.png"));

    expect(drawn).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves small files, PDFs and undecodable formats alone", async () => {
    const small = fileOf(UPLOAD_IMAGE_MIN_BYTES - 1, "image/jpeg");
    const pdf = fileOf(6_000_000, "application/pdf", "receipt.pdf");
    expect(await downscaleImageForUpload(small)).toBe(small);
    expect(await downscaleImageForUpload(pdf)).toBe(pdf);

    (globalThis as any).createImageBitmap = jest.fn().mockRejectedValue(new Error("HEIC not supported"));
    const heic = fileOf(6_000_000, "image/heic", "IMG_0002.HEIC");
    expect(await downscaleImageForUpload(heic)).toBe(heic);
  });

  it("keeps the original when the result would not be smaller", async () => {
    blobSize = 7_000_000;
    const photo = fileOf(6_000_000, "image/jpeg");

    expect(await downscaleImageForUpload(photo)).toBe(photo);
    expect(close).toHaveBeenCalled();
  });

  it("keeps the original where the browser has no image decoding", async () => {
    (globalThis as any).createImageBitmap = undefined;
    const photo = fileOf(6_000_000, "image/jpeg");

    expect(await downscaleImageForUpload(photo)).toBe(photo);
  });
});
