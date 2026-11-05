import { marker } from "../i18n/marker";

/**
 * A household's look: an icon and a colour, picked on its edit page. Kept in step with the API's models.GroupIcons and
 * GroupColors (the server refuses anything else). "" is the default: the initial on the primary colour.
 */
export interface GroupLookChoice {
  key: string;
  label: string;
}

export const GROUP_ICONS: readonly GroupLookChoice[] = [
  { key: "home", label: marker("Home") },
  { key: "add_home", label: marker("New home") },
  { key: "apartment", label: marker("Building") },
  { key: "group", label: marker("People") },
  { key: "favorite", label: marker("Heart") },
  { key: "child_care", label: marker("Baby") },
  { key: "dog", label: marker("Dog") },
  { key: "cat", label: marker("Cat") },
  { key: "pets", label: marker("Paw") },
  { key: "directions_car", label: marker("Car") },
  { key: "flight", label: marker("Plane") },
  { key: "shopping_cart", label: marker("Shopping") },
  { key: "restaurant", label: marker("Food") },
  { key: "local_cafe", label: marker("Coffee") },
  { key: "work", label: marker("Work") },
  { key: "school", label: marker("School") },
  { key: "park", label: marker("Tree") },
  { key: "sunny", label: marker("Sun") },
  { key: "star", label: marker("Star") },
];

export interface ColorChoice extends GroupLookChoice {
  /**
   * The same colour as a fixed hex for a person's avatar (stored as hex, under a white initial): a deep shade of it,
   * light enough to tell apart and dark enough for the white letter.
   */
  hex: string;
}

/**
 * The colour menu of households and avatars, in one order: the two neutrals, then round the colour wheel from red to
 * rose, so the grid reads as a gradient. Every palette of Settings → Theme is in it (zinc, blue, indigo, emerald,
 * violet).
 */
export const GROUP_COLORS: readonly ColorChoice[] = [
  { key: "zinc", label: marker("Zinc"), hex: "#3f3f46" },
  { key: "slate", label: marker("Slate"), hex: "#475569" },
  { key: "red", label: marker("Red"), hex: "#dc2626" },
  { key: "orange", label: marker("Orange"), hex: "#c2410c" },
  { key: "amber", label: marker("Amber"), hex: "#b45309" },
  { key: "yellow", label: marker("Yellow"), hex: "#a16207" },
  { key: "lime", label: marker("Lime"), hex: "#4d7c0f" },
  { key: "green", label: marker("Green"), hex: "#15803d" },
  { key: "emerald", label: marker("Emerald"), hex: "#047857" },
  { key: "teal", label: marker("Teal"), hex: "#0f766e" },
  { key: "cyan", label: marker("Cyan"), hex: "#0e7490" },
  { key: "sky", label: marker("Sky"), hex: "#0369a1" },
  { key: "blue", label: marker("Blue"), hex: "#2563eb" },
  { key: "indigo", label: marker("Indigo"), hex: "#4f46e5" },
  { key: "violet", label: marker("Violet"), hex: "#7c3aed" },
  { key: "purple", label: marker("Purple"), hex: "#9333ea" },
  { key: "fuchsia", label: marker("Fuchsia"), hex: "#a21caf" },
  { key: "pink", label: marker("Pink"), hex: "#db2777" },
  { key: "rose", label: marker("Rose"), hex: "#e11d48" },
];

/** Light swatches that carry a dark mark by day (--household-light-foreground). */
const LIGHT_GROUP_COLORS = new Set(["amber", "yellow", "lime"]);

export function isGroupIcon(value: string | null | undefined): boolean {
  return !!value && GROUP_ICONS.some((icon) => icon.key === value);
}

export function isGroupColor(value: string | null | undefined): boolean {
  return !!value && GROUP_COLORS.some((color) => color.key === value);
}

/** The swatch's background and mark: CSS variables defined once in themes/zinc.css, day and night. */
export function groupColorStyle(color: string | null | undefined): { background: string; foreground: string } | null {
  if (!isGroupColor(color)) {
    return null;
  }
  return {
    background: `var(--household-${color})`,
    foreground: LIGHT_GROUP_COLORS.has(color!) ? "var(--household-light-foreground)" : "var(--household-foreground)",
  };
}
