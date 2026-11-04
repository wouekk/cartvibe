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

export const GROUP_COLORS: readonly GroupLookChoice[] = [
  { key: "slate", label: marker("Slate") },
  { key: "red", label: marker("Red") },
  { key: "orange", label: marker("Orange") },
  { key: "amber", label: marker("Amber") },
  { key: "green", label: marker("Green") },
  { key: "teal", label: marker("Teal") },
  { key: "blue", label: marker("Blue") },
  { key: "indigo", label: marker("Indigo") },
  { key: "violet", label: marker("Violet") },
  { key: "pink", label: marker("Pink") },
];

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
    foreground: color === "amber" ? "var(--household-amber-foreground)" : "var(--household-foreground)",
  };
}
