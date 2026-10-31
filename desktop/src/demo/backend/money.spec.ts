import { averageCents, formatCents, parseCents, sumCents } from "./money";

describe("demo money", () => {
  it("reads decimal strings into whole cents without floats", () => {
    expect(parseCents("12.50")).toBe(1250);
    expect(parseCents("12,5")).toBe(1250);
    expect(parseCents("0.07")).toBe(7);
    expect(parseCents("-3")).toBe(-300);
    expect(parseCents("1.005")).toBe(101);
    expect(parseCents("")).toBe(0);
    expect(parseCents("abc")).toBe(0);
    expect(parseCents(undefined)).toBe(0);
  });

  it("writes cents back as a two-decimal string", () => {
    expect(formatCents(1250)).toBe("12.50");
    expect(formatCents(7)).toBe("0.07");
    expect(formatCents(-5)).toBe("-0.05");
    expect(formatCents(0)).toBe("0.00");
  });

  it("adds exactly where floats would drift", () => {
    expect(formatCents(sumCents(["0.10", "0.20"]))).toBe("0.30");
    expect(formatCents(sumCents(["1.19", "2.49", "3.20", "6.99", "1.35", "1.89", "1.79", "2.45"]))).toBe("21.35");
  });

  it("averages to whole cents", () => {
    expect(averageCents(1000, 3)).toBe(333);
    expect(averageCents(0, 0)).toBe(0);
  });
});
