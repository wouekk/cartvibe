import { DisplayCurrencyPipe } from "../../pipes/display-currency.pipe";
import { CommonModule, CurrencyPipe } from "@angular/common";
import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from "@angular/core";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { RouterLink } from "@angular/router";
import { catchError, forkJoin, map, Observable, of, take } from "rxjs";
import { ButtonModule } from "../../button";
import { GroupOverviewProduct, OverviewService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { DonutMember } from "../overview-chart.utils";

/**
 * What a Dashboard figure is made of: the unhealthy lines, the unplanned ones, one category's, one tag's, or the
 * several categories folded into the donut's "Other".
 */
export type OverviewDetailKind = "UNHEALTHY" | "UNPLANNED" | "FOODGROUP" | "TAG" | "OTHER";

export interface OverviewDetailDialogData {
  title: string;
  kind: OverviewDetailKind;
  groupId: number;
  /** The period, "yyyy-MM-dd". */
  from: string;
  to: string;
  /** For a category slice: its category; without one, foodGroup names the slice. */
  categoryId?: number;
  /** For a category slice without an id: its name as the Dashboard shows it; empty for Uncategorized. */
  foodGroup?: string;
  /** For a tag tile: its tag. */
  tagId?: number;
  /** For "Other": the categories it folds, each listed as its own section. */
  members?: DonutMember[];
}

/** One category's lines in the "Other" list. */
export interface OverviewDetailSection {
  name: string;
  /** The lines' amounts added up (unpriced lines count as nothing). */
  total: number;
  products: GroupOverviewProduct[];
}

/** The server's name for the Uncategorized slice's filter is the empty string; the Dashboard shows this name. */
const UNCATEGORIZED = "Uncategorized";

/**
 * The list behind a Dashboard figure (Phase 3 D1, decision Q10): tap Unhealthy, Not on the list, a
 * category or "Other" to see the products that add up to it. Read-only; each row links to its receipt.
 */
@Component({
  selector: "app-overview-detail-dialog",
  templateUrl: "./overview-detail-dialog.component.html",
  standalone: true,
  imports: [ButtonModule, CommonModule, DisplayCurrencyPipe, PipesModule, RouterLink, SharedUiModule],
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [CurrencyPipe],
})
export class OverviewDetailDialogComponent implements OnInit {
  public readonly data = inject<OverviewDetailDialogData>(APP_DIALOG_DATA);

  private readonly dialogRef = inject(AppDialogRef<OverviewDetailDialogComponent>);

  private readonly overviewService = inject(OverviewService);

  public readonly loading = signal(true);

  public readonly failed = signal(false);

  public readonly products = signal<GroupOverviewProduct[]>([]);

  /** For "Other": the folded categories with their lines, empty ones left out. */
  public readonly sections = signal<OverviewDetailSection[]>([]);

  public ngOnInit(): void {
    const request = this.data.kind === "OTHER" ? this.loadSections() : this.loadProducts();

    request.pipe(take(1)).subscribe(() => this.loading.set(false));
  }

  public close(): void {
    this.dialogRef.close();
  }

  private loadProducts(): Observable<void> {
    const isCategory = this.data.kind === "FOODGROUP";
    const categoryId = isCategory ? this.data.categoryId : undefined;
    const foodGroup = isCategory && categoryId === undefined ? (this.data.foodGroup ?? "") : undefined;
    const tagId = this.data.kind === "TAG" ? this.data.tagId : undefined;

    return this.overviewService
      .getOverviewProducts(this.data.groupId, this.data.kind, foodGroup, categoryId, tagId, undefined, this.data.from, this.data.to)
      .pipe(
        catchError(() => {
          this.failed.set(true);
          return of([] as GroupOverviewProduct[]);
        }),
        map((products) => this.products.set(products))
      );
  }

  /** One request per folded category; if any fails the whole list says so rather than showing a short one. */
  private loadSections(): Observable<void> {
    const members = this.data.members ?? [];
    if (members.length === 0) {
      return of(undefined);
    }

    return forkJoin(
      members.map((member) =>
        this.overviewService
          .getOverviewProducts(
            this.data.groupId,
            "FOODGROUP",
            member.categoryId === undefined ? (member.name === UNCATEGORIZED ? "" : member.name) : undefined,
            member.categoryId,
            undefined,
            undefined,
            this.data.from,
            this.data.to
          )
          .pipe(map((products): OverviewDetailSection => ({ name: member.name, total: sumOf(products), products })))
      )
    ).pipe(
      catchError(() => {
        this.failed.set(true);
        return of([] as OverviewDetailSection[]);
      }),
      map((sections) => this.sections.set(sections.filter((section) => section.products.length > 0)))
    );
  }
}

function sumOf(products: GroupOverviewProduct[]): number {
  return products.reduce((total, product) => total + (product.amount ? Number(product.amount) : 0), 0);
}
