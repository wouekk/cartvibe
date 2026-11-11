import { AppDialog } from "../../dialog/app-dialog";
import { firstValueFrom, of } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { openQuickScanDialog } from "./open-quick-scan-dialog";
import { QuickScanDialogComponent } from "./quick-scan-dialog.component";

describe("openQuickScanDialog", () => {
  // A plain function over AppDialog — no TestBed needed, and a double keeps the
  // real dialog (and its whole component tree) out of the test.
  function dialogDouble(afterClosed = of(undefined)) {
    return {
      open: vi.fn().mockReturnValue({ afterClosed: () => afterClosed }),
    } as unknown as AppDialog;
  }

  it("opens the quick scan dialog with the shared dialog config", () => {
    const dialog = dialogDouble();

    openQuickScanDialog(dialog);

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(
      QuickScanDialogComponent,
      DEFAULT_DIALOG_CONFIG
    );
  });

  // Both call sites (the icon button and the receipts-table overflow item)
  // refetch off this observable, so it has to be the dialog's own afterClosed.
  it("returns the dialog's afterClosed observable", async () => {
    const afterClosed = of("closed");
    const dialog = dialogDouble(afterClosed as any);

    const result = openQuickScanDialog(dialog);

    expect(result).toBe(afterClosed);
    expect(await firstValueFrom(result)).toEqual("closed");
  });
});
