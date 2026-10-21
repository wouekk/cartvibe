/**
 * The theme registry: the one list the app, the Theme settings and the early script in index.html read.
 *
 * A theme is a block of design tokens in src/themes/<key>.css selected by `[data-theme="<key>"]` (see
 * docs/themes.md). Registering it here is all the code a new theme needs: the Theme tab lists it, the choice is
 * remembered, and the components (which only read tokens) follow it.
 */
export type ThemeScheme = "light" | "dark";

export interface ThemeDefinition {
  /** Matches `[data-theme="<key>"]` in src/themes/<key>.css. */
  key: string;
  label: string;
  /** Whether the theme is a light or a dark page; "dark" also puts the `dark` class on <html> (Tailwind's `dark:`). */
  scheme: ThemeScheme;
  /** An icon (Material icon name) for the picker. */
  icon: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  { key: "light", label: "Light", scheme: "light", icon: "light_mode" },
  { key: "dark", label: "Dark", scheme: "dark", icon: "dark_mode" },
];

/** What "System" resolves to when the operating system asks for a light or a dark page. */
export const SYSTEM_THEME_KEYS: Record<ThemeScheme, string> = { light: "light", dark: "dark" };

export function findTheme(key: string | null | undefined): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.key === key);
}
