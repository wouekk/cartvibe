import {
  RECIPE_MULTIPLIERS,
  extractRecipeUrl,
  formatQuantity,
  isHttpUrl,
  normalizeItemName,
  openItemNames,
  parseQuantity,
  scaleQuantity,
  servingsMultiplier,
} from "./recipe-scaling";

describe("recipe scaling", () => {
  it("offers 0.5×, 1×, 1.5×, 2× and 3×", () => {
    expect(RECIPE_MULTIPLIERS).toEqual([0.5, 1, 1.5, 2, 3]);
  });

  describe("scaleQuantity", () => {
    const cases: [number, number, number][] = [
      [200, 0.5, 100],
      [200, 1, 200],
      [200, 1.5, 300],
      [200, 2, 400],
      [200, 3, 600],
      [1, 0.5, 0.5],
      [1, 1.5, 1.5],
      [0.25, 3, 0.75],
      [1.75, 2, 3.5],
      [2.5, 1.5, 3.75],
      [0.1, 0.5, 0.05],
      [1.333, 1.5, 2],
      // thirds that were stored rounded (⅓ → 0.33, ⅔ → 0.67) snap back to a whole number or a half
      [0.33, 3, 1],
      [0.67, 3, 2],
      [1.33, 3, 4],
      [0.33, 1.5, 0.5],
      [0.67, 1.5, 1],
      [0.33, 1, 0.33],
      [0.67, 1, 0.67],
      [0.33, 2, 0.66],
      [0.67, 2, 1.34],
      [0.33, 0.5, 0.17],
    ];
    for (const [base, multiplier, expected] of cases) {
      it(`${base} × ${multiplier} = ${expected}`, () => {
        expect(scaleQuantity(base, multiplier)).toBe(expected);
      });
    }

    it("leaves a row without a quantity alone", () => {
      expect(scaleQuantity(null, 3)).toBeNull();
      expect(scaleQuantity(0, 3)).toBeNull();
      expect(scaleQuantity(-1, 3)).toBeNull();
    });

    it("never exceeds what the API accepts", () => {
      expect(scaleQuantity(90000, 3)).toBeLessThan(100000);
    });

    it("scales from the base, so going back to 1× restores it exactly", () => {
      const base = 0.33;
      expect(scaleQuantity(base, 3)).toBe(1);
      expect(scaleQuantity(base, 1)).toBe(0.33);
    });
  });

  it("prints no trailing zeros", () => {
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(3)).toBe("3");
    expect(formatQuantity(0.33)).toBe("0.33");
    expect(formatQuantity(2.5)).toBe("2.5");
    expect(formatQuantity(1.1 + 2.2)).toBe("3.3");
    expect(formatQuantity(null)).toBe("");
  });

  it("reads a quantity from the API's decimal string", () => {
    expect(parseQuantity("200")).toBe(200);
    expect(parseQuantity("0.33")).toBe(0.33);
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
  });

  it("turns servings into a multiplier", () => {
    expect(servingsMultiplier(6, 4)).toBe(1.5);
    expect(servingsMultiplier(2, 4)).toBe(0.5);
    expect(servingsMultiplier(4, 4)).toBe(1);
    expect(servingsMultiplier(8, 0)).toBe(1);
    expect(servingsMultiplier(0, 4)).toBe(1);
  });

  it("compares names the way the API does", () => {
    expect(normalizeItemName("  Mąka   Pszenna ")).toBe("mąka pszenna");
    expect(normalizeItemName("ŻUREK")).toBe(normalizeItemName("żurek"));
  });

  it("collects only the names still to buy", () => {
    const names = openItemNames([
      { name: "Milk ", isChecked: false },
      { name: "Eggs", isChecked: true },
      { name: "dark  chocolate", isChecked: false },
    ]);
    expect([...names].sort()).toEqual(["dark chocolate", "milk"]);
  });

  describe("extractRecipeUrl", () => {
    it("finds the link in a shared text with a title", () => {
      expect(extractRecipeUrl("Best pancakes ever https://example.com/pancakes?id=3")).toBe(
        "https://example.com/pancakes?id=3"
      );
    });

    it("drops punctuation that follows a link", () => {
      expect(extractRecipeUrl("See https://example.com/x.")).toBe("https://example.com/x");
      expect(extractRecipeUrl("(https://example.com/x)")).toBe("https://example.com/x");
    });

    it("returns null when there is no link", () => {
      expect(extractRecipeUrl("just words")).toBeNull();
      expect(extractRecipeUrl("")).toBeNull();
      expect(extractRecipeUrl(null)).toBeNull();
      expect(extractRecipeUrl("ftp://example.com/x")).toBeNull();
    });
  });

  it("accepts only http(s) addresses", () => {
    expect(isHttpUrl("https://www.allrecipes.com/recipe/1/")).toBe(true);
    expect(isHttpUrl(" http://example.com ")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});
