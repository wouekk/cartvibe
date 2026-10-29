/** The theme tokens a chart needs, resolved to concrete colors (a canvas cannot read CSS variables). */
export interface ChartColors {
  foreground: string;
  mutedForeground: string;
  border: string;
  muted: string;
  card: string;
  primary: string;
  destructive: string;
  /** --chart-1..5, then the muted tone for "Other": the category palette of the active theme. */
  series: string[];
}

const TOKENS: Record<Exclude<keyof ChartColors, "series">, string> = {
  foreground: "--foreground",
  mutedForeground: "--muted-foreground",
  border: "--border",
  muted: "--muted",
  card: "--card",
  primary: "--primary",
  destructive: "--destructive",
};

/** Resolves any CSS color (oklch included) to `rgb(r, g, b)` / `rgba(...)` by painting one pixel. */
export function toRgb(css: string, fallback = "rgb(128, 128, 128)"): string {
  try {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) {
      return fallback;
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    if (a === 0) {
      return fallback;
    }
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  } catch {
    return fallback;
  }
}

/** Reads the active theme's tokens from the page, so a chart follows light and dark. */
export function readChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const colors = { series: [] } as unknown as ChartColors;
  for (const key of Object.keys(TOKENS) as (keyof typeof TOKENS)[]) {
    colors[key] = toRgb(style.getPropertyValue(TOKENS[key]).trim() || "gray");
  }
  colors.series = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--muted-foreground"].map((name) =>
    toRgb(style.getPropertyValue(name).trim() || "gray")
  );
  return colors;
}
