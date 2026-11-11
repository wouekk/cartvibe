import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { Receipt } from "../../open-api";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { UserPipe } from "../../pipes/user.pipe";
import { AddButtonComponent } from "../../shared-ui/add-button/add-button.component";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { ShopMonogramComponent } from "../../shared-ui/shop-monogram/shop-monogram.component";
import { StatusChipComponent } from "../../shared-ui/status-chip/status-chip.component";
import { HlmTable, HlmTBody, HlmTd, HlmTh, HlmTr } from "../../ui/table/lib/hlm-table";

/**
 * The Dashboard's receipts panel: the receipts of the period shown, newest first, each opening its receipt. With a
 * mouse it scrolls inside itself under a pinned header once it holds more rows than fit (`maxHeight`); on a touch
 * screen it stays a plain list, so a swipe moves the page. With no receipt in the period it says so and, for someone
 * who may add one, offers to.
 *
 * The page loads the receipts and hands them in. The panel is the host element, so the page can place it with
 * ordinary layout classes.
 */
@Component({
  selector: "section[app-overview-receipts-panel]",
  standalone: true,
  imports: [AddButtonComponent, AppDatePipe, HlmTable, HlmTBody, HlmTd, HlmTh, HlmTr, MoneyComponent, RouterLink, ShopMonogramComponent, StatusChipComponent, TranslatePipe, UserPipe],
  templateUrl: "./overview-receipts-panel.component.html",
  // Eager, like the page: the user pipe reads the store and has to follow it.
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: "cv-panel", "aria-labelledby": "overview-receipts-title" },
})
export class OverviewReceiptsPanelComponent {
  public readonly receipts = input.required<Receipt[]>();

  /** The period in words, for the title ("Receipts in November 2026"). */
  public readonly periodLabel = input.required<string>();

  /** The household the Dashboard shows: where "All receipts" leads. */
  public readonly groupId = input.required<number>();

  /** The height the list scrolls within, or null when every row fits or the screen is a touch screen. */
  public readonly maxHeight = input<string | null>(null);

  public readonly canAddReceipt = input(false);
}
