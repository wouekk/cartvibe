import { Component, computed, input, ChangeDetectionStrategy } from "@angular/core";
import { TranslatePipe } from "../../i18n/translate.pipe";

/** The part of a receipt the note reads; any receipt-shaped object works, so the table can pass its rows. */
export interface ReceiptCurrencyFields {
  originalAmount?: string | null;
  originalCurrency?: string | null;
  exchangeRate?: string | null;
}

/**
 * Says where a converted receipt came from (Phase 3 currencies): "45.90 CHF at 1.04", or, when the
 * receipt was in another currency and no rate is known yet, a warning that it is not converted. Shows
 * nothing for a receipt in the main currency.
 */
@Component({
  selector: "app-receipt-currency-note",
  host: { class: "block text-xs" },
  template: `
    @if (originalCurrency(); as currency) {
      @if (waitingForRate()) {
        <span class="text-warning-text" data-testid="receipt-rate-missing">
          {{ 'In {currency}, not converted: add the {currency} rate in System Settings.' | t: { currency } }}
        </span>
      } @else {
        <span class="text-muted-foreground" data-testid="receipt-original-amount">
          {{ '{amount} {currency} at {rate}' | t: { amount: originalAmount(), currency, rate: exchangeRate() } }}
        </span>
      }
    }
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TranslatePipe],
})
export class ReceiptCurrencyNoteComponent {
  public readonly receipt = input<ReceiptCurrencyFields | null | undefined>();

  public readonly originalCurrency = computed(() => this.receipt()?.originalCurrency || "");

  public readonly originalAmount = computed(() => this.receipt()?.originalAmount ?? "");

  public readonly exchangeRate = computed(() => this.receipt()?.exchangeRate ?? "");

  /** In another currency with no rate: the amount is still as read. */
  public readonly waitingForRate = computed(() => !!this.originalCurrency() && !this.receipt()?.exchangeRate);
}
