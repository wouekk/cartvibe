import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { LanguageSyncService } from "../../i18n/language-sync.service";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";

/**
 * The interface language, as a row of the Theme card. Like the theme it applies at once with no Save: the choice is
 * loaded, shown, and saved with the account (so it follows the person to every device). Options come from the registry
 * (`assets/i18n/languages.json`); a new language appears here by being listed there.
 */
@Component({
  selector: "app-language-setting",
  standalone: true,
  imports: [AppIconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "rw-section", "data-testid": "language-row" },
  template: `
    <div class="rw-section__head">
      <h3 class="rw-section__title">{{ 'Language' | t }}</h3>
    </div>
    <ul class="m-0 -mx-3 flex list-none flex-col gap-1 p-0" role="radiogroup" [attr.aria-label]="'Language' | t">
      @for (option of translation.languages(); track option.code) {
        <li>
          <button
            type="button"
            role="radio"
            class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            [class.bg-accent]="translation.language() === option.code"
            [class.font-semibold]="translation.language() === option.code"
            [attr.aria-checked]="translation.language() === option.code"
            [attr.lang]="option.code"
            [attr.data-testid]="'language-' + option.code"
            (click)="languageSync.choose(option.code)"
          >
            <span class="flex-1">{{ option.label }}</span>
            @if (translation.language() === option.code) {
              <app-icon name="check"></app-icon>
            }
          </button>
        </li>
      }
    </ul>
  `,
})
export class LanguageSettingComponent {
  protected readonly translation = inject(TranslationService);

  protected readonly languageSync = inject(LanguageSyncService);
}
