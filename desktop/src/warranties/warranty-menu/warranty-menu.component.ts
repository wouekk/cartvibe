import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { Store } from "@ngxs/store";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { filter, take } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { Permission, ReceiptService } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { AuthState } from "../../store";
import { hasAll } from "../../utils/permission.utils";
import { WarrantyDateDialogComponent, WarrantyDateDialogData } from "./warranty-date-dialog.component";

/**
 * A warranty row's more_vert menu (Warranties page and the Dashboard panel): Edit changes the warranty's last day,
 * Remove clears it from the receipt, which stays. Both go through PUT /receipt/{id}/warranty, which plans the reminders
 * again. Shown only to someone who may update receipts in the receipt's own group.
 */
@Component({
  selector: "app-warranty-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, ...HlmDropdownMenuImports, AppIconComponent, TranslatePipe],
  template: `
    @if (canUpdate()) {
      <button
        hlmBtn variant="ghost" size="icon"
        type="button"
        class="-my-1 size-8 shrink-0"
        data-testid="warranty-menu"
        [disabled]="saving()"
        [attr.aria-label]="'Warranty actions' | t"
        [hlmDropdownMenuTrigger]="warrantyMenu" align="end"
      >
        <app-icon name="more_vert"></app-icon>
      </button>
    }

    <ng-template #warrantyMenu>
      <div hlmDropdownMenu class="w-56">
        <button hlmDropdownMenuItem data-testid="warranty-edit" (click)="edit()">
          <app-icon name="edit"></app-icon>
          <span>{{ 'Edit' | t }}</span>
        </button>
        <button hlmDropdownMenuItem variant="destructive" data-testid="warranty-remove" (click)="remove()">
          <app-icon name="delete"></app-icon>
          <span>{{ 'Remove' | t }}</span>
        </button>
      </div>
    </ng-template>
  `,
})
export class WarrantyMenuComponent {
  private readonly store = inject(Store);
  private readonly dialog = inject(AppDialog);
  private readonly receiptService = inject(ReceiptService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translation = inject(TranslationService);

  public readonly receiptId = input.required<number>();

  public readonly groupId = input.required<number>();

  public readonly shop = input.required<string>();

  /** The current last day, "yyyy-MM-dd". */
  public readonly warrantyUntil = input.required<string>();

  /** Emits after a save, so the list loads again. */
  public readonly changed = output<void>();

  public readonly saving = signal(false);

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  /** Gated on the receipt's own group, never the page's: the "All" view lists receipts of several groups. */
  public readonly canUpdate = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsUpdate)
  );

  public edit(): void {
    const ref = this.dialog.open<WarrantyDateDialogComponent, WarrantyDateDialogData, string>(WarrantyDateDialogComponent, {
      ...DEFAULT_DIALOG_CONFIG,
      data: { shop: this.shop(), warrantyUntil: this.warrantyUntil() },
    });
    ref
      .afterClosed()
      .pipe(filter((day): day is string => !!day && day !== this.warrantyUntil()))
      .subscribe((day) => this.persist(day));
  }

  public remove(): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, DEFAULT_DIALOG_CONFIG);
    ref.componentInstance.headerText = marker("Remove warranty");
    ref.componentInstance.confirmText = marker("Remove");
    ref.componentInstance.dialogContent = this.translation.t(
      "Remove the warranty from this receipt: {name}? The receipt and its photos stay; only the warranty date and its reminder go.",
      { name: this.shop() }
    );
    ref
      .afterClosed()
      .pipe(filter((confirmed) => !!confirmed))
      .subscribe(() => this.persist(null));
  }

  private persist(day: string | null): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.receiptService
      // "" clears the date (the API reads an empty day as no warranty).
      .setReceiptWarranty(this.receiptId(), { warrantyUntil: day ?? "" })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snackbarService.success(day ? marker("Warranty date saved") : marker("Warranty date removed"));
          this.changed.emit();
        },
        // The interceptor toasts the error.
        error: () => this.saving.set(false),
      });
  }
}
