/** The quick multipliers offered above the preview. */
export const RECIPE_MULTIPLIERS: readonly number[] = [0.5, 1, 1.5, 2, 3];

/** Within this of a whole number or a half, a scaled value is taken to be that number (0.33 × 3 = 0.99 → 1). */
const SNAP_TOLERANCE = 0.02;

/** The API refuses an amount of 100000 or more. */
const MAX_AMOUNT = 99999.99;

/** A quantity as the preview carries it: a decimal string from the API, or none. */
export function parseQuantity(quantity: string | null | undefined): number | null {
  if (quantity === null || quantity === undefined || quantity === "") {
    return null;
  }

  const value = Number(quantity);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The quantity for a multiplier. A row with no quantity ("salt to taste") stays without one. Thirds snap to the
 * nearest whole or half when within 0.02 of it; anything else is rounded to two places, with no trailing zeros once
 * printed. The base quantity is never changed: scaling is always from it, so 3× then 1× returns exactly the original.
 */
export function scaleQuantity(base: number | null, multiplier: number): number | null {
  if (base === null || !(base > 0)) {
    return null;
  }

  let value = base * multiplier;
  const nearestHalf = Math.round(value * 2) / 2;
  if (nearestHalf > 0 && Math.abs(value - nearestHalf) <= SNAP_TOLERANCE + 1e-9) {
    value = nearestHalf;
  }

  value = Math.round(value * 100) / 100;
  return Math.min(value, MAX_AMOUNT);
}

/** "1.5", "3", "0.33": no trailing zeros, never an exponent. */
export function formatQuantity(value: number | null): string {
  return value === null ? "" : String(Math.round(value * 100) / 100);
}

/** Changing the servings changes the multiplier: cooking for 6 from a recipe for 4 is 1.5×. */
export function servingsMultiplier(targetServings: number, baseServings: number): number {
  if (!(baseServings > 0) || !(targetServings > 0)) {
    return 1;
  }

  return targetServings / baseServings;
}

/**
 * The key two item names are compared under: trimmed, lower-case, single spaces. The API merges rows under the same
 * rule (`recipeimport.NormalizeName`), so the "On list" badge predicts what the import will do.
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/** The names of the open (not crossed-off) items on a list, normalised. */
export function openItemNames(items: readonly { name: string; isChecked: boolean }[]): Set<string> {
  return new Set(items.filter((item) => !item.isChecked).map((item) => normalizeItemName(item.name)));
}

/**
 * The first http(s) link in shared text. Phones often put the page address in the shared "text" together with the
 * page title, so a share target cannot rely on the `url` field alone.
 */
export function extractRecipeUrl(text: string | null | undefined): string | null {
  const match = /https?:\/\/[^\s<>"'`]+/i.exec(text ?? "");
  if (!match) {
    return null;
  }

  // A link at the end of a sentence or inside brackets does not own the punctuation after it.
  return match[0].replace(/[.,;:!?)\]}>]+$/, "");
}

/** True for a plain http(s) address, the only kind the API will fetch. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
