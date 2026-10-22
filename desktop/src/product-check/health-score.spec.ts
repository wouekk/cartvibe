import { describeAdditives, lookupAdditive } from "./e-additives";
import { computeHealthScore, healthTone } from "./health-score";

describe("computeHealthScore", () => {
  it("weighs Nutri-Score 60% and NOVA 40%", () => {
    expect(computeHealthScore({ nutriScore: "a", nova: 1, additiveTags: [] })).toBe(100);
    expect(computeHealthScore({ nutriScore: "e", nova: 4, additiveTags: [] })).toBe(20);
    expect(computeHealthScore({ nutriScore: "b", nova: 3, additiveTags: [] })).toBe(68);
  });

  it("counts a missing Nutri-Score or NOVA as the middle", () => {
    expect(computeHealthScore({ nutriScore: null, nova: null, additiveTags: [] })).toBe(50);
    expect(computeHealthScore({ nutriScore: "a", nova: null, additiveTags: [] })).toBe(80);
  });

  it("takes 15 off per high-risk and 5 off per moderate additive", () => {
    expect(computeHealthScore({ nutriScore: "a", nova: 1, additiveTags: ["en:e250"] })).toBe(85);
    expect(computeHealthScore({ nutriScore: "a", nova: 1, additiveTags: ["en:e250", "en:e171", "en:e407"] })).toBe(65);
    expect(computeHealthScore({ nutriScore: "a", nova: 1, additiveTags: ["en:e300"] })).toBe(100);
  });

  it("stays between 0 and 100", () => {
    const many = ["en:e250", "en:e251", "en:e252", "en:e171", "en:e123", "en:e128", "en:e924a"];
    expect(computeHealthScore({ nutriScore: "e", nova: 4, additiveTags: many })).toBe(0);
  });

  it("maps scores to tones", () => {
    expect(healthTone(100)).toBe("good");
    expect(healthTone(70)).toBe("good");
    expect(healthTone(69)).toBe("fair");
    expect(healthTone(45)).toBe("fair");
    expect(healthTone(44)).toBe("poor");
  });
});

describe("e-additives", () => {
  it("knows a plain code", () => {
    expect(lookupAdditive("en:e250")).toEqual({ code: "E250", name: "Sodium nitrite", category: "Preservative", risk: "high" });
    expect(lookupAdditive("en:e300").risk).toBe("safe");
  });

  it("falls back from a sub-variant to the lettered code, then the number", () => {
    expect(lookupAdditive("en:e150d").name).toBe("Sulphite ammonia caramel");
    expect(lookupAdditive("en:e322i").name).toBe("Lecithins");
    expect(lookupAdditive("en:e160aii").name).toBe("Carotenes");
  });

  it("reports an unknown code without a risk", () => {
    expect(lookupAdditive("en:e9999")).toEqual({ code: "E9999", name: "Unknown additive", category: null, risk: null });
  });

  it("sorts from highest to lowest risk and drops repeats", () => {
    const codes = describeAdditives(["en:e300", "en:e250", "en:e407", "en:e300", "en:e9999"]).map((a) => a.code);
    expect(codes).toEqual(["E250", "E407", "E9999", "E300"]);
  });
});
