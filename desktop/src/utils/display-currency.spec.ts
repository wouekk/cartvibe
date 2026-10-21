import { formatInDisplayCurrency, isCurrencyCode, normalizeCurrencyCode, parseRateInput } from "./display-currency";

describe("display currency helpers", () => {
  it("normalizes and validates a code", () => {
    expect(normalizeCurrencyCode(" pln ")).toBe("PLN");
    expect(isCurrencyCode("PLN")).toBe(true);
    expect(isCurrencyCode("PL")).toBe(false);
    expect(isCurrencyCode("EURO")).toBe(false);
  });

  it("parses a rate with a comma, six decimals at most, above zero", () => {
    expect(parseRateInput("4,25")).toEqual({ ok: true, value: "4.25" });
    expect(parseRateInput("0.123456")).toEqual({ ok: true, value: "0.123456" });
    expect(parseRateInput("")).toEqual({ ok: true });
    expect(parseRateInput("0").ok).toBe(false);
    expect(parseRateInput("1.1234567").ok).toBe(false);
    expect(parseRateInput("abc").ok).toBe(false);
  });

  it("converts by the rate and formats for the currency", () => {
    expect(formatInDisplayCurrency("10.00", "PLN", 4.25, "en-US")).toContain("42.50");
    expect(formatInDisplayCurrency(100, "EUR", 0.9, "en-US")).toContain("90.00");
  });

  it("falls back to the code for a currency the browser does not know", () => {
    expect(formatInDisplayCurrency(2, "ZZZZ", 2, "en-US")).toBe("4.00 ZZZZ");
  });
});
