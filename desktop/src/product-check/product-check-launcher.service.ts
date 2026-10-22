import { inject, Injectable } from "@angular/core";
import { AppDialog, AppDialogRef } from "../dialog/app-dialog";
import { BarcodeScannerDialogComponent } from "./barcode-scanner-dialog.component";
import { canUseCamera } from "./barcode-scanner.service";
import { ProductCheckDrawerComponent } from "./product-check-drawer.component";
import { ProductCheckService } from "./product-check.service";

/**
 * Starts a product check from a button (the Dashboard's "Scan product"). With a camera it opens the scanner and shows the
 * barcode it reads in the drawer; without one (no secure context, no device) it opens the drawer, which then asks for the
 * barcode to be typed.
 */
@Injectable({ providedIn: "root" })
export class ProductCheckLauncher {
  private readonly dialog = inject(AppDialog);
  private readonly service = inject(ProductCheckService);

  private drawer: AppDialogRef<ProductCheckDrawerComponent> | null = null;

  public start(): void {
    if (canUseCamera()) {
      this.scan();
    } else {
      this.openDrawer();
    }
  }

  public scan(): void {
    this.dialog
      .open<BarcodeScannerDialogComponent, unknown, string>(BarcodeScannerDialogComponent, {
        width: "28rem",
        autoFocus: "dialog",
      })
      .afterClosed()
      .subscribe((code) => {
        if (code) {
          this.service.check(code);
          this.openDrawer();
        }
      });
  }

  public openDrawer(): void {
    if (this.drawer) {
      return;
    }

    this.drawer = this.dialog.open<ProductCheckDrawerComponent>(ProductCheckDrawerComponent, {
      width: "28rem",
      minWidth: "0",
      maxWidth: "100vw",
      height: "100dvh",
      maxHeight: "100dvh",
      autoFocus: "dialog",
      panelClass: "product-check-drawer",
    });
    this.drawer.afterClosed().subscribe(() => (this.drawer = null));
  }
}
