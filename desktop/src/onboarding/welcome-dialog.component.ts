import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { Store } from "@ngxs/store";
import { HlmButton } from "@spartan-ng/helm/button";
import { firstValueFrom, map, Observable, of, switchMap } from "rxjs";
import { AppDialogRef } from "../dialog/app-dialog";
import { marker } from "../i18n/marker";
import { TranslatePipe } from "../i18n/translate.pipe";
import { TranslationLoader } from "../i18n/translation-loader";
import { AppLanguage, TranslationService } from "../i18n/translation.service";
import { Permission, SystemSettingsService, UpsertSystemSettingsCommand, UserPreferences, UserPreferencesService } from "../open-api";
import { CartVibeIconComponent } from "../shared-ui/cartvibe-icon/cartvibe-icon.component";
import { FilterTab } from "../shared-ui/filter-bar/filter-tab.interface";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { CURRENCY_PRESETS, CurrencyPreset, matchCurrencyPreset } from "../system-settings/system-settings-form/currency-presets";
import { AuthState } from "../store/auth.state";
import { SetUserPreferences } from "../store/auth.state.actions";
import { SystemSettingsState } from "../store/system-settings.state";
import { SetCurrencyData, SetCurrencyDisplay } from "../store/system-settings.state.actions";
import { SYSTEM_MODE, ThemeMode, ThemeService } from "../theme/theme.service";
import { THEMES } from "../theme/themes";

/** Short labels for the currency strip; the presets' own labels ("Euro (12,99 €)") are for the settings form. */
const CURRENCY_SHORT: Record<string, string> = { EUR: "EUR €", PLN: "PLN zł", USD: "USD $", GBP: "GBP £", CHF: "CHF" };

/**
 * The first sign-in welcome (once per account, `UserPreferences.onboardingPending`): the interface language, the theme on
 * this device and, for an admin, the household currency. Language and theme apply as they are picked; the currency and
 * the language are saved on "Get started", which also ends the welcome. Everything stays changeable under Settings.
 */
