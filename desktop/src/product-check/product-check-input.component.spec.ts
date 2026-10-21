import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { AppDialog } from "../dialog/app-dialog";
import * as scanner from "./barcode-scanner.service";
import { ProductCheckInputComponent } from "./product-check-input.component";
import { ProductCheckService } from "./product-check.service";

describe("ProductCheckInputComponent", () => {
  let fixture: ComponentFixture<ProductCheckInputComponent>;
  let check: jest.Mock;
  let open: jest.Mock;

  const create = async (camera: boolean) => {
    jest.spyOn(scanner, "canUseCamera").mockReturnValue(camera);
    fixture = TestBed.createComponent(ProductCheckInputComponent);
    await fixture.whenStable();
  };

  const input = (): HTMLInputElement => fixture.nativeElement.querySelector('[data-testid="product-check-input"]');
  const scanButton = (): HTMLElement | null => fixture.nativeElement.querySelector('[data-testid="product-check-scan"]');

  const type = async (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event("input"));
    await fixture.whenStable();
  };

  const enter = async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    check = jest.fn();
    open = jest.fn().mockReturnValue({ afterClosed: () => of(undefined) });
    await TestBed.configureTestingModule({
      imports: [ProductCheckInputComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProductCheckService, useValue: { check } },
        { provide: AppDialog, useValue: { open } },
      ],
    }).compileComponents();
  });

  afterEach(() => jest.restoreAllMocks());

  it("checks what was typed on Enter and opens the drawer", async () => {
    await create(false);
    await type(" 3017620422003 ");

    await enter();

    expect(check).toHaveBeenCalledWith("3017620422003");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].panelClass).toBe("product-check-drawer");
  });

  it("does nothing for an empty box", async () => {
    await create(false);

    await enter();

    expect(check).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("hides the camera button when the browser offers no camera (plain http, old browsers)", async () => {
    await create(false);

    expect(scanButton()).toBeNull();
  });

  it("scans with the camera, then checks the barcode in the drawer", async () => {
    await create(true);
    open.mockReturnValueOnce({ afterClosed: () => of("3017620422003") });

    scanButton()?.click();
    await fixture.whenStable();

    expect(check).toHaveBeenCalledWith("3017620422003");
    expect(input().value).toBe("3017620422003");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("does not check anything when the scanner is dismissed", async () => {
    await create(true);

    scanButton()?.click();
    await fixture.whenStable();

    expect(check).not.toHaveBeenCalled();
  });
});
