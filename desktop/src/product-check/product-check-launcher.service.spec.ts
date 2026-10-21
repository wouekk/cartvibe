import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { AppDialog } from "../dialog/app-dialog";
import * as scanner from "./barcode-scanner.service";
import { ProductCheckLauncher } from "./product-check-launcher.service";
import { ProductCheckService } from "./product-check.service";

describe("ProductCheckLauncher", () => {
  let check: jest.Mock;
  let open: jest.Mock;
  let launcher: ProductCheckLauncher;

  const create = (camera: boolean) => {
    jest.spyOn(scanner, "canUseCamera").mockReturnValue(camera);
    launcher = TestBed.inject(ProductCheckLauncher);
  };

  beforeEach(() => {
    check = jest.fn();
    open = jest.fn().mockReturnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({
      providers: [
        { provide: ProductCheckService, useValue: { check } },
        { provide: AppDialog, useValue: { open } },
      ],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens the scanner first when there is a camera, then the drawer with the barcode it read", () => {
    create(true);
    open.mockReturnValueOnce({ afterClosed: () => of("3017620422003") });

    launcher.start();

    expect(check).toHaveBeenCalledWith("3017620422003");
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1][1].panelClass).toBe("product-check-drawer");
  });

  it("opens only the drawer, for typing a barcode, when there is no camera", () => {
    create(false);

    launcher.start();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].panelClass).toBe("product-check-drawer");
    expect(check).not.toHaveBeenCalled();
  });

  it("checks and opens nothing when the scanner is dismissed", () => {
    create(true);

    launcher.start();

    expect(check).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not stack a second drawer on the first", () => {
    create(false);
    open.mockReturnValue({ afterClosed: () => ({ subscribe: () => undefined }) });

    launcher.openDrawer();
    launcher.openDrawer();

    expect(open).toHaveBeenCalledTimes(1);
  });
});
