import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialogRef } from "../dialog/app-dialog";
import { sampleProduct } from "./fixtures";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { ProductCheckDrawerComponent } from "./product-check-drawer.component";
import { ProductCheckService } from "./product-check.service";

describe("ProductCheckDrawerComponent", () => {
  let fixture: ComponentFixture<ProductCheckDrawerComponent>;
  let service: ProductCheckService;
  const close = jest.fn();

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
      ],
    }).compileComponents();

    service = TestBed.inject(ProductCheckService);
    fixture = TestBed.createComponent(ProductCheckDrawerComponent);
    await render();
  });

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

  it("lists search results and opens the one picked, with a way back", async () => {
    service.results.set([sampleProduct(), sampleProduct({ code: "2", name: "Other spread" })]);
    service.status.set("results");
    await render();

    element("product-check-result-2")?.click();
    await render();
    expect(text("product-check-name")).toBe("Other spread");

    element("product-check-back")?.click();
    await render();
    expect(element("product-check-results")).not.toBeNull();
  });

  it.each([
    ["loading", "product-check-loading"],
    ["notFound", "product-check-not-found"],
    ["error", "product-check-error"],
  ] as const)("has a designed %s state", async (status, testId) => {
    service.status.set(status);
    await render();

    expect(element(testId)).not.toBeNull();
  });

  it("closes from the header button", () => {
    element("product-check-close")?.click();

    expect(close).toHaveBeenCalled();
  });
});
