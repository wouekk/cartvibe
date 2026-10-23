import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { Component, computed, inject, OnInit, signal, ChangeDetectionStrategy } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { Store } from "@ngxs/store";
import { take } from "rxjs";
import { CurrencyRate, CurrencyRateTable, ExchangeRateService, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store";
import { formatRate, parseCurrencyCode, parseRateInput, sanitizeRateInput, settleRateInput } from "./exchange-rate-input";
import { TranslationService } from "../../i18n/translation.service";

/** One row of the editor: a currency and the rate as typed (a string, so a half-typed number survives). */
interface RateRow {
  code: string;
  rate: string;
}

/**
 * The household's exchange rates (Phase 3 currencies): "1 CHF = 1,04 EUR". A receipt in one of these
 * currencies is converted when it is added, at the rate typed here; a currency without a rate keeps the
 * receipt unconverted and flagged until one is entered. It has no button of its own: the settings form's "Save changes" calls
 * `save()` (an API call apart from the settings one).
 */
@Component({
  selector: "app-exchange-rates",
  templateUrl: "./exchange-rates.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TranslatePipe, PluralPipe, CommonModule, HlmButton, AppIconComponent],
})
export class ExchangeRatesComponent implements OnInit {
  private readonly translation = inject(TranslationService);

  private readonly exchangeRateService = inject(ExchangeRateService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly store = inject(Store);

  public readonly mainCurrency = signal("");

  public readonly rows = signal<RateRow[]>([]);

  public readonly newCode = signal("");

  public readonly error = signal("");

  public readonly saving = signal(false);

  public readonly loaded = signal(false);

  /** Rates were typed, added or removed since they were last loaded or saved. */
  public readonly dirty = signal(false);

  public readonly canUpdate = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppSystemSettingsUpdate));

  /** Without a named main currency (a custom symbol) there is nothing to convert into. */
  public readonly enabled = computed(() => this.mainCurrency() !== "");

  public ngOnInit(): void {
    this.exchangeRateService
      .getExchangeRates()
      .pipe(take(1))
      .subscribe((view) => {
        this.show(view);
        this.loaded.set(true);
      });
  }

  /**
   * Keeps what is typed: a comma becomes a dot straight away and anything else but digits is dropped, but a
   * half-typed number ("0.", "1.0") stays exactly as it is, so typing is never fought. The row holds the text.
   */
  public setRate(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rate = sanitizeRateInput(input.value);
    if (rate !== input.value) {
      input.value = rate;
    }

    this.updateRate(index, rate);
    this.dirty.set(true);
  }

  /** Leaving the field, or Enter, finishes the number ("1." is 1, ".5" is 0.5). Saving stays with the button. */
  public commitRate(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rate = settleRateInput(input.value);
    if (rate !== input.value) {
      input.value = rate;
    }

    this.updateRate(index, rate);
  }

  private updateRate(index: number, rate: string): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, rate } : row)));
  }

  public setNewCode(event: Event): void {
    this.newCode.set((event.target as HTMLInputElement).value);
  }

  public addCurrency(): void {
    const code = parseCurrencyCode(this.newCode());
    if (!code) {
      this.error.set("A currency code is three letters, like CHF.");
      return;
    }
    if (code === this.mainCurrency()) {
      this.error.set(`${code} is the main currency and needs no rate.`);
      return;
    }
    if (this.rows().some((row) => row.code === code)) {
      this.error.set(`${code} is already listed.`);
      return;
    }

    this.error.set("");
    this.rows.update((rows) => [...rows, { code, rate: "" }].sort((a, b) => a.code.localeCompare(b.code)));
    this.dirty.set(true);
    this.newCode.set("");
  }

  public removeCurrency(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
    this.dirty.set(true);
  }

  /**
   * Saves the typed rates. `refreshMainCurrency` first re-reads the main currency, for a save that follows a currency
   * change in the same form (the settings save has just moved it).
   */
  public save(refreshMainCurrency = false): void {
    if (refreshMainCurrency) {
      this.exchangeRateService
        .getExchangeRates()
        .pipe(take(1))
        .subscribe((view) => {
          this.mainCurrency.set(view.mainCurrency ?? "");
          this.save();
        });
      return;
    }

    const rates: CurrencyRate[] = [];
    for (const row of this.rows()) {
      const parsed = parseRateInput(row.rate);
      if (!parsed.ok) {
        this.error.set(this.translation.t("The rate for {code} must be a number above 0, like 1,04.", { code: row.code }));
        return;
      }
      rates.push({ code: row.code, rate: parsed.value });
    }

    this.error.set("");
    this.saving.set(true);
    this.exchangeRateService
      .updateExchangeRates({ mainCurrency: this.mainCurrency(), rates })
      .pipe(take(1))
      .subscribe({
        next: (view) => {
          this.show(view);
          this.snackbarService.success("Exchange rates saved");
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  private show(view: CurrencyRateTable): void {
    this.mainCurrency.set(view.mainCurrency ?? "");
    this.rows.set(view.rates.map((rate) => ({ code: rate.code, rate: formatRate(rate.rate) })));
    this.dirty.set(false);
  }
}
