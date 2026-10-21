import { Injectable, signal } from "@angular/core";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODE_STORAGE_KEY = "rw_theme_mode";

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

export function storedMode(): ThemeMode {
  const stored = read(THEME_MODE_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * The look of the app: spartan's light theme, its dark theme, or the system's. It is per browser (localStorage), needs
 * no backend, and writes what the CSS reads: the `dark` class and `data-theme` on `<html>`. index.html applies the
 * stored choice before the first paint; this service keeps it in step afterwards, including when the system switches
 * while "System" is chosen.
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
    this.mode.set(mode);
    write(THEME_MODE_STORAGE_KEY, mode);
    this.apply();
  }

  /** Whether the page is dark right now: chosen, or the system's when "System" is on. */
  public isDark(): boolean {
    const mode = this.mode();
    return mode === "dark" || (mode === "system" && !!this.query?.matches);
  }

  private apply(): void {
    const root = document.documentElement;
    const dark = this.isDark();
    root.classList.toggle("dark", dark);
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }
}
