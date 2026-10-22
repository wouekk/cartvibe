import { Component, inject, output } from "@angular/core";
import { take, tap } from "rxjs";
import { QuickScanLauncher } from "../../receipts/quick-scan-dialog/quick-scan-launcher.service";

@Component({
    selector: "app-quick-scan-button",
    templateUrl: "./quick-scan-button.component.html",
    styleUrls: ["./quick-scan-button.component.scss"],
    standalone: false
})
export class QuickScanButtonComponent {
  public readonly afterClosed = output<void>();

  private readonly quickScanLauncher = inject(QuickScanLauncher);

  /** Shown with or without an AI key: the launcher asks for one when it is missing. */
  public showQuickScanDialog(): void {
    this.quickScanLauncher
      .open()
      .pipe(
        take(1),
        tap(() => {
          this.afterClosed.emit();
        })
      )
      .subscribe();
  }
}
