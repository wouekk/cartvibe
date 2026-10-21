import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { AppDialog, AppDialogRef } from "../dialog/app-dialog";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodeScannerDialogComponent } from "./barcode-scanner-dialog.component";
import { canUseCamera } from "./barcode-scanner.service";
import { ProductCheckDrawerComponent } from "./product-check-drawer.component";
import { ProductCheckService } from "./product-check.service";

/**
 * The header's "Check a product barcode" box. Enter looks up the barcode that was typed and the camera button scans one;
 * both end in the same slide-over drawer. Nothing here talks to our API.
 */
@Component({
  selector: "app-product-check-input",
  standalone: true,
  imports: [FormsModule, HlmInputGroupImports, AppIconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <div hlmInputGroup>
      <div hlmInputGroupAddon><app-icon name="search"></app-icon></div>
      <input
        hlmInputGroupInput
        type="search"
        inputmode="numeric"
        enterkeyhint="search"
        autocomplete="off"
        data-testid="product-check-input"
        [placeholder]="'Check a product barcode…' | t"
        [attr.aria-label]="'Check a product barcode' | t"
        [ngModel]="text()"
        (ngModelChange)="text.set($event)"
        (keydown.enter)="submit()"
      />
      @if (cameraAvailable) {
        <div hlmInputGroupAddon align="inline-end">
          <button
            hlmInputGroupButton
            type="button"
            size="icon-sm"
            data-testid="product-check-scan"
            [attr.aria-label]="'Scan a barcode' | t"
            (click)="scan()"
          >
            <app-icon name="barcode_scanner"></app-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class ProductCheckInputComponent {
  private readonly service = inject(ProductCheckService);
  private readonly dialog = inject(AppDialog);

  private drawer: AppDialogRef<ProductCheckDrawerComponent> | null = null;

  public readonly text = signal("");

  /** Without a secure context (plain http on a LAN) the browser offers no camera, so the button is not drawn. */
  public readonly cameraAvailable = canUseCamera();

  public submit(): void {
    const value = this.text().trim();
    if (!value) {
      return;
    }

    this.service.check(value);
    this.openDrawer();
  }

  public scan(): void {
    this.dialog
      .open<BarcodeScannerDialogComponent, unknown, string>(BarcodeScannerDialogComponent, {
        width: "28rem",
        autoFocus: "dialog",
        panelClass: "product-check-scanner",
      })
      .afterClosed()
      .subscribe((code) => {
        if (code) {
          this.text.set(code);
          this.service.check(code);
          this.openDrawer();
        }
      });
  }

  private openDrawer(): void {
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
