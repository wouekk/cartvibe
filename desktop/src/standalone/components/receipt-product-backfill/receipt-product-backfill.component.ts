import { TranslatePipe } from "../../../i18n/translate.pipe";
import { Component, computed, input, signal, ChangeDetectionStrategy, inject } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../../../shared-ui/icon/icon.component";
import { take } from "rxjs";
import { Permission, ReceiptProductService } from "../../../open-api";
import { AuthStore } from "../../../store";
import { hasAll } from "../../../utils/permission.utils";

/**
 * Queues a group's older receipts — those with an image whose products were never read — for the AI
 * to read. New receipts are read automatically; this is the one-off catch-up. Hidden without
 * group.receipts.update, which the endpoint requires.
 */
@Component({
  selector: "app-receipt-product-backfill",
  host: { class: "block" },
  templateUrl: "./receipt-product-backfill.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TranslatePipe, HlmButton, AppIconComponent],
})
export class ReceiptProductBackfillComponent {
  private readonly authStore = inject(AuthStore);

  public readonly groupId = input.required<number>();

  public readonly requesting = signal(false);

  /** How many receipts the last click queued; undefined before any click. */
  public readonly queued = signal<number | undefined>(undefined);

  private readonly groupPermissions = this.authStore.groupPermissions;

  public readonly canQueue = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsUpdate)
  );

  constructor(
    private receiptProductService: ReceiptProductService
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
