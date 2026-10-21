import { Component, inject } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { SYSTEM_MODE, ThemeMode, ThemeService } from "../../theme/theme.service";
import { THEMES } from "../../theme/themes";

interface ModeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}

/**
 * User Settings → Theme: "System" plus every theme in the registry (src/theme/themes.ts). Per browser, so it needs no
 * permission and no save: a choice applies at once and is remembered. A new theme appears here by being registered.
 */
@Component({
  selector: "app-theme-settings",
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="max-w-xl">
      <section
        class="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
        data-testid="theme-mode-card"
        aria-labelledby="theme-mode-title"
      >
        <h2 id="theme-mode-title" class="mb-1 text-lg font-semibold">Theme</h2>
        <p class="mb-4 text-sm text-muted-foreground">Choose how CartVibe looks on this device.</p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0" role="radiogroup" aria-label="Theme">
          @for (option of options; track option.mode) {
            <li>
              <button
                type="button"
                role="radio"
                class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                [class.bg-accent]="theme.mode() === option.mode"
                [class.font-semibold]="theme.mode() === option.mode"
                [attr.aria-checked]="theme.mode() === option.mode"
                [attr.data-testid]="'theme-mode-' + option.mode"
                (click)="theme.setMode(option.mode)"
              >
                <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
                <span class="flex-1">{{ option.label }}</span>
                @if (theme.mode() === option.mode) {
                  <mat-icon aria-hidden="true">check</mat-icon>
                }
              </button>
            </li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class ThemeSettingsComponent {
  protected readonly theme = inject(ThemeService);

  protected readonly options: ModeOption[] = [
    { mode: SYSTEM_MODE, label: "System", icon: "contrast" },
    ...THEMES.map((theme) => ({ mode: theme.key, label: theme.label, icon: theme.icon })),
  ];
}
