import { Component, inject, output, ChangeDetectionStrategy } from "@angular/core";
import { take, tap } from "rxjs";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../icon/icon.component";
import { QuickScanLauncher } from "../../receipts/quick-scan-dialog/quick-scan-launcher.service";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-quick-scan-button",
    templateUrl: "./quick-scan-button.component.html",
    styleUrls: ["./quick-scan-button.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ TranslatePipe, HlmButton, HlmTooltip, AppIconComponent]
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
