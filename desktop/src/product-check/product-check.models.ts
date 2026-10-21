export type NutriScore = "a" | "b" | "c" | "d" | "e";

/** Open Food Facts' traffic light for one nutrient. */
export type NutrientLevel = "low" | "moderate" | "high";

export interface ProductNutrition {
  /** Everything per 100 g; null when Open Food Facts has no figure. */
  energyKcal: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  salt: number | null;
  fiber: number | null;
  proteins: number | null;
}

export interface ProductNutrientLevels {
  sugars: NutrientLevel | null;
  saturatedFat: NutrientLevel | null;
  salt: NutrientLevel | null;
  fat: NutrientLevel | null;
}

/**
 * The few fields of an Open Food Facts product this app shows. It is also what the recent scans keep, so it stays small and
 * plain JSON; the health score and the additive details are worked out from it when shown.
 */
export interface CheckedProduct {
  code: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  nutriScore: NutriScore | null;
  /** 1 (unprocessed) to 4 (ultra-processed). */
  nova: 1 | 2 | 3 | 4 | null;
  /** Open Food Facts tags such as "en:e330". */
  additiveTags: string[];
  nutrition: ProductNutrition;
  levels: ProductNutrientLevels;
}
