import { inject, Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { EMPTY, Observable, take } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { Permission } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store/auth.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { openQuickScanDialog } from "./open-quick-scan-dialog";

/**
 * The one way every Quick Scan entry starts a scan. Quick Scan stays visible without an AI key; clicking it then asks
 * whether to add one (and goes to the AI page on yes) instead of opening a dialog that could never read a receipt. A
 * member who may not set the AI up is told to ask an admin.
 *
 * `open()` emits once the scan dialog closes, so a caller can refresh; it completes without emitting when no scan ran.
 */
@Injectable({ providedIn: "root" })
export class QuickScanLauncher {
  private readonly dialog = inject(AppDialog);
  private readonly router = inject(Router);
  private readonly snackbarService = inject(SnackbarService);
  private readonly store = inject(Store);
  private readonly translation = inject(TranslationService);

  public open(): Observable<unknown> {
    if (this.store.selectSnapshot(FeatureConfigState.aiPoweredReceipts)) {
      return openQuickScanDialog(this.dialog);
    }

    if (this.store.selectSnapshot(AuthState.hasAppPermission(Permission.AppReceiptProcessingSettingsUpdate))) {
      this.askToAddAiKey();
    } else {
      this.snackbarService.hint(this.translation.t(marker("Scanning needs an AI API key. Ask an admin to add one.")));
    }

    return EMPTY;
  }

  private askToAddAiKey(): void {
    const ref = this.dialog.open(ConfirmationDialogComponent);
    ref.componentInstance.headerText = marker("AI API key needed");
    ref.componentInstance.dialogContent = marker(
      "You have to add an AI API key to use Quick Scan. Would you like to go to the AI settings?"
    );
    ref.componentInstance.confirmText = marker("Add AI API key");

    ref
      .afterClosed()
      .pipe(take(1))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.router.navigate(["/ai"]);
        }
      });
  }
}
