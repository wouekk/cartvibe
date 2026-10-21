import { PluralPipe, TranslatePipe } from "../../../i18n/translate.pipe";
import { Component, computed, input, signal } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../../../shared-ui/icon/icon.component";
import { Store } from "@ngxs/store";
import { take } from "rxjs";
import { Permission, ReceiptProductService } from "../../../open-api";
import { AuthState } from "../../../store";
import { hasAll } from "../../../utils/permission.utils";

/**
 * Queues a group's older receipts — those with an image whose products were never read — for the AI
 * to read. New receipts are read automatically; this is the one-off catch-up. Hidden without
 * group.receipts.update, which the endpoint requires.
 */
@Component({
  selector: "app-receipt-product-backfill",
  templateUrl: "./receipt-product-backfill.component.html",
  styleUrls: ["./receipt-product-backfill.component.scss"],
  standalone: true,
  imports: [TranslatePipe, PluralPipe, HlmButton, AppIconComponent],
})
export class ReceiptProductBackfillComponent {
  public readonly groupId = input.required<number>();

  public readonly requesting = signal(false);

  /** How many receipts the last click queued; undefined before any click. */
  public readonly queued = signal<number | undefined>(undefined);

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  public readonly canQueue = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsUpdate)
  );

  constructor(
    private receiptProductService: ReceiptProductService,
    private store: Store
  ) {}

  public queueOlderReceipts(): void {
    this.requesting.set(true);
    this.receiptProductService
      .queueGroupReceiptProducts(this.groupId())
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.queued.set(result.queued);
          this.requesting.set(false);
        },
        error: () => this.requesting.set(false),
      });
  }
}
