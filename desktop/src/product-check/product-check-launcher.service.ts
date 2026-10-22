import { inject, Injectable } from "@angular/core";
import { AppDialog, AppDialogRef } from "../dialog/app-dialog";
import { ProductCheckDialogComponent } from "./product-check-dialog.component";

/**
 * Starts a product check from a button (the Dashboard's "Scan product"): one centered dialog offering a photo of the
 * code (the live scanner where the browser has one), an uploaded photo, or the typed barcode number.
 */
@Injectable({ providedIn: "root" })
export class ProductCheckLauncher {
  private readonly dialog = inject(AppDialog);

  private ref: AppDialogRef<ProductCheckDialogComponent> | null = null;

  public start(): void {
    if (this.ref) {
      return;
    }

    this.ref = this.dialog.open<ProductCheckDialogComponent>(ProductCheckDialogComponent, {
      width: "32rem",
      autoFocus: "dialog",
    });
    this.ref.afterClosed().subscribe(() => (this.ref = null));
  }
}
