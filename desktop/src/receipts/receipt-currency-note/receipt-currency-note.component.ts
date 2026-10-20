import { CommonModule } from "@angular/common";
import { Component, computed, input } from "@angular/core";

/** The part of a receipt the note reads; any receipt-shaped object works, so the table can pass its rows. */
export interface ReceiptCurrencyFields {
  originalAmount?: string | null;
  originalCurrency?: string | null;
  exchangeRate?: string | null;
}

/**
 * Says where a converted receipt came from (Phase 3 currencies): "CHF 45.90 at 1.04", or, when the
 * receipt was in another currency and no rate is known yet, a warning that it is not converted. Shows
 * nothing for a receipt in the main currency.
 */
@Component({
  selector: "app-receipt-currency-note",
  template: `
    @if (originalCurrency(); as currency) {
      @if (waitingForRate()) {
        <span class="note note--warning" data-testid="receipt-rate-missing">
          In {{ currency }}, not converted: add the {{ currency }} rate in System Settings.
        </span>
      } @else {
        <span class="note" data-testid="receipt-original-amount">
          {{ originalAmount() }} {{ currency }} at {{ exchangeRate() }}
        </span>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .note {
        font-size: 12px;
        color: #475569;
      }

      .note--warning {
        color: #b45309;
      }
    `,
  ],
  standalone: true,
  imports: [CommonModule],
})
export class ReceiptCurrencyNoteComponent {
  public readonly receipt = input<ReceiptCurrencyFields | null | undefined>();

  public readonly originalCurrency = computed(() => this.receipt()?.originalCurrency || "");

  public readonly originalAmount = computed(() => this.receipt()?.originalAmount ?? "");

  public readonly exchangeRate = computed(() => this.receipt()?.exchangeRate ?? "");

  /** In another currency with no rate: the amount is still as read. */
  public readonly waitingForRate = computed(() => !!this.originalCurrency() && !this.receipt()?.exchangeRate);
}
