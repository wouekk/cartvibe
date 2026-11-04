/**
 * How much larger than 16px the root font is: 1 below 1920px, growing with the window above it (tailwind.css scales
 * the whole interface on wide screens). A canvas does not follow CSS, so chart text multiplies its pixel sizes by this.
 */
export function uiScale(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return 1;
  }
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size / 16 : 1;
}

/** A chart font size in pixels, scaled like the rest of the interface (`size` is what it is at 16px). */
export function chartFontSize(size: number): number {
  return Math.round(size * uiScale() * 10) / 10;
}
