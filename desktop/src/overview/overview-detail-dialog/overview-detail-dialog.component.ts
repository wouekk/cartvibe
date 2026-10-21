import { DisplayCurrencyPipe } from "../../pipes/display-currency.pipe";
import { CommonModule, CurrencyPipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { RouterLink } from "@angular/router";
import { catchError, of, take } from "rxjs";
import { ButtonModule } from "../../button";
import { GroupOverviewProduct, OverviewService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";

/** What a Dashboard figure is made of: the unhealthy products, the unplanned ones, or one food group's. */
export type OverviewDetailKind = "UNHEALTHY" | "UNPLANNED" | "FOODGROUP";

export interface OverviewDetailDialogData {
  title: string;
  kind: OverviewDetailKind;
  groupId: number;
  /** The period, "yyyy-MM-dd". */
  from: string;
  to: string;
  /** For a food group: its name as the Dashboard shows it; empty for Uncategorized. */
  foodGroup?: string;
}

/**
 * The list behind a Dashboard figure (Phase 3 D1, decision Q10): tap Unhealthy, Not on the list or a
 * category to see the products that add up to it. Read-only; each row links to its receipt.
 */
@Component({
  selector: "app-overview-detail-dialog",
  templateUrl: "./overview-detail-dialog.component.html",
  styleUrls: ["./overview-detail-dialog.component.scss"],
  standalone: true,
  imports: [ButtonModule, CommonModule, DisplayCurrencyPipe, PipesModule, RouterLink, SharedUiModule],
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  providers: [CurrencyPipe],
})
export class OverviewDetailDialogComponent implements OnInit {
  public readonly data = inject<OverviewDetailDialogData>(APP_DIALOG_DATA);

  private readonly dialogRef = inject(AppDialogRef<OverviewDetailDialogComponent>);

  private readonly overviewService = inject(OverviewService);

  public readonly loading = signal(true);

  public readonly failed = signal(false);

  public readonly products = signal<GroupOverviewProduct[]>([]);

  public ngOnInit(): void {
    const foodGroup = this.data.kind === "FOODGROUP" ? (this.data.foodGroup ?? "") : undefined;

    this.overviewService
      .getOverviewProducts(this.data.groupId, this.data.kind, foodGroup, undefined, this.data.from, this.data.to)
      .pipe(
        take(1),
        catchError(() => {
          this.failed.set(true);
          return of([] as GroupOverviewProduct[]);
        })
      )
      .subscribe((products) => {
        this.products.set(products);
        this.loading.set(false);
      });
  }

  public close(): void {
    this.dialogRef.close();
  }
}
