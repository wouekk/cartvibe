import { TestBed } from "@angular/core/testing";
import { Subject, of, throwError } from "rxjs";
import { sampleProduct } from "./fixtures";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { CheckedProduct } from "./product-check.models";
import { ProductCheckService } from "./product-check.service";

describe("ProductCheckService", () => {
  let openFoodFacts: { getByBarcode: jest.Mock; search: jest.Mock };
  let service: ProductCheckService;

  beforeEach(() => {
    localStorage.clear();
    openFoodFacts = { getByBarcode: jest.fn(), search: jest.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: OpenFoodFactsService, useValue: openFoodFacts }] });
    service = TestBed.inject(ProductCheckService);
  });

  it("looks up a valid barcode and remembers the product", () => {
    openFoodFacts.getByBarcode.mockReturnValue(of(sampleProduct()));

    service.check(" 3017620422003 ");

    expect(openFoodFacts.getByBarcode).toHaveBeenCalledWith("3017620422003");
    expect(openFoodFacts.search).not.toHaveBeenCalled();
    expect(service.status()).toBe("product");
    expect(service.product()?.name).toBe("Nutella");
    expect(service.recentProducts().map((item) => item.code)).toEqual(["3017620422003"]);
  });

  it("searches for anything that is not a barcode, including digits with a wrong check digit", () => {
    openFoodFacts.search.mockReturnValue(of([sampleProduct(), sampleProduct({ code: "2", name: "Other" })]));

    service.check("3017620422004");

    expect(openFoodFacts.search).toHaveBeenCalledWith("3017620422004");
    expect(service.status()).toBe("results");
    expect(service.results().length).toBe(2);
  });

  it("reports an unknown barcode and an empty search as not found", () => {
    openFoodFacts.getByBarcode.mockReturnValue(of(null));
    service.check("3017620422003");
    expect(service.status()).toBe("notFound");

    openFoodFacts.search.mockReturnValue(of([]));
    service.check("zzzz");
    expect(service.status()).toBe("notFound");
  });

  it("reports a failed request as an error", () => {
    openFoodFacts.getByBarcode.mockReturnValue(throwError(() => new Error("offline")));

    service.check("3017620422003");

    expect(service.status()).toBe("error");
  });

  it("ignores a slow answer that arrives after a newer request", () => {
    const slow = new Subject<CheckedProduct[]>();
    openFoodFacts.search.mockReturnValue(slow);
    openFoodFacts.getByBarcode.mockReturnValue(of(sampleProduct()));

    service.check("nutella");
    expect(service.status()).toBe("loading");
    service.check("3017620422003");
    slow.next([sampleProduct({ code: "9", name: "Late result" })]);

    expect(service.status()).toBe("product");
    expect(service.results()).toEqual([]);
  });

  it("does nothing for blank input", () => {
    service.check("   ");

    expect(service.status()).toBe("idle");
    expect(openFoodFacts.search).not.toHaveBeenCalled();
  });

  it("goes back from a product to the results it came from", () => {
    openFoodFacts.search.mockReturnValue(of([sampleProduct()]));
    service.check("nutella");
    service.showProduct(sampleProduct());

    service.backToResults();

    expect(service.status()).toBe("results");
  });
});
