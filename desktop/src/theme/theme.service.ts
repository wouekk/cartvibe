import { computed, Injectable, signal } from "@angular/core";
import { readStorageKey } from "../utils/storage-key-migration";
import {
  DEFAULT_INTERFACE_SIZE,
  DEFAULT_PALETTE,
  findInterfaceSize,
  findPalette,
  interfaceSizeForScreen,
  isThemeMode,
  SYSTEM_MODE,
  ThemeMode,
} from "./themes";

/** "system", "light" (day) or "dark" (night). */
export const THEME_MODE_STORAGE_KEY = "cartvibe.themeMode";

/** The key of a palette in the registry (themes.ts). */
export const THEME_PALETTE_STORAGE_KEY = "cartvibe.themePalette";

/** The interface size: "100", "125", "150" or "200" (a percentage of the browser's font size). */
export const INTERFACE_SIZE_STORAGE_KEY = "cartvibe.interfaceSize";

/** Reads a theme key, moving a value stored under its old upstream name first. */
function read(key: string): string | null {
  return readStorageKey(key);
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
 * The stored interface size. A browser that never chose one gets the size its screen had under the old
 * width-driven rule, stored at once so it no longer depends on the window; anything unknown is Standard.
 */
export function storedInterfaceSize(): string {
  const stored = read(INTERFACE_SIZE_STORAGE_KEY);
  if (findInterfaceSize(stored)) {
    return stored as string;
  }
  const screenWidth = typeof window !== "undefined" ? window.screen?.width ?? 0 : 0;
  const initial = stored === null ? interfaceSizeForScreen(screenWidth) : DEFAULT_INTERFACE_SIZE;
  if (initial !== DEFAULT_INTERFACE_SIZE) {
    write(INTERFACE_SIZE_STORAGE_KEY, initial);
  }
  return initial;
}

/**
 * The look of the app. The choice is per browser (localStorage), needs no backend, and writes what the CSS reads:
 * `data-palette="<key>"` on `<html>` (which selects the palette's tokens in src/themes), the `dark` class at night and
 * the root font size as a percentage (the interface size; nothing at Standard, so the browser's own size shows).
 * index.html applies the stored choice before the first paint; this service keeps it in step afterwards, including when
 * the system switches while "System" is chosen.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  public readonly mode = signal<ThemeMode>(storedMode());

  public readonly palette = signal<string>(storedPalette());

  public readonly interfaceSize = signal<string>(storedInterfaceSize());

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

  public setInterfaceSize(key: string): void {
    const next = findInterfaceSize(key) ? key : DEFAULT_INTERFACE_SIZE;
    this.interfaceSize.set(next);
    write(INTERFACE_SIZE_STORAGE_KEY, next);
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    root.setAttribute("data-palette", this.palette());
    root.classList.toggle("dark", this.isDark());
    const size = this.interfaceSize();
    root.style.fontSize = size === DEFAULT_INTERFACE_SIZE ? "" : `${size}%`;
  }
}
