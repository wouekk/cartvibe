import { CurrencyPipe } from "@angular/common";
import { inject, Injectable } from "@angular/core";
import { Store } from "@ngxs/store";
import { CustomCurrencyPipe } from "../pipes/custom-currency.pipe";

/**
 * How the Dashboard formats an amount: in the household currency an admin sets under System Settings, like the rest of
 * the app. There is no per-person currency any more; a `displayCurrency` an older version stored in a person's
 * preferences is ignored.
 */
@Injectable({ providedIn: "root" })
export class DisplayCurrencyService {
  private readonly household = new CustomCurrencyPipe(inject(Store), new CurrencyPipe("en-US"));

  public format(value: number | string | null | undefined): string {
    return this.household.transform(value ?? 0);
  }
}
