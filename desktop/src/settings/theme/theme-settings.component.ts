import { Component, inject, ChangeDetectionStrategy } from "@angular/core";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { PaletteSwatchComponent } from "../../shared-ui/palette-swatch/palette-swatch.component";
import { ThemeService } from "../../theme/theme.service";
import { MODE_OPTIONS, PALETTES } from "../../theme/themes";
import { TranslatePipe } from "../../i18n/translate.pipe";

/** The look of a choice row in either card: a full-width radio button, tinted and bold while it is the chosen one. */
const ROW_CLASS =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * The Theme cards (Settings → Theme): the mode (System, Day, Night) and the colour palette, from the registry in
 * src/theme/themes.ts. Per browser, so they need no permission and no save: a choice applies at once and is remembered.
 * A new palette appears here by being registered.
 */
@Component({
  selector: "app-theme-settings",
  standalone: true,
  imports: [AppIconComponent, PaletteSwatchComponent, SharedUiModule, TranslatePipe],
  host: { class: "flex flex-col gap-6" },
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-settings-section testId="theme-mode-card" title="Appearance" description="Day, night, or follow this device.">
      <ul class="m-0 flex list-none flex-col gap-1 px-3 py-3" role="radiogroup" [attr.aria-label]="'Appearance' | t">
        @for (option of modes; track option.mode) {
          <li>
            <button
              type="button"
              role="radio"
              [class]="rowClass"
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
    </app-settings-section>

    <app-settings-section testId="theme-palette-card" title="Colour palette" description="The accent colour. Day and night work with every palette.">
      <ul class="m-0 flex list-none flex-col gap-1 px-3 py-3" role="radiogroup" [attr.aria-label]="'Colour palette' | t">
        @for (palette of palettes; track palette.key) {
          <li>
            <button
              type="button"
              role="radio"
              [class]="rowClass"
              [class.bg-accent]="theme.palette() === palette.key"
              [class.font-semibold]="theme.palette() === palette.key"
              [attr.aria-checked]="theme.palette() === palette.key"
              [attr.data-testid]="'theme-palette-' + palette.key"
              (click)="theme.setPalette(palette.key)"
            >
              <app-palette-swatch [palette]="palette.key"></app-palette-swatch>
              <span class="flex-1">{{ palette.label | t }}</span>
              @if (theme.palette() === palette.key) {
                <app-icon name="check"></app-icon>
              }
            </button>
          </li>
        }
      </ul>
    </app-settings-section>
  `,
})
export class ThemeSettingsComponent {
  protected readonly theme = inject(ThemeService);

  protected readonly modes = MODE_OPTIONS;

  protected readonly palettes = PALETTES;

  protected readonly rowClass = ROW_CLASS;
}
