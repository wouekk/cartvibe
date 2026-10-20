import { Component, inject } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { ACCENT_THEMES, ThemeMode, ThemeService } from "../../theme/theme.service";

interface ModeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}

/**
 * User Settings → Theme: light, dark or the system's, and the accent color. Per browser, so it needs no
 * permission and no save: a choice applies at once and is remembered.
 */
@Component({
  selector: "app-theme-settings",
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="theme-page">
      <section class="card" data-testid="theme-mode-card" aria-labelledby="theme-mode-title">
        <h2 id="theme-mode-title">Theme</h2>
        <ul class="modes" role="radiogroup" aria-label="Theme">
          @for (option of modes; track option.mode) {
            <li>
              <button
                type="button"
                class="mode"
                role="radio"
                [attr.aria-checked]="theme.mode() === option.mode"
                [attr.data-testid]="'theme-mode-' + option.mode"
                [class.mode--active]="theme.mode() === option.mode"
                (click)="theme.setMode(option.mode)"
              >
                <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
                <span class="mode__label">{{ option.label }}</span>
                @if (theme.mode() === option.mode) {
                  <mat-icon class="mode__check" aria-hidden="true">check</mat-icon>
                }
              </button>
            </li>
          }
        </ul>

        <hr class="divider" />

        <h2 id="theme-accent-title">Accent</h2>
        <div class="swatches" role="radiogroup" aria-labelledby="theme-accent-title">
          @for (accent of accents; track accent.key) {
            <button
              type="button"
              class="swatch"
              role="radio"
              [style.background]="accent.color"
              [style.color]="accent.color"
              [attr.aria-label]="accent.label"
              [attr.aria-checked]="theme.accent() === accent.key"
              [attr.data-testid]="'theme-accent-' + accent.key"
              [class.swatch--active]="theme.accent() === accent.key"
              [title]="accent.label"
              (click)="theme.setAccent(accent.key)"
            ></button>
          }
        </div>
        <p class="hint" data-testid="theme-accent-name">{{ activeAccentLabel() }}</p>
      </section>
    </div>
  `,
  styles: [
    `
      .theme-page {
        max-width: 640px;
      }

      .card {
        padding: 24px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }

      h2 {
        margin: 0 0 12px;
        font-size: 17px;
        font-weight: 600;
      }

      .modes {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mode {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 44px;
        padding: 0 12px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s ease;

        &:hover {
          background: var(--accent-soft, rgba(0, 134, 212, 0.12));
        }

        &:focus-visible {
          outline: 2px solid var(--accent-color, #0086d4);
          outline-offset: 2px;
        }
      }

      .mode--active {
        background: var(--accent-soft, rgba(0, 134, 212, 0.12));
        font-weight: 600;
      }

      .mode__label {
        flex: 1;
      }

      .mode__check {
        color: var(--accent-color, #0086d4);
      }

      .divider {
        margin: 16px 0;
        border: 0;
        border-top: 1px solid rgba(148, 163, 184, 0.35);
      }

      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        padding: 4px 2px;
      }

      .swatch {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.2s ease;

        &:hover {
          transform: scale(1.08);
        }

        &:focus-visible {
          outline: 2px solid var(--accent-color, #0086d4);
          outline-offset: 3px;
        }
      }

      .swatch--active {
        box-shadow: 0 0 0 3px #fff, 0 0 0 5px currentColor;
      }

      .hint {
        margin: 12px 0 0;
        font-size: 13px;
        opacity: 0.75;
      }
    `,
  ],
})
export class ThemeSettingsComponent {
  public readonly theme = inject(ThemeService);

  public readonly modes: ModeOption[] = [
    { mode: "system", label: "System", icon: "settings_brightness" },
    { mode: "light", label: "Light", icon: "light_mode" },
    { mode: "dark", label: "Dark", icon: "dark_mode" },
  ];

  public readonly accents = ACCENT_THEMES;

  public activeAccentLabel(): string {
    return this.accents.find((accent) => accent.key === this.theme.accent())?.label ?? "";
  }
}
