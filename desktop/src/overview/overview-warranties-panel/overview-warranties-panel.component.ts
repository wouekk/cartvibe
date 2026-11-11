import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { ShopMonogramComponent } from "../../shared-ui/shop-monogram/shop-monogram.component";
import { HlmTable, HlmTBody, HlmTd, HlmTh, HlmTr } from "../../ui/table/lib/hlm-table";
import { WarrantyRow } from "../../utils/warranty-period";
import { WarrantyMenuComponent } from "../../warranties/warranty-menu/warranty-menu.component";

/**
 * The Dashboard's "Warranties ending soon" panel: one row per product whose warranty ends in the next two months,
 * nearest first, with the days left and the row's menu (change the date, remove it).
 *
 * The page loads the receipts, because its Warranties tile counts the same ones, and hands the rows in; the panel
 * says when a row's menu changed something, so the page loads them again.
 *
 * The panel is the host element, so the page can place it with ordinary layout classes.
 */
@Component({
  selector: "section[app-overview-warranties-panel]",
  standalone: true,
  imports: [AppDatePipe, HlmTable, HlmTBody, HlmTd, HlmTh, HlmTr, PluralPipe, RouterLink, ShopMonogramComponent, TranslatePipe, WarrantyMenuComponent],
  templateUrl: "./overview-warranties-panel.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "cv-panel", "aria-labelledby": "overview-warranties-title" },
})
export class OverviewWarrantiesPanelComponent {
  /** A product each (one row for a receipt without products), with its days left (0 is today). */
  public readonly rows = input.required<WarrantyRow[]>();

  /** The household the Dashboard shows: where "All warranties" leads. */
  public readonly groupId = input.required<number>();

  /** A row's menu changed or removed a warranty date. */
  public readonly changed = output<void>();
}
