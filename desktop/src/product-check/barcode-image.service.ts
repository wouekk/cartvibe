import { Injectable } from "@angular/core";
import { asBarcode } from "./barcode";

/** The longest side a photo is shrunk to before decoding: a 12-48 MP phone photo makes a barcode decoder choke. */
export const MAX_DECODE_SIDE = 1280;

/** The size an image of `width` x `height` is drawn at so that its longer side is at most `max` (never enlarged). */
export function fitWithin(width: number, height: number, max = MAX_DECODE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) {
    return { width, height };
  }
  const scale = max / longest;

  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

interface DecodableImage {
  width: number;
  height: number;
  close?: () => void;
}

/**
 * Reads a product barcode out of a photo. This is the way in when live video is not available (a plain-http LAN address
 * has no `getUserMedia`): the phone's own camera app or the gallery hands over a file, which is shrunk to
 * `MAX_DECODE_SIDE`, drawn on an offscreen canvas and decoded. The native `BarcodeDetector` goes first where the browser
 * has it; `@zxing/browser` (loaded on demand, with TRY_HARDER) takes over otherwise. A read only counts once it passes
 * the EAN/UPC check digit, so a misread never opens a wrong product.
 */
@Injectable({ providedIn: "root" })
export class BarcodeImageService {
  /** The barcode in the photo, or null when none could be read. Never throws: an unreadable file is just "none". */
  public async decode(file: File): Promise<string | null> {
    let image: DecodableImage | null = null;
    try {
      image = await this.loadImage(file);
      const canvas = this.drawScaled(image);

      return (await this.decodeNative(canvas)) ?? (await this.decodeZxing(canvas));
    } catch {
      return null;
    } finally {
      image?.close?.();
    }
  }

  /** Seams a spec replaces: they need a real image, canvas and decoder, which the test browser does not have. */
  protected async loadImage(file: File): Promise<DecodableImage> {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file);
    }

    const url = URL.createObjectURL(file);
    try {
      const element = new Image();
      element.src = url;
      await element.decode();

      return element;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  protected drawScaled(image: DecodableImage): HTMLCanvasElement {
    const { width, height } = fitWithin(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image as CanvasImageSource, 0, 0, width, height);

    return canvas;
  }

  protected async decodeNative(canvas: HTMLCanvasElement): Promise<string | null> {
    const Detector = (globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (typeof Detector !== "function") {
      return null;
    }

    try {
      const found = await new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(canvas);

      return found.map((item) => asBarcode(item.rawValue)).find((code) => !!code) ?? null;
    } catch {
      return null;
    }
  }

  protected async decodeZxing(canvas: HTMLCanvasElement): Promise<string | null> {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
    const hints = new Map<unknown, unknown>([
      [DecodeHintType.TRY_HARDER, true],
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    ]);

    try {
      const result = new BrowserMultiFormatReader(hints as Map<number, never>).decodeFromCanvas(canvas);

      return asBarcode(result.getText());
    } catch {
      // zxing throws NotFoundException for a photo with no readable code.
      return null;
    }
  }
}
