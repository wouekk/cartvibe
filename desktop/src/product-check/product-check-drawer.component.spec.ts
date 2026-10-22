import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialogRef } from "../dialog/app-dialog";
import * as scanner from "./barcode-scanner.service";
import { sampleProduct } from "./fixtures";
import { BarcodeImageService } from "./barcode-image.service";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { ProductCheckDrawerComponent } from "./product-check-drawer.component";
import { ProductCheckService } from "./product-check.service";

describe("ProductCheckDrawerComponent", () => {
  let fixture: ComponentFixture<ProductCheckDrawerComponent>;
  let service: ProductCheckService;
  const close = jest.fn();
  const decode = jest.fn();

  const element = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const text = (testId: string): string => (element(testId)?.textContent ?? "").replace(/\s+/g, " ").trim();

  const render = async () => {
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [ProductCheckDrawerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AppDialogRef, useValue: { close } },
        { provide: OpenFoodFactsService, useValue: { getByBarcode: jest.fn(), search: jest.fn() } },
        { provide: BarcodeImageService, useValue: { decode } },
      ],
    }).compileComponents();

    service = TestBed.inject(ProductCheckService);
    fixture = TestBed.createComponent(ProductCheckDrawerComponent);
    await render();
  });

  afterEach(() => jest.restoreAllMocks());

  it("explains what to do before anything was checked", () => {
    expect(element("product-check-idle")).not.toBeNull();
  });

  it("shows the verdict: health score, Nutri-Score and NOVA", async () => {
    service.showProduct(sampleProduct());
    await render();

    expect(text("product-check-name")).toBe("Nutella");
    // Nutri-Score E (20) and NOVA 4 (20) make 20, less 15 for the high-risk nitrite.
    expect(text("product-check-score")).toContain("5 / 100");
    expect(text("product-check-nutriscore")).toContain("e");
    expect(text("product-check-nova")).toContain("4");
  });

  it("lists additives from the highest risk down, each with its category", async () => {
    service.showProduct(sampleProduct());
    await render();

    const rows = Array.from(fixture.nativeElement.querySelectorAll('[data-testid^="product-check-additive-"]')) as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(["product-check-additive-E250", "product-check-additive-E322"]);
    expect(rows[0].textContent).toContain("Sodium nitrite");
    expect(rows[0].textContent).toContain("High risk");
    expect(rows[0].textContent).toContain("Preservative");
    expect(rows[1].textContent).toContain("Safe");
  });

  it("says when there are no additives", async () => {
    service.showProduct(sampleProduct({ additiveTags: [] }));
    await render();

    expect(fixture.nativeElement.textContent).toContain("No additives listed.");
  });

  it("shows nutrition per 100 g with dashes for missing figures", async () => {
    service.showProduct(sampleProduct());
    await render();

    expect(text("product-check-nutrient-sugars")).toContain("56 g");
    expect(text("product-check-nutrient-salt")).toContain("0.11 g");
    expect(text("product-check-nutrient-energy")).toContain("539 kcal");
    expect(text("product-check-nutrient-fiber")).toContain("—");
  });

  it("switches between recent scans from the pills", async () => {
    service.showProduct(sampleProduct());
    service.showProduct(sampleProduct({ code: "5449000000996", name: "Cola", additiveTags: [] }));
    await render();
    expect(text("product-check-name")).toBe("Cola");

    element("product-check-recent-3017620422003")?.click();
    await render();

    expect(text("product-check-name")).toBe("Nutella");
    expect(fixture.nativeElement.querySelectorAll('[data-testid^="product-check-recent-"]').length).toBe(2);
  });

  it.each([
    ["loading", "product-check-loading"],
    ["notFound", "product-check-not-found"],
    ["error", "product-check-error"],
    ["needsBarcode", "product-check-needs-barcode"],
  ] as const)("has a designed %s state", async (status, testId) => {
    service.status.set(status);
    await render();

    expect(element(testId)).not.toBeNull();
  });

  it("asks for the barcode to be typed only when there is no camera", async () => {
    // The test browser has no camera, so the field is there; with one it is not.
    expect(element("product-check-barcode")).not.toBeNull();

    const lookup = jest.spyOn(service, "check").mockImplementation();
    const box = element("product-check-barcode") as HTMLInputElement;
    box.value = "3017620422003";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(lookup).toHaveBeenCalledWith("3017620422003");

    jest.spyOn(scanner, "canUseCamera").mockReturnValue(true);
    const withCamera = TestBed.createComponent(ProductCheckDrawerComponent);
    await withCamera.whenStable();
    expect(withCamera.nativeElement.querySelector('[data-testid="product-check-barcode"]')).toBeNull();
  });

  describe("without live video (plain http, no device)", () => {
    const photo = () => new File(["x"], "code.jpg", { type: "image/jpeg" });

    const choose = async (testId: string) => {
      const input = element(testId) as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [photo()], configurable: true });
      input.dispatchEvent(new Event("change"));
      await fixture.whenStable();
      await Promise.resolve();
      await render();
    };

    it("puts the take-photo and upload-photo labels at the top, and a camera icon in the barcode field", () => {
      const bar = element("barcode-photo-bar") as HTMLElement;
      expect(bar).not.toBeNull();
      expect(bar.querySelector("input[capture=environment]")).not.toBeNull();
      expect(bar.querySelector("input[type=file]:not([capture])")).not.toBeNull();
      expect(element("barcode-photo-icon")).not.toBeNull();
      expect((element("product-check-barcode-box") as HTMLElement).contains(element("barcode-photo-icon"))).toBe(true);
    });

    it("fills the barcode field and looks the product up when the photo is read", async () => {
      decode.mockResolvedValue("3017620422003");
      const lookup = jest.spyOn(service, "check").mockImplementation();

      await choose("barcode-photo-upload");

      expect(lookup).toHaveBeenCalledWith("3017620422003");
      expect((element("product-check-barcode") as HTMLInputElement).value).toBe("3017620422003");
    });

    it("shows a clear message when the photo has no barcode", async () => {
      decode.mockResolvedValue(null);

      await choose("barcode-photo-upload");

      expect(element("product-check-photo-failed")).not.toBeNull();
      expect(service.status()).toBe("photoFailed");
    });
  });

  it("offers no photo labels when live video works", async () => {
    jest.spyOn(scanner, "canUseCamera").mockReturnValue(true);
    const withCamera = TestBed.createComponent(ProductCheckDrawerComponent);
    await withCamera.whenStable();

    expect(withCamera.nativeElement.querySelector('[data-testid="barcode-photo-bar"]')).toBeNull();
  });

  it("closes from the header button", () => {
    element("product-check-close")?.click();

    expect(close).toHaveBeenCalled();
  });
});
