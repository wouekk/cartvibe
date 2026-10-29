import { TestBed } from "@angular/core/testing";
import { Subject, of, throwError } from "rxjs";
import { sampleProduct } from "./fixtures";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { CheckedProduct } from "./product-check.models";
import { ProductCheckService } from "./product-check.service";

import type { Mock } from "vitest";
describe("ProductCheckService", () => {
  let openFoodFacts: { getByBarcode: Mock };
  let service: ProductCheckService;

  beforeEach(() => {
    localStorage.clear();
    openFoodFacts = { getByBarcode: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: OpenFoodFactsService, useValue: openFoodFacts }] });
    service = TestBed.inject(ProductCheckService);
  });

  it("looks up a valid barcode and remembers the product", () => {
    openFoodFacts.getByBarcode.mockReturnValue(of(sampleProduct()));

    service.check(" 3017 620422003 ");

    expect(openFoodFacts.getByBarcode).toHaveBeenCalledWith("3017620422003");
    expect(service.status()).toBe("product");
    expect(service.product()?.name).toBe("Nutella");
    expect(service.recentProducts().map((item) => item.code)).toEqual(["3017620422003"]);
  });

  it.each(["nutella", "7up", "12345", "3017620422004"])("turns down %s without asking Open Food Facts", (input) => {
    service.check(input);

    expect(service.status()).toBe("needsBarcode");
    expect(openFoodFacts.getByBarcode).not.toHaveBeenCalled();
  });

  it("reports an unknown barcode as not found", () => {
    openFoodFacts.getByBarcode.mockReturnValue(of(null));

    service.check("3017620422003");

    expect(service.status()).toBe("notFound");
  });

  it("reports a failed request as an error", () => {
    openFoodFacts.getByBarcode.mockReturnValue(throwError(() => new Error("offline")));

    service.check("3017620422003");

    expect(service.status()).toBe("error");
  });

  it("shows loading while the lookup is out", () => {
    openFoodFacts.getByBarcode.mockReturnValue(new Subject<CheckedProduct | null>());

    service.check("3017620422003");

    expect(service.status()).toBe("loading");
  });

  it("ignores a slow answer that arrives after a newer request", () => {
    const slow = new Subject<CheckedProduct | null>();
    openFoodFacts.getByBarcode.mockReturnValueOnce(slow).mockReturnValueOnce(of(sampleProduct({ code: "5449000000996", name: "Cola" })));

    service.check("3017620422003");
    service.check("5449000000996");
    slow.next(sampleProduct());

    expect(service.status()).toBe("product");
    expect(service.product()?.name).toBe("Cola");
  });

  it("reports a photo with no barcode, then recovers on the next lookup", () => {
    service.photoFailed();
    expect(service.status()).toBe("photoFailed");

    openFoodFacts.getByBarcode.mockReturnValue(of(sampleProduct()));
    service.check("3017620422003");
    expect(service.status()).toBe("product");
  });

  it("does nothing for blank input", () => {
    service.check("   ");

    expect(service.status()).toBe("idle");
    expect(openFoodFacts.getByBarcode).not.toHaveBeenCalled();
  });
});
