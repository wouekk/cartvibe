import { allocateToReceipt } from "./overview";

describe("demo allocateToReceipt", () => {
  it("keeps lines that fit inside the receipt and leaves the rest", () => {
    expect(allocateToReceipt(1000, [300, 200])).toEqual({ shares: [300, 200], rest: 500 });
  });

  it("scales lines that add up to more than the receipt, so the shares add up to it exactly", () => {
    const { shares, rest } = allocateToReceipt(1000, [600, 600, 300]);

    expect(rest).toBe(0);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1000);
    expect(shares).toEqual([400, 400, 200]);
  });

  it("gives leftover cents to the largest remainders, ties to the earlier line", () => {
    expect(allocateToReceipt(2, [1, 1, 1])).toEqual({ shares: [1, 1, 0], rest: 0 });
  });

  it("divides a refund in proportion to its lines", () => {
    const { shares, rest } = allocateToReceipt(-500, [300, 200]);

    expect(rest).toBe(0);
    expect(shares).toEqual([-300, -200]);
  });

  it("leaves the whole amount as rest when there are no priced lines", () => {
    expect(allocateToReceipt(750, [])).toEqual({ shares: [], rest: 750 });
  });
});
