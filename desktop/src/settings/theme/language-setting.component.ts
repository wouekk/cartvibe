import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { catchError, of, take } from "rxjs";
import { UserPreferences, UserPreferencesService } from "../../open-api";
import { AuthStore } from "../../store/auth.store";
import { LanguageSyncService } from "../../i18n/language-sync.service";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";

/**
 * The Language cards (Settings → Language). Like the theme they apply at once with no Save: each choice is loaded, shown,
 * and saved with the account (so it follows the person to every device). Options come from the registry
 * (`assets/i18n/languages.json`); a new language appears here by being listed there. The AI language decides what the
 * server asks the AI to write product names in (`api/internal/services/ai_language.go`); "" follows the interface.
 */
@Component({
  selector: "app-language-setting",
  standalone: true,
  imports: [AppIconComponent, SharedUiModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-settings-section
      testId="language-row"
      title="Interface language"
      description="Saved with your account, so CartVibe speaks it on every device."
    >
      <ul class="m-0 flex list-none flex-col gap-1 px-3 py-3" role="radiogroup" [attr.aria-label]="'Language' | t">
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
    </app-settings-section>

    <app-settings-section
      class="mt-6 block"
      testId="ai-language-row"
      title="AI language"
      description="The language the AI writes product names and new categories in when it reads your receipts."
    >
      <ul class="m-0 flex list-none flex-col gap-1 px-3 py-3" role="radiogroup" [attr.aria-label]="'AI language' | t">
        <li>
          <button
            type="button"
            role="radio"
            class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            [class.bg-accent]="aiLanguage() === ''"
            [class.font-semibold]="aiLanguage() === ''"
            [attr.aria-checked]="aiLanguage() === ''"
            data-testid="ai-language-same"
            (click)="chooseAiLanguage('')"
          >
            <span class="flex-1">{{ "Same as the interface" | t }}</span>
            @if (aiLanguage() === "") {
              <app-icon name="check"></app-icon>
            }
          </button>
        </li>
        @for (option of translation.languages(); track option.code) {
          <li>
            <button
              type="button"
              role="radio"
              class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              [class.bg-accent]="aiLanguage() === option.code"
              [class.font-semibold]="aiLanguage() === option.code"
              [attr.aria-checked]="aiLanguage() === option.code"
              [attr.lang]="option.code"
              [attr.data-testid]="'ai-language-' + option.code"
              (click)="chooseAiLanguage(option.code)"
            >
              <span class="flex-1">{{ option.label }}</span>
              @if (aiLanguage() === option.code) {
                <app-icon name="check"></app-icon>
              }
            </button>
          </li>
        }
      </ul>
    </app-settings-section>
  `,
})
export class LanguageSettingComponent {
  private readonly authStore = inject(AuthStore);

  protected readonly translation = inject(TranslationService);

  protected readonly languageSync = inject(LanguageSyncService);

  private readonly userPreferencesService = inject(UserPreferencesService);

  private readonly preferences = this.authStore.userPreferences;

  /** The saved AI language; "" follows the interface language (and English when the server knows none). */
  protected readonly aiLanguage = computed(() => this.preferences()?.aiLanguage ?? "");

  /** Saves the AI language with the account, like the interface language; the choice shows once it is saved. */
  protected chooseAiLanguage(code: string): void {
    const current = this.preferences();
    if (!current || this.aiLanguage() === code) {
      return;
    }

    this.userPreferencesService
      .updateUserPreferences({ ...current, aiLanguage: code } as UserPreferences)
      .pipe(
        take(1),
        catchError(() => of(undefined))
      )
      .subscribe((saved) => {
        if (saved) {
          this.authStore.setUserPreferences(saved);
        }
      });
  }
}
