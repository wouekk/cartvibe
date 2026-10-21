import { CheckedProduct } from "./product-check.models";

/** A product for specs: Nutella-like, with two additives of different risk. */
export function sampleProduct(overrides: Partial<CheckedProduct> = {}): CheckedProduct {
  return {
    code: "3017620422003",
    name: "Nutella",
    brand: "Ferrero",
    imageUrl: null,
    nutriScore: "e",
    nova: 4,
    additiveTags: ["en:e322", "en:e250"],
    nutrition: { energyKcal: 539, sugars: 56.3, saturatedFat: 10.6, salt: 0.107, fiber: null, proteins: 6.3 },
    levels: { sugars: "high", saturatedFat: "high", salt: "low", fat: "high" },
    ...overrides,
  };
}
