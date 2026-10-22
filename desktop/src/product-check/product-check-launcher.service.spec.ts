import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { AppDialog } from "../dialog/app-dialog";
import { ProductCheckDialogComponent } from "./product-check-dialog.component";
import { ProductCheckLauncher } from "./product-check-launcher.service";

describe("ProductCheckLauncher", () => {
  let open: jest.Mock;
  let launcher: ProductCheckLauncher;

  beforeEach(() => {
    open = jest.fn().mockReturnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({ providers: [{ provide: AppDialog, useValue: { open } }] });
    launcher = TestBed.inject(ProductCheckLauncher);
  });

  it("opens one centered dialog, camera or not (no drawer panel)", () => {
    launcher.start();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(ProductCheckDialogComponent);
    expect(open.mock.calls[0][1].panelClass).toBeUndefined();
    expect(open.mock.calls[0][1].width).toBe("32rem");
  });

  it("does not stack a second dialog on the first", () => {
    open.mockReturnValue({ afterClosed: () => ({ subscribe: () => undefined }) });

    launcher.start();
    launcher.start();

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens again once the first is closed", () => {
    launcher.start();
    launcher.start();

    expect(open).toHaveBeenCalledTimes(2);
  });
});
