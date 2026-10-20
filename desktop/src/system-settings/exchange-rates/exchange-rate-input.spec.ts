import { formatRate, parseCurrencyCode, parseRateInput, sanitizeRateInput, settleRateInput } from "./exchange-rate-input";

describe("parseRateInput", () => {
  it("treats empty as not entered", () => {
    expect(parseRateInput("  ")).toEqual({ ok: true });
  });

  it("accepts dot and comma decimals up to six places", () => {
    expect(parseRateInput("1.04")).toEqual({ ok: true, value: "1.04" });
    expect(parseRateInput("0,2315")).toEqual({ ok: true, value: "0.2315" });
    expect(parseRateInput("4.123456")).toEqual({ ok: true, value: "4.123456" });
  });

  it("accepts a number left with a trailing or leading mark", () => {
    expect(parseRateInput("1.")).toEqual({ ok: true, value: "1" });
    expect(parseRateInput(".5")).toEqual({ ok: true, value: "0.5" });
    expect(parseRateInput("0,")).toEqual({ ok: false });
  });

  it("rejects what is not a usable rate", () => {
    for (const bad of ["abc", "0", "0.0", "-1", "1.1234567", "100000", "1,2,3", "1.2,3", "€1", ".", ","]) {
      expect(parseRateInput(bad).ok).toBe(false);
    }
  });
});

describe("sanitizeRateInput", () => {
  it("turns a comma into a dot and keeps a half-typed number as it is", () => {
    expect(sanitizeRateInput("1,0")).toBe("1.0");
    expect(sanitizeRateInput("0.")).toBe("0.");
    expect(sanitizeRateInput("0,")).toBe("0.");
    expect(sanitizeRateInput(".")).toBe(".");
    expect(sanitizeRateInput("")).toBe("");
  });

  it("drops letters, signs and a second mark, and caps the digits", () => {
    expect(sanitizeRateInput("1a.0€5")).toBe("1.05");
    expect(sanitizeRateInput("-3")).toBe("3");
    expect(sanitizeRateInput("1.2.3")).toBe("1.23");
    expect(sanitizeRateInput("1,2,3")).toBe("1.23");
    expect(sanitizeRateInput("123456")).toBe("12345");
    expect(sanitizeRateInput("1.12345678")).toBe("1.123456");
  });
});

describe("settleRateInput", () => {
  it("finishes a number the person stopped typing", () => {
    expect(settleRateInput("1.")).toBe("1");
    expect(settleRateInput(".5")).toBe("0.5");
    expect(settleRateInput("0,25")).toBe("0.25");
    expect(settleRateInput(" . ")).toBe("");
    expect(settleRateInput("")).toBe("");
  });
});

describe("formatRate", () => {
  it("drops the zeros the database pads a rate with", () => {
    expect(formatRate("1.040000")).toBe("1.04");
    expect(formatRate("2.000000")).toBe("2");
    expect(formatRate("0.2315")).toBe("0.2315");
    expect(formatRate("3")).toBe("3");
    expect(formatRate(undefined)).toBe("");
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
