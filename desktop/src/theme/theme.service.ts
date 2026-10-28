import { computed, Injectable, signal } from "@angular/core";
import { DEFAULT_PALETTE, findPalette, isThemeMode, SYSTEM_MODE, ThemeMode } from "./themes";

/** "system", "light" (day) or "dark" (night). The same key and values as before palettes existed. */
export const THEME_MODE_STORAGE_KEY = "rw_theme_mode";

/** The key of a palette in the registry (themes.ts). */
export const THEME_PALETTE_STORAGE_KEY = "rw_theme_palette";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice holds for this visit only.
  }
}

/** The stored mode; anything else (a removed value, junk) is "system". */
export function storedMode(): ThemeMode {
  const stored = read(THEME_MODE_STORAGE_KEY);
  return isThemeMode(stored) ? stored : SYSTEM_MODE;
}

/** The stored palette's key; anything unknown (a removed palette, junk) is the default. */
export function storedPalette(): string {
  const stored = read(THEME_PALETTE_STORAGE_KEY);
  return findPalette(stored) ? (stored as string) : DEFAULT_PALETTE;
}

/**
 * The look of the app. The choice is per browser (localStorage), needs no backend, and writes what the CSS reads:
 * `data-palette="<key>"` on `<html>` (which selects the palette's tokens in src/themes) and the `dark` class at night.
 * index.html applies the stored choice before the first paint; this service keeps it in step afterwards, including when
 * the system switches while "System" is chosen.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  public readonly mode = signal<ThemeMode>(storedMode());

  public readonly palette = signal<string>(storedPalette());

  private readonly query =
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;

  private readonly systemDark = signal(this.query?.matches ?? false);

  /** Whether the page is dark (night) right now; follows the mode and, on System, the operating system. */
  public readonly isDark = computed(() => {
    const mode = this.mode();
    return mode === SYSTEM_MODE ? this.systemDark() : mode === "dark";
  });

  constructor() {
    this.query?.addEventListener?.("change", () => {
      this.systemDark.set(this.query?.matches ?? false);
      this.apply();
    });
    this.apply();
  }

  public setMode(mode: ThemeMode): void {
    const next = isThemeMode(mode) ? mode : SYSTEM_MODE;
    this.mode.set(next);
    write(THEME_MODE_STORAGE_KEY, next);
    this.apply();
  }

  public setPalette(key: string): void {
    const next = findPalette(key) ? key : DEFAULT_PALETTE;
    this.palette.set(next);
    write(THEME_PALETTE_STORAGE_KEY, next);
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    root.setAttribute("data-palette", this.palette());
    root.classList.toggle("dark", this.isDark());
  }
}
