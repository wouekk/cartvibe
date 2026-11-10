import { marker } from "../i18n/marker";
/**
 * The look of the app is two independent choices, both remembered per browser:
 *
 * - the **palette** (this file's `PALETTES`): a block of design tokens per palette in src/themes/<key>.css, selected by
 *   `[data-palette="<key>"]` on <html> (see docs/themes.md);
 * - the **mode** (`MODE_OPTIONS`): day, night, or "system" (follow the operating system). Night puts the `dark` class on
 *   <html>, which is what the `dark:` variants and the tokens' night blocks key off.
 *
 * A third choice, the **interface size** (`INTERFACE_SIZES`), scales everything by setting the root font size.
 *
 * Registering a palette here is all the code it needs: the Theme page and the welcome list it, and the
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
  { key: "zinc", label: marker("Zinc") },
  { key: "blue", label: marker("Blue") },
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

/** A step of the interface size: the percentage of the browser's own font size written on <html>. */
export interface InterfaceSize {
  /** The stored value, the percentage as text. */
  key: string;
  percent: number;
  label: string;
}

/**
 * The interface sizes (Settings, Theme). Percentages of the browser's font size, so browser zoom and the reader's own
 * default both still work; every size in the app is in rem and follows.
 */
export const INTERFACE_SIZES: readonly InterfaceSize[] = [
  { key: "100", percent: 100, label: marker("Standard") },
  { key: "125", percent: 125, label: marker("Large") },
  { key: "150", percent: 150, label: marker("Larger") },
  { key: "200", percent: 200, label: marker("Largest") },
];

export const DEFAULT_INTERFACE_SIZE = "100";

export function findInterfaceSize(key: string | null | undefined): InterfaceSize | undefined {
  return INTERFACE_SIZES.find((size) => size.key === key);
}

/**
 * The size a browser starts with when none was ever chosen: the largest step that does not exceed what the old
 * rule (root size = screen width / 120) gave this screen, so a 4K screen at 100% zoom keeps the size it had
 * (2560 wide: 125%, 3840 wide: 200%) and anything narrower than 1920 stays at Standard.
 */
export function interfaceSizeForScreen(screenWidth: number): string {
  const scale = (screenWidth / 1920) * 100;
  const fitting = INTERFACE_SIZES.filter((size) => size.percent <= scale);
  return fitting.length > 0 ? fitting[fitting.length - 1].key : DEFAULT_INTERFACE_SIZE;
}

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return MODE_OPTIONS.some((option) => option.mode === value);
}
