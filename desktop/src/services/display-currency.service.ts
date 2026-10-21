import { CurrencyPipe } from "@angular/common";
import { computed, inject, Injectable } from "@angular/core";
import { Store } from "@ngxs/store";
import { AuthState } from "../store/auth.state";
import { CustomCurrencyPipe } from "../pipes/custom-currency.pipe";
import { formatInDisplayCurrency, isCurrencyCode, normalizeCurrencyCode } from "../utils/display-currency";

/**
 * The currency this person sees the Dashboard in. Only the Dashboard converts, and only in the browser: stored amounts and
 * every other screen stay in the household currency. Without a code and a rate it formats like the rest of the app.
 */
@Injectable({ providedIn: "root" })
export class DisplayCurrencyService {
  private readonly store = inject(Store);

  private readonly preferences = this.store.selectSignal(AuthState.userPreferences);

  private readonly household = new CustomCurrencyPipe(this.store, new CurrencyPipe("en-US"));

  /** The active conversion, or undefined when the household currency is shown. */
  public readonly conversion = computed(() => {
    const preferences = this.preferences();
    const code = normalizeCurrencyCode(preferences?.displayCurrency);
    const rate = Number(preferences?.displayCurrencyRate ?? 0);
    return isCurrencyCode(code) && rate > 0 ? { code, rate } : undefined;
  });

  public format(value: number | string | null | undefined): string {
    const amount = value ?? 0;
    const conversion = this.conversion();
    if (conversion) {
      return formatInDisplayCurrency(amount, conversion.code, conversion.rate);
    }

    return this.household.transform(amount);
  }
}
