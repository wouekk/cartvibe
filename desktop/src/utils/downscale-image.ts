/**
 * Longest edge, in pixels, of a photo sent to the server. The AI gets a 2048 px copy anyway; this keeps a long
 * receipt's small print while a 12 MP phone photo (3-8 MB) goes up as roughly half a megabyte to a megabyte.
 */
export const UPLOAD_IMAGE_MAX_SIDE = 3072;
export const UPLOAD_IMAGE_QUALITY = 0.85;
/** Files below this go up as they are: re-encoding saves little and costs a generation of JPEG loss. */
export const UPLOAD_IMAGE_MIN_BYTES = 1_500_000;

// HEIC decodes only where the browser can (Safari); elsewhere it goes up as it is and the server converts it.
const DOWNSCALABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Shrinks a large photo to an upright JPEG before it is uploaded, so the upload is quick on mobile data. Anything it
 * cannot improve (a PDF, a small file, a format the browser cannot decode, a result that is not smaller) is returned
 * unchanged, so a failure here never stops an upload.
 */
export async function downscaleImageForUpload(file: File): Promise<File> {
  if (!DOWNSCALABLE_TYPES.includes(file.type) || file.size < UPLOAD_IMAGE_MIN_BYTES) {
    return file;
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, UPLOAD_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    // JPEG has no transparency: a transparent PNG goes onto white, not black, so dark print stays readable.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", UPLOAD_IMAGE_QUALITY));
    if (!blob || blob.size >= file.size) {
      return file;
    }
    return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

function jpegFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name) + ".jpg";
}
