import { Component, signal } from "@angular/core";

export interface AccentTheme {
  key: string;
  label: string;
  color: string;
}

/** The choices, with the values `index.html` defines as `--accent-color` for each `data-accent`. */
export const ACCENT_THEMES: AccentTheme[] = [
  { key: "blue", label: "Ocean Blue", color: "#0071e3" },
  { key: "green", label: "Alpine Green", color: "#248a3d" },
  { key: "amber", label: "Sunset Amber", color: "#d97706" },
  { key: "indigo", label: "Royal Indigo", color: "#5856d6" },
];

export const ACCENT_STORAGE_KEY = "rw_accent_theme";

const DEFAULT_ACCENT = "blue";

function storedAccent(): string {
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return ACCENT_THEMES.some((theme) => theme.key === stored) ? (stored as string) : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * Four dots that switch the accent color of the whole app. The choice is a `data-accent` attribute on
 * `<html>` (index.html turns it into the `--accent-*` variables) and is kept in localStorage, which
 * index.html also reads before the first paint, so it needs no backend and never flashes.
 */
@Component({
  selector: "app-accent-picker",
  standalone: true,
  template: `
    <div
      class="picker tw-inline-flex tw-items-center tw-gap-1.5 tw-rounded-full tw-border tw-border-zinc-200/80 tw-bg-white/80 tw-p-1 tw-shadow-sm tw-backdrop-blur-md dark:tw-border-zinc-800/80 dark:tw-bg-zinc-900/80"
      role="group"
      aria-label="Accent color"
      data-testid="accent-picker"
    >
      @for (theme of themes; track theme.key) {
        <button
          type="button"
          class="picker__dot"
          [style.background]="theme.color"
          [style.color]="theme.color"
          [attr.aria-label]="theme.label"
          [attr.aria-pressed]="active() === theme.key"
          [attr.data-testid]="'accent-' + theme.key"
          [title]="theme.label"
          (click)="select(theme.key)"
        ></button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .picker {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        border-radius: 9999px;
        border: 1px solid rgba(228, 228, 231, 0.8);
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0 1px 2px rgba(24, 24, 27, 0.06);
      }

      @media (prefers-color-scheme: dark) {
        .picker {
          border-color: rgba(39, 39, 42, 0.8);
          background: rgba(24, 24, 27, 0.8);
        }
      }

      .picker__dot {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.2s ease;

        &:hover {
          transform: scale(1.12);
        }

        &:active {
          transform: scale(0.95);
        }

        &:focus-visible {
          outline: 2px solid var(--accent-color);
          outline-offset: 2px;
        }

        &[aria-pressed="true"] {
          box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;
        }
      }
    `,
  ],
})
export class AccentPickerComponent {
  public readonly themes = ACCENT_THEMES;

  public readonly active = signal(storedAccent());

  public select(key: string): void {
    this.active.set(key);
    document.documentElement.setAttribute("data-accent", key);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, key);
    } catch {
      // Private mode or blocked storage: the choice holds for this visit only.
    }
  }
}
