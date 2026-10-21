import { Injectable, signal } from "@angular/core";

export type ThemeMode = "system" | "light" | "dark";

export interface AccentTheme {
  key: string;
  label: string;
  /** The swatch color (the accent on a light page). */
  color: string;
}

/**
 * The accents, with the values index.html defines as `--accent-color` for each `data-accent`. None is orange:
 * a calm default blue, an emerald, a restrained violet (easy on OLED), a walnut brown and a graphite gray.
 */
export const ACCENT_THEMES: AccentTheme[] = [
  { key: "classic", label: "Classic Blue", color: "#0086d4" },
  { key: "emerald", label: "Alpine Emerald", color: "#059669" },
  { key: "violet", label: "Twilight Violet", color: "#6457d3" },
  { key: "brown", label: "Walnut Brown", color: "#8b5e3c" },
  { key: "graphite", label: "Graphite Gray", color: "#475569" },
];

export const DEFAULT_ACCENT = "classic";

export const THEME_MODE_STORAGE_KEY = "rw_theme_mode";

export const ACCENT_STORAGE_KEY = "rw_accent_theme";

/** Accent keys an earlier build stored, mapped to today's. */
const LEGACY_ACCENTS: Record<string, string> = { blue: "classic", green: "emerald", amber: "classic", indigo: "violet" };

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

export function storedAccent(): string {
  const stored = read(ACCENT_STORAGE_KEY) ?? "";
  const mapped = LEGACY_ACCENTS[stored] ?? stored;
  return ACCENT_THEMES.some((theme) => theme.key === mapped) ? mapped : DEFAULT_ACCENT;
}

export function storedMode(): ThemeMode {
  const stored = read(THEME_MODE_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * The look of the app: light, dark or the system's, and the accent color. It is per browser (localStorage),
 * needs no backend, and writes what the CSS reads: the `dark` class and `data-theme` on `<html>`, and
 * `data-accent`. index.html applies the stored choice before the first paint; this service keeps it in step
 * afterwards, including when the system switches while "System" is chosen.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  public readonly mode = signal<ThemeMode>(storedMode());

  public readonly accent = signal<string>(storedAccent());

  private readonly query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;

  constructor() {
    this.query?.addEventListener?.("change", () => this.apply());
    this.apply();
  }

  public setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    write(THEME_MODE_STORAGE_KEY, mode);
    this.apply();
  }

  public setAccent(key: string): void {
    this.accent.set(key);
    write(ACCENT_STORAGE_KEY, key);
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
    root.setAttribute("data-accent", this.accent());
  }
}
