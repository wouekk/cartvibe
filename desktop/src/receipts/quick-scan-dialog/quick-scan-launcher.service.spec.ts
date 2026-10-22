import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetFeatureConfig } from "../../store/feature-config.state.actions";
import { QuickScanDialogComponent } from "./quick-scan-dialog.component";
import { QuickScanLauncher } from "./quick-scan-launcher.service";

describe("QuickScanLauncher", () => {
  let open: jest.Mock;
  let hint: jest.Mock;
  let store: Store;
  let confirm: { headerText: string; dialogContent: string; confirmText: string };

  const launcher = () => TestBed.inject(QuickScanLauncher);

  beforeEach(() => {
    confirm = { headerText: "", dialogContent: "", confirmText: "" };
    open = jest.fn();
    hint = jest.fn();
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState, FeatureConfigState])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialog, useValue: { open } },
        { provide: SnackbarService, useValue: { hint } },
      ],
    });
    store = TestBed.inject(Store);
  });

  it("opens the scan dialog when the AI is set up, and hands back its afterClosed", () => {
    store.dispatch(new SetFeatureConfig({ aiPoweredReceipts: true } as never));
    open.mockReturnValue({ afterClosed: () => of("closed") });
    const seen: unknown[] = [];

    launcher().open().subscribe((value) => seen.push(value));

    expect(open).toHaveBeenCalledWith(QuickScanDialogComponent, DEFAULT_DIALOG_CONFIG);
    expect(seen).toEqual(["closed"]);
  });

  it("asks a member who may set the AI up to add a key, and goes to the AI page on yes", () => {
    store.dispatch(new SetPermissions([Permission.AppReceiptProcessingSettingsUpdate], {}));
    open.mockReturnValue({ componentInstance: confirm, afterClosed: () => of(true) });
    const navigate = jest.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    let emitted = false;

    launcher().open().subscribe(() => (emitted = true));

    expect(open).toHaveBeenCalledWith(ConfirmationDialogComponent);
    expect(confirm.headerText).toBe("AI API key needed");
    expect(confirm.dialogContent).toContain("You have to add an AI API key to use Quick Scan");
    expect(confirm.confirmText).toBe("Add AI API key");
    expect(navigate).toHaveBeenCalledWith(["/ai"]);
    expect(emitted).toBe(false);
  });

  it("stays put when the question is cancelled", () => {
    store.dispatch(new SetPermissions([Permission.AppReceiptProcessingSettingsUpdate], {}));
    open.mockReturnValue({ componentInstance: confirm, afterClosed: () => of(false) });
    const navigate = jest.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

    launcher().open().subscribe();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("tells a member who cannot set the AI up to ask an admin, with no dialog", () => {
    store.dispatch(new SetPermissions([], {}));

    launcher().open().subscribe();

    expect(open).not.toHaveBeenCalled();
    expect(hint).toHaveBeenCalledWith("Scanning needs an AI API key. Ask an admin to add one.");
  });
});
