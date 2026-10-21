import { inject, Pipe, PipeTransform } from "@angular/core";
import { DisplayCurrencyService } from "../services/display-currency.service";

/** `value | displayCurrency`: the amount in the currency this person chose for the Dashboard (see DisplayCurrencyService). */
@Pipe({ name: "displayCurrency", standalone: true, pure: false })
export class DisplayCurrencyPipe implements PipeTransform {
  private readonly service = inject(DisplayCurrencyService);

  public transform(value: number | string | null | undefined): string {
    return this.service.format(value);
  }
}