@Component({
  selector: "app-welcome-dialog",
  standalone: true,
  imports: [CartVibeIconComponent, HlmButton, SharedUiModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block", "data-testid": "welcome-dialog" },
  template: `
    <div class="flex flex-col items-center gap-3 px-6 pt-7 pb-5 text-center">
      <app-cartvibe-icon [size]="56"></app-cartvibe-icon>
      <h2 class="m-0 text-xl font-semibold tracking-tight">{{ 'Welcome to CartVibe' | t }}</h2>
      <p class="m-0 max-w-sm text-sm text-muted-foreground">{{ 'A few choices to make it yours. You can change them any time under Settings.' | t }}</p>
    </div>

    <div class="flex flex-col border-t border-border/60">
      <section class="flex flex-col gap-2 px-6 py-4" data-testid="welcome-language">
        <h3 class="cv-section__title">{{ 'Language' | t }}</h3>
        <app-settings-tabs [tabs]="languageTabs()" [value]="language()" ariaLabel="Language" (valueChange)="pickLanguage($event)"></app-settings-tabs>
      </section>

      <section class="flex flex-col gap-2 border-t border-border/60 px-6 py-4" data-testid="welcome-theme">
        <h3 class="cv-section__title">{{ 'Theme' | t }}</h3>
        <app-settings-tabs [tabs]="themeTabs" [value]="theme.mode()" ariaLabel="Theme" (valueChange)="pickTheme($event)"></app-settings-tabs>
      </section>

      @if (canSetCurrency()) {
        <section class="flex flex-col gap-2 border-t border-border/60 px-6 py-4" data-testid="welcome-currency">
          <h3 class="cv-section__title">{{ 'Household currency' | t }}</h3>
          <app-settings-tabs [tabs]="currencyTabs" [value]="currency()" ariaLabel="Household currency" (valueChange)="currency.set($event)"></app-settings-tabs>
          <p class="m-0 text-xs text-muted-foreground">{{ 'Used for every receipt and total in the household.' | t }}</p>
        </section>
      }
    </div>

    <footer class="flex justify-end border-t border-border/60 px-6 py-4">
      <button hlmBtn type="button" data-testid="welcome-start" [disabled]="saving()" (click)="start()">{{ 'Get started' | t }}</button>
    </footer>
  `,
})
export class WelcomeDialogComponent {
  private readonly dialogRef = inject(AppDialogRef);
  private readonly store = inject(Store);
  private readonly translation = inject(TranslationService);
  private readonly loader = inject(TranslationLoader);
  private readonly userPreferencesService = inject(UserPreferencesService);
  private readonly systemSettingsService = inject(SystemSettingsService);
  protected readonly theme = inject(ThemeService);

  protected readonly canSetCurrency = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppSystemSettingsUpdate));

  protected readonly language = signal<string>(this.translation.language());

  protected readonly languageTabs = computed<FilterTab[]>(() =>
    this.translation.languages().map((option) => ({ value: option.code, label: option.label, testId: `welcome-language-${option.code}` }))
  );

  protected readonly themeTabs: FilterTab[] = [
    { value: SYSTEM_MODE, label: marker("System"), icon: "contrast", testId: `welcome-theme-${SYSTEM_MODE}` },
    ...THEMES.map((theme) => ({ value: theme.key, label: theme.label, icon: theme.icon, testId: `welcome-theme-${theme.key}` })),
  ];

  protected readonly currencyTabs: FilterTab[] = CURRENCY_PRESETS.map((preset) => ({
    value: preset.code,
    label: CURRENCY_SHORT[preset.code] ?? preset.code,
    testId: `welcome-currency-${preset.code}`,
  }));

  /** The household's current preset (the euro default on a new install). */
  private readonly savedCurrency = matchCurrencyPreset({
    currencyDisplay: this.store.selectSnapshot(SystemSettingsState.currencyDisplay),
    currencySymbolPosition: this.store.selectSnapshot(SystemSettingsState.currencySymbolPosition),
    currencyThousandthsSeparator: this.store.selectSnapshot(SystemSettingsState.currencyThousandthsSeparator),
    currencyDecimalSeparator: this.store.selectSnapshot(SystemSettingsState.currencyDecimalSeparator),
    currencyHideDecimalPlaces: this.store.selectSnapshot(SystemSettingsState.currencyHideDecimalPlaces),
  });

  protected readonly currency = signal<string>(this.savedCurrency);

  protected readonly saving = signal(false);

  /** Switches the interface at once; the choice is saved with the account on "Get started". */
  protected async pickLanguage(code: string): Promise<void> {
    const language = this.translation.asLanguage(code as AppLanguage);
    if (!language || !(await this.loader.ensure(language))) {
      return;
    }
    this.language.set(language);
    this.translation.choose(language);
  }

  /** Per device, like Settings → Theme: applies and is remembered at once. */
  protected pickTheme(mode: string): void {
    this.theme.setMode(mode as ThemeMode);
  }

  protected async start(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.saveCurrency());
      const preferences = this.store.selectSnapshot(AuthState.userPreferences);
      const saved = await firstValueFrom(
        this.userPreferencesService.updateUserPreferences({
          ...(preferences ?? {}),
          language: this.language(),
          onboardingPending: false,
        } as UserPreferences)
      );
      this.store.dispatch(new SetUserPreferences(saved));
      this.dialogRef.close(true);
    } catch {
      // The interceptor has said what went wrong; the welcome stays open to try again.
    } finally {
      this.saving.set(false);
    }
  }

  /** The household currency, only when an admin picked another preset; the settings endpoint takes the whole body. */
  private saveCurrency(): Observable<unknown> {
    const preset = CURRENCY_PRESETS.find((candidate) => candidate.code === this.currency());
    if (!this.canSetCurrency() || !preset || preset.code === this.savedCurrency) {
      return of(true);
    }

    return this.systemSettingsService.getSystemSettings().pipe(
      map((settings) => ({ ...settings, ...currencyFields(preset), currencyHideDecimalPlaces: false }) as unknown as UpsertSystemSettingsCommand),
      switchMap((command) => this.systemSettingsService.updateSystemSettings(command)),
      switchMap(() => this.store.dispatch(new SetCurrencyDisplay(preset.currencyDisplay))),
      switchMap(() =>
        this.store.dispatch(
          new SetCurrencyData(preset.currencySymbolPosition, preset.currencyDecimalSeparator, preset.currencyThousandthsSeparator, false)
        )
      )
    );
  }
}

function currencyFields(preset: CurrencyPreset): Pick<CurrencyPreset, "currencyDisplay" | "currencySymbolPosition" | "currencyThousandthsSeparator" | "currencyDecimalSeparator"> {
  return {
    currencyDisplay: preset.currencyDisplay,
    currencySymbolPosition: preset.currencySymbolPosition,
    currencyThousandthsSeparator: preset.currencyThousandthsSeparator,
    currencyDecimalSeparator: preset.currencyDecimalSeparator,
  };
}
