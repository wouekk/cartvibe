import { splitMoney } from "./split-money";

describe("splitMoney", () => {
  it("keeps the whole part and quiets the symbol and the decimals", () => {
    expect(splitMoney("$725.10")).toEqual({ prefix: "$", integer: "725", fraction: ".10", suffix: "" });
    expect(splitMoney("78,44 €")).toEqual({ prefix: "", integer: "78", fraction: ",44", suffix: " €" });
  });

  it("reads thousands separators as part of the whole", () => {
    expect(splitMoney("$1,234.50").integer).toBe("1,234");
    expect(splitMoney("1.234,50 €")).toEqual({ prefix: "", integer: "1.234", fraction: ",50", suffix: " €" });
    expect(splitMoney("1,234 zł").fraction).toBe("");
  });

  it("handles a negative amount and a missing fraction", () => {
    expect(splitMoney("$-10,000.00")).toEqual({ prefix: "$", integer: "-10,000", fraction: ".00", suffix: "" });
    expect(splitMoney("12 €")).toEqual({ prefix: "", integer: "12", fraction: "", suffix: " €" });
  });

  it("returns text that is not an amount as it is", () => {
    expect(splitMoney("–")).toEqual({ prefix: "–", integer: "", fraction: "", suffix: "" });
  });
});
