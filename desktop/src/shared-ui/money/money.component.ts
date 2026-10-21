import { CurrencyPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
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

  public readonly value = input<number | string | null | undefined>(0);

  protected readonly parts = computed(() => splitMoney(String(this.currency.transform(this.value() ?? 0) ?? "")));
}
