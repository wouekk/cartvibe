import { parseCurrencyCode, parseRateInput } from "./exchange-rate-input";

describe("parseRateInput", () => {
  it("treats empty as not entered", () => {
    expect(parseRateInput("  ")).toEqual({ ok: true });
  });

  it("accepts dot and comma decimals up to six places", () => {
    expect(parseRateInput("1.04")).toEqual({ ok: true, value: "1.04" });
    expect(parseRateInput("0,2315")).toEqual({ ok: true, value: "0.2315" });
    expect(parseRateInput("4.123456")).toEqual({ ok: true, value: "4.123456" });
  });

  it("rejects what is not a usable rate", () => {
    for (const bad of ["abc", "0", "0.0", "-1", "1.1234567", "100000", "1,2,3", "€1"]) {
      expect(parseRateInput(bad).ok).toBe(false);
    }
  });
});

describe("parseCurrencyCode", () => {
  it("upper-cases three letters and refuses the rest", () => {
    expect(parseCurrencyCode(" chf ")).toBe("CHF");
    for (const bad of ["", "eu", "euro", "12a", "zł"]) {
      expect(parseCurrencyCode(bad)).toBeUndefined();
    }
  });
});
