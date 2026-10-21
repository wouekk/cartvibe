import { asBarcode, digitsOnly, hasValidCheckDigit } from "./barcode";

describe("barcode", () => {
  it("accepts the check digits of real EAN-13, EAN-8 and UPC-A codes", () => {
    expect(hasValidCheckDigit("3017620422003")).toBe(true);
    expect(hasValidCheckDigit("5449000000996")).toBe(true);
    expect(hasValidCheckDigit("96385074")).toBe(true);
    expect(hasValidCheckDigit("036000291452")).toBe(true);
  });

  it("rejects a wrong check digit, a wrong length and non-digits", () => {
    expect(hasValidCheckDigit("3017620422004")).toBe(false);
    expect(hasValidCheckDigit("12345")).toBe(false);
    expect(hasValidCheckDigit("30176204220a3")).toBe(false);
    expect(hasValidCheckDigit("")).toBe(false);
  });

  it("reads digits out of spaced input", () => {
    expect(digitsOnly("5 449000 000996")).toBe("5449000000996");
    expect(asBarcode(" 5449000-000996 ")).toBe("5449000000996");
  });

  it("treats words and short numbers as searches", () => {
    expect(asBarcode("nutella")).toBeNull();
    expect(asBarcode("7up")).toBeNull();
    expect(asBarcode("12345")).toBeNull();
    expect(asBarcode("3017620422004")).toBeNull();
  });
});
