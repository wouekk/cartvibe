import { Component, inject } from "@angular/core";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SYSTEM_MODE, ThemeMode, ThemeService } from "../../theme/theme.service";
import { THEMES } from "../../theme/themes";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { LanguageSettingComponent } from "./language-setting.component";
import { marker } from "../../i18n/marker";

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
  imports: [AppIconComponent, LanguageSettingComponent, SharedUiModule, TranslatePipe],
  template: `
    <app-settings-section testId="theme-mode-card" title="Theme" description="Choose how CartVibe looks on this device.">
        <ul class="m-0 flex list-none flex-col gap-1 px-3 py-3" role="radiogroup" [attr.aria-label]="'Theme' | t">
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
                <app-icon [name]="option.icon"></app-icon>
                <span class="flex-1">{{ option.label | t }}</span>
                @if (theme.mode() === option.mode) {
                  <app-icon name="check"></app-icon>
                }
              </button>
            </li>
          }
        </ul>
        <app-language-setting></app-language-setting>
    </app-settings-section>
  `,
})
export class ThemeSettingsComponent {
  protected readonly theme = inject(ThemeService);

  protected readonly options: ModeOption[] = [
    { mode: SYSTEM_MODE, label: marker("System"), icon: "contrast" },
    ...THEMES.map((theme) => ({ mode: theme.key, label: theme.label, icon: theme.icon })),
  ];
}
