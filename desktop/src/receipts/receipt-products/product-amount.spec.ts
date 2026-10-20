import { parseAmountInput } from "./product-amount";

describe("parseAmountInput", () => {
  it("treats empty as no price", () => {
    expect(parseAmountInput("  ")).toEqual({ ok: true });
  });

  it("accepts dot and comma decimals and a negative", () => {
    expect(parseAmountInput("1.09")).toEqual({ ok: true, value: "1.09" });
    expect(parseAmountInput("1,09")).toEqual({ ok: true, value: "1.09" });
    expect(parseAmountInput("-3,5")).toEqual({ ok: true, value: "-3.5" });
    expect(parseAmountInput("4")).toEqual({ ok: true, value: "4" });
  });

  it("rejects what is not a price", () => {
    for (const bad of ["abc", "1.234", "1,2,3", "€5", "1.", ".5"]) {
      expect(parseAmountInput(bad).ok).toBe(false);
    }
  });
});
