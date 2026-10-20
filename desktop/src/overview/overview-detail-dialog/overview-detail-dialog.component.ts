import { CommonModule, CurrencyPipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { RouterLink } from "@angular/router";
import { catchError, map, of, take } from "rxjs";
import {
  FilterOperation,
  GroupOverviewProduct,
  OverviewService,
  Receipt,
  ReceiptService,
  SortDirection,
} from "../../open-api";
import { ButtonModule } from "../../button";
import { PipesModule } from "../../pipes/pipes.module";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";

/** What a Dashboard figure is made of: its products (Unhealthy, Unplanned) or a category's receipts. */
export type OverviewDetailKind = "UNHEALTHY" | "UNPLANNED" | "CATEGORY";

export interface OverviewDetailDialogData {
  title: string;
  kind: OverviewDetailKind;
  groupId: number;
  /** The period, "yyyy-MM-dd". */
  from: string;
  to: string;
  /** For a category: its id, to filter the receipts. */
  categoryId?: number;
}

/** A category lists this many receipts at most; the receipts page has the rest. */
const RECEIPT_LIMIT = 100;

/**
 * The list behind a Dashboard figure (Phase 3 D1, decision Q10): tap Unhealthy or Unplanned to see
 * the products that add up to it, tap a category to see its receipts. Read-only; each row links on.
 */
@Component({
  selector: "app-overview-detail-dialog",
  templateUrl: "./overview-detail-dialog.component.html",
  styleUrls: ["./overview-detail-dialog.component.scss"],
  standalone: true,
  imports: [ButtonModule, CommonModule, PipesModule, RouterLink, SharedUiModule],
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  providers: [CurrencyPipe],
})
export class OverviewDetailDialogComponent implements OnInit {
  public readonly data = inject<OverviewDetailDialogData>(MAT_DIALOG_DATA);

  private readonly dialogRef = inject(MatDialogRef<OverviewDetailDialogComponent>);

  private readonly overviewService = inject(OverviewService);

  private readonly receiptService = inject(ReceiptService);

  public readonly loading = signal(true);

  public readonly failed = signal(false);

  public readonly products = signal<GroupOverviewProduct[]>([]);

  public readonly receipts = signal<Receipt[]>([]);

  public ngOnInit(): void {
    if (this.data.kind === "CATEGORY") {
      this.loadReceipts();
    } else {
      this.loadProducts();
    }
  }

  public close(): void {
    this.dialogRef.close();
  }

  private loadProducts(): void {
    this.overviewService
      .getOverviewProducts(this.data.groupId, this.data.kind, undefined, this.data.from, this.data.to)
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

  private loadReceipts(): void {
    this.receiptService
      .getReceiptsForGroup(this.data.groupId, {
        page: 1,
        pageSize: RECEIPT_LIMIT,
        orderBy: "date",
        sortDirection: SortDirection.Desc,
        filter: {
          date: { operation: FilterOperation.Between, value: [this.data.from, this.data.to] },
          categories: { operation: FilterOperation.Contains, value: [this.data.categoryId] },
        },
      })
      .pipe(
        take(1),
        // The generated item type is a merge of every paged model, so it needs an explicit narrowing.
        map((page) => page.data as unknown as Receipt[]),
        catchError(() => {
          this.failed.set(true);
          return of([] as Receipt[]);
        })
      )
      .subscribe((receipts) => {
        this.receipts.set(receipts);
        this.loading.set(false);
      });
  }
}
