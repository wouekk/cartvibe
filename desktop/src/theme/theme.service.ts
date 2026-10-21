import { Injectable, signal } from "@angular/core";
import { findTheme, SYSTEM_THEME_KEYS, ThemeScheme } from "./themes";

/** "system" follows the operating system; anything else is the key of a theme in the registry (themes.ts). */
export type ThemeMode = string;

export const SYSTEM_MODE = "system";

export const THEME_MODE_STORAGE_KEY = "rw_theme_mode";

/** The scheme of the stored theme, kept beside it so index.html can set the `dark` class before the first paint. */
export const THEME_SCHEME_STORAGE_KEY = "rw_theme_scheme";

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

/** The stored choice: "system", or a registered theme's key. Anything else (a removed theme, junk) is "system". */
export function storedMode(): ThemeMode {
  const stored = read(THEME_MODE_STORAGE_KEY);
  return stored && findTheme(stored) ? stored : SYSTEM_MODE;
}

/**
 * The look of the app. The choice is per browser (localStorage), needs no backend, and writes what the CSS reads:
 * `data-theme="<key>"` on `<html>` (which selects the theme's tokens in src/themes) and the `dark` class when the
 * theme is a dark one. index.html applies the stored choice before the first paint; this service keeps it in step
 * afterwards, including when the system switches while "System" is chosen.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  public readonly mode = signal<ThemeMode>(storedMode());

  private readonly query =
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;

  constructor() {
    this.query?.addEventListener?.("change", () => this.apply());
    this.apply();
  }

  public setMode(mode: ThemeMode): void {
    const next = mode === SYSTEM_MODE || findTheme(mode) ? mode : SYSTEM_MODE;
    this.mode.set(next);
    write(THEME_MODE_STORAGE_KEY, next);
    this.apply();
  }

  /** The key of the theme showing right now. */
  public activeThemeKey(): string {
    const mode = this.mode();
    if (mode !== SYSTEM_MODE) {
      return mode;
    }

    return SYSTEM_THEME_KEYS[this.query?.matches ? "dark" : "light"];
  }

  /** Whether the page is dark right now. */
  public isDark(): boolean {
    return this.scheme() === "dark";
  }

  private scheme(): ThemeScheme {
    return findTheme(this.activeThemeKey())?.scheme ?? "light";
  }

  private apply(): void {
    const root = document.documentElement;
    const key = this.activeThemeKey();
    const scheme = this.scheme();
    root.setAttribute("data-theme", key);
    root.classList.toggle("dark", scheme === "dark");
    write(THEME_SCHEME_STORAGE_KEY, scheme);
  }
}
