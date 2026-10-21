import { CurrencyPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { splitMoney } from "./split-money";

/**
 * An amount in the app's currency with a financial hierarchy: the whole part bold, the symbol and the decimals quieter
 * (the figure reads first, the cents second). The text is still one amount, so it copies and reads as one.
 */
@Component({
  selector: "app-money",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, CustomCurrencyPipe],
  host: { class: "tabular-nums", "[attr.data-testid]": "null" },
  template: `@if (parts().integer) {<span class="text-[0.75em] font-medium text-muted-foreground">{{ parts().prefix }}</span><span class="font-bold tracking-tight">{{ parts().integer }}</span><span class="text-[0.75em] font-medium text-muted-foreground">{{ parts().fraction }}{{ parts().suffix }}</span>} @else {{{ parts().prefix }}}`,
})
export class MoneyComponent {
  private readonly currency = inject(CustomCurrencyPipe);

  private readonly displayCurrency = inject(DisplayCurrencyService);

  public readonly value = input<number | string | null | undefined>(0);

  /** Show the amount in the currency this person chose for the Dashboard instead of the household currency. */
  public readonly display = input(false);

  protected readonly parts = computed(() =>
    splitMoney(this.display() ? this.displayCurrency.format(this.value()) : String(this.currency.transform(this.value() ?? 0) ?? ""))
  );
}
