import { CommonModule, CurrencyPipe } from "@angular/common";
import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Store } from "@ngxs/store";
import { catchError, EMPTY, Subscription, take, timer } from "rxjs";
import { Permission, ReceiptProductService, ReceiptProductsView } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { AuthState } from "../../store";
import { hasAll } from "../../utils/permission.utils";

/** While a read is queued or running, the section checks back this often. */
const REFRESH_INTERVAL_MS = 30_000;

/** And at most this many times, so an abandoned tab stops asking. */
const MAX_REFRESHES = 20;

const STATUS_TEXT: { [status: string]: string } = {
  NOT_QUEUED: "Products are read from the receipt's image. This receipt has none yet.",
  PENDING: "Waiting to be read by the AI. This usually takes a few minutes.",
  RUNNING: "The AI is reading this receipt now.",
  UNAVAILABLE: "The AI could not be reached. It will try again automatically.",
  FAILED: "The AI could not read the products on this receipt.",
};

/**
 * The products the AI read off a receipt. Self-contained: it loads its own data by receipt id and
 * checks back while a read is in progress. Status values are plain strings on the API, so an
 * unknown one simply shows no explanation.
 */
@Component({
  selector: "app-receipt-products",
  templateUrl: "./receipt-products.component.html",
  styleUrls: ["./receipt-products.component.scss"],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PipesModule],
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  providers: [CurrencyPipe],
})
export class ReceiptProductsComponent {
  public readonly receiptId = input.required<number>();

  public readonly groupId = input.required<number>();

  public readonly view = signal<ReceiptProductsView | undefined>(undefined);

  public readonly loadFailed = signal(false);

  public readonly requesting = signal(false);

  public readonly statusText = computed(() => {
    const view = this.view();
    if (!view || view.status === "DONE") {
      return "";
    }
    return STATUS_TEXT[view.status] ?? "";
  });

  public readonly isInProgress = computed(() => ["PENDING", "RUNNING"].includes(this.view()?.status ?? ""));

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  /** Reading again needs update: it spends AI credits on the group's behalf. */
  public readonly canReadAgain = computed(() => {
    const status = this.view()?.status;
    return (
      (status === "DONE" || status === "FAILED" || status === "UNAVAILABLE") &&
      hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsUpdate)
    );
  });

  private refreshes = 0;

  private refreshSubscription?: Subscription;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private receiptProductService: ReceiptProductService,
    private store: Store
  ) {
    effect(() => {
      const receiptId = this.receiptId();
      untracked(() => {
        this.refreshes = 0;
        this.load(receiptId);
      });
    });
  }

  public readAgain(): void {
    this.requesting.set(true);
    this.receiptProductService
      .readReceiptProducts(this.receiptId())
      .pipe(take(1))
      .subscribe({
        next: (view) => {
          this.refreshes = 0;
          this.show(view);
          this.requesting.set(false);
        },
        error: () => this.requesting.set(false),
      });
  }

  private load(receiptId: number): void {
    this.receiptProductService
      .getReceiptProducts(receiptId)
      .pipe(
        take(1),
        catchError(() => {
          this.loadFailed.set(true);
          return EMPTY;
        })
      )
      .subscribe((view) => this.show(view));
  }

  private show(view: ReceiptProductsView): void {
    this.loadFailed.set(false);
    this.view.set(view);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    this.refreshSubscription?.unsubscribe();
    if (!this.isInProgress() || this.refreshes >= MAX_REFRESHES) {
      return;
    }

    this.refreshes++;
    this.refreshSubscription = timer(REFRESH_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(this.receiptId()));
  }
}
