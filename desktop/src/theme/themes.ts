import { marker } from "../i18n/marker";
/**
 * The look of the app is two independent choices, both remembered per browser:
 *
 * - the **palette** (this file's `PALETTES`): a block of design tokens per palette in src/themes/<key>.css, selected by
 *   `[data-palette="<key>"]` on <html> (see docs/themes.md);
 * - the **mode** (`MODE_OPTIONS`): day, night, or "system" (follow the operating system). Night puts the `dark` class on
 *   <html>, which is what the `dark:` variants and the tokens' night blocks key off.
 *
 * Registering a palette here is all the code it needs: the header menu, the Theme page and the welcome list it, and the
 * components (which only read tokens) follow it.
 */
export type ThemeScheme = "light" | "dark";

/** "system" follows the operating system; "light" is day and "dark" is night (the stored values predate palettes). */
export type ThemeMode = "system" | ThemeScheme;

export const SYSTEM_MODE: ThemeMode = "system";

export interface PaletteDefinition {
  /** Matches `[data-palette="<key>"]` in src/themes/<key>.css. */
  key: string;
  label: string;
}

export const PALETTES: readonly PaletteDefinition[] = [
  { key: "blue", label: marker("Blue") },
  { key: "zinc", label: marker("Zinc") },
  { key: "indigo", label: marker("Indigo") },
  { key: "emerald", label: marker("Emerald") },
  { key: "violet", label: marker("Violet") },
];

/** Zinc is the look CartVibe shipped with, and what the page shows before a palette is applied. */
export const DEFAULT_PALETTE = "zinc";

export function findPalette(key: string | null | undefined): PaletteDefinition | undefined {
  return PALETTES.find((palette) => palette.key === key);
}

export interface ModeOption {
  mode: ThemeMode;
  label: string;
  /** An icon (Material icon name) for the picker. */
  icon: string;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  { mode: "system", label: marker("System"), icon: "contrast" },
  { mode: "light", label: marker("Day"), icon: "light_mode" },
  { mode: "dark", label: marker("Night"), icon: "dark_mode" },
];

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return MODE_OPTIONS.some((option) => option.mode === value);
}
