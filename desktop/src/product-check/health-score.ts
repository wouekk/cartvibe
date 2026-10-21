import { describeAdditives } from "./e-additives";
import { CheckedProduct, NutriScore } from "./product-check.models";

/** What each Nutri-Score letter is worth on the 0-100 scale; a product without one counts as the middle. */
const NUTRI_SCORE_POINTS: Record<NutriScore, number> = { a: 100, b: 80, c: 60, d: 40, e: 20 };

/** What each NOVA group is worth: unprocessed foods score best, ultra-processed ones worst. */
const NOVA_POINTS: Record<1 | 2 | 3 | 4, number> = { 1: 100, 2: 80, 3: 50, 4: 20 };

const UNKNOWN_POINTS = 50;

/** The Nutri-Score (what is in the food) weighs more than NOVA (how it was made). They add up to 1. */
const NUTRI_SCORE_WEIGHT = 0.6;
const NOVA_WEIGHT = 0.4;

/** Taken off for each additive: a banned or restricted one costs more than one with an intake warning. */
const HIGH_RISK_PENALTY = 15;
const MODERATE_RISK_PENALTY = 5;

export type HealthTone = "good" | "fair" | "poor";

/**
 * A 0-100 reading of a product: 60% Nutri-Score, 40% NOVA group (a missing one counts as 50), minus 15 for every
 * high-risk additive and 5 for every moderate one, kept between 0 and 100. A quick guide for the aisle, not a
 * medical rating.
 */
export function computeHealthScore(product: Pick<CheckedProduct, "nutriScore" | "nova" | "additiveTags">): number {
  const nutri = product.nutriScore ? NUTRI_SCORE_POINTS[product.nutriScore] : UNKNOWN_POINTS;
  const nova = product.nova ? NOVA_POINTS[product.nova] : UNKNOWN_POINTS;

  let score = nutri * NUTRI_SCORE_WEIGHT + nova * NOVA_WEIGHT;

  for (const additive of describeAdditives(product.additiveTags)) {
    if (additive.risk === "high") {
      score -= HIGH_RISK_PENALTY;
    } else if (additive.risk === "moderate") {
      score -= MODERATE_RISK_PENALTY;
    }
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function healthTone(score: number): HealthTone {
  if (score >= 70) {
    return "good";
  }

  return score >= 45 ? "fair" : "poor";
}
