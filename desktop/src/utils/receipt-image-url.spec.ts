import { receiptImageFileUrl } from "./receipt-image-url";

describe("receiptImageFileUrl", () => {
  it("is the image's file under the client's base path, the display copy by default", () => {
    expect(receiptImageFileUrl("/api", 42)).toBe("/api/receiptImage/42/file");
    expect(receiptImageFileUrl("/api/", 42, "thumb")).toBe("/api/receiptImage/42/file?w=thumb");
  });

  it("falls back to /api when the client has no base path", () => {
    expect(receiptImageFileUrl(undefined, 7)).toBe("/api/receiptImage/7/file");
  });
});
