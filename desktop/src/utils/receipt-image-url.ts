/** The copies of a receipt image the server keeps: one to look at, one as a small preview. */
export type ReceiptImageSize = "display" | "thumb";

/**
 * The address of a receipt image as a file, for an `<img src>`: `GET /receiptImage/{id}/file`. The browser fetches
 * it with the session cookie, shows it as it arrives and keeps it (an image never changes under its id), so
 * opening the same receipt again costs nothing. `basePath` is the generated client's (`/api`).
 */
export function receiptImageFileUrl(basePath: string | undefined, imageId: number, size: ReceiptImageSize = "display"): string {
  const base = (basePath ?? "/api").replace(/\/+$/, "");
  const query = size === "display" ? "" : `?w=${size}`;
  return `${base}/receiptImage/${encodeURIComponent(String(imageId))}/file${query}`;
}
