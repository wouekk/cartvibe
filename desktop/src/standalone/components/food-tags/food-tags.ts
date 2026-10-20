/**
 * Health and seasonality tags as the API sends them: plain strings, never enums, so a value this
 * build does not know simply shows no tag.
 */
export interface FoodTagValues {
  health?: string;
  seasonality?: string;
}

export interface FoodTag {
  label: string;
  tone: "good" | "medium" | "bad" | "neutral";
  testId: string;
}

const HEALTH_TAGS: { [health: string]: FoodTag } = {
  HEALTHY: { label: "Healthy", tone: "good", testId: "food-tag-healthy" },
  MEDIUM: { label: "Medium", tone: "medium", testId: "food-tag-medium" },
  UNHEALTHY: { label: "Unhealthy", tone: "bad", testId: "food-tag-unhealthy" },
};

const SEASONALITY_TAGS: { [seasonality: string]: FoodTag } = {
  SEASONAL: { label: "Seasonal", tone: "good", testId: "food-tag-seasonal" },
  OUT_OF_SEASON: { label: "Imported", tone: "neutral", testId: "food-tag-imported" },
};

/** The tags to show: health first, then seasonality for produce. NOT_FOOD, UNKNOWN and "" show none. */
export function foodTagsOf(values: FoodTagValues): FoodTag[] {
  const tags: FoodTag[] = [];
  const health = HEALTH_TAGS[values.health ?? ""];
  if (health) {
    tags.push(health);
  }
  const seasonality = SEASONALITY_TAGS[values.seasonality ?? ""];
  if (seasonality) {
    tags.push(seasonality);
  }
  return tags;
}

/** The choices offered when a person corrects the tags. */
export const HEALTH_CHOICES: { value: string; label: string }[] = [
  { value: "HEALTHY", label: "Healthy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "UNHEALTHY", label: "Unhealthy" },
  { value: "NOT_FOOD", label: "Not food" },
];

export const SEASONALITY_CHOICES: { value: string; label: string }[] = [
  { value: "SEASONAL", label: "In season" },
  { value: "OUT_OF_SEASON", label: "Imported / out of season" },
  { value: "NOT_PRODUCE", label: "Not fresh produce" },
];
