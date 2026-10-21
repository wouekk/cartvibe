import { HttpBackend, HttpRequest, HttpResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Observable, of } from "rxjs";
import { OpenFoodFactsService, toCheckedProduct } from "./open-food-facts.service";

class FakeBackend {
  public requests: HttpRequest<unknown>[] = [];
  public body: unknown = {};

  public handle(request: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
    this.requests.push(request);

    return of(new HttpResponse({ status: 200, body: this.body }));
  }
}

const NUTELLA = {
  code: "3017620422003",
  product_name: "Nutella",
  brands: "Ferrero,Nutella",
  image_front_small_url: "https://images.openfoodfacts.org/x.jpg",
  nutriscore_grade: "E",
  nova_group: 4,
  additives_tags: ["en:e322", "en:e476"],
  nutriments: { "energy-kcal_100g": 539, sugars_100g: "56.3", "saturated-fat_100g": 10.6, salt_100g: 0.107, proteins_100g: 6.3 },
  nutrient_levels: { sugars: "high", "saturated-fat": "high", salt: "low", fat: "high" },
};

describe("OpenFoodFactsService", () => {
  let backend: FakeBackend;
  let service: OpenFoodFactsService;

  beforeEach(() => {
    backend = new FakeBackend();
    TestBed.configureTestingModule({ providers: [{ provide: HttpBackend, useValue: backend }] });
    service = TestBed.inject(OpenFoodFactsService);
  });

  it("looks a barcode up on world.openfoodfacts.org without the app's interceptors", (done) => {
    backend.body = { status: 1, product: NUTELLA };

    service.getByBarcode("3017620422003").subscribe((product) => {
      const request = backend.requests[0];
      expect(request.url).toBe("https://world.openfoodfacts.org/api/v2/product/3017620422003.json");
      expect(request.params.get("fields")).toContain("additives_tags");
      expect(product?.name).toBe("Nutella");
      done();
    });
  });

  it("answers null for a barcode Open Food Facts does not know", (done) => {
    backend.body = { status: 0, status_verbose: "product not found" };

    service.getByBarcode("0000000000000").subscribe((product) => {
      expect(product).toBeNull();
      done();
    });
  });

  it("searches by name and drops results without a code or a name", (done) => {
    backend.body = { products: [NUTELLA, { code: "1" }, { product_name: "No code" }] };

    service.search("nutella").subscribe((products) => {
      const request = backend.requests[0];
      expect(request.url).toBe("https://world.openfoodfacts.org/cgi/search.pl");
      expect(request.params.get("search_terms")).toBe("nutella");
      expect(request.params.get("json")).toBe("1");
      expect(products.map((product) => product.code)).toEqual(["3017620422003"]);
      done();
    });
  });

  it("maps a product to the trimmed shape", () => {
    expect(toCheckedProduct(NUTELLA, "x")).toEqual({
      code: "3017620422003",
      name: "Nutella",
      brand: "Ferrero",
      imageUrl: "https://images.openfoodfacts.org/x.jpg",
      nutriScore: "e",
      nova: 4,
      additiveTags: ["en:e322", "en:e476"],
      nutrition: { energyKcal: 539, sugars: 56.3, saturatedFat: 10.6, salt: 0.107, fiber: null, proteins: 6.3 },
      levels: { sugars: "high", saturatedFat: "high", salt: "low", fat: "high" },
    });
  });

  it("copes with a product that has almost nothing", () => {
    const product = toCheckedProduct({ nutriscore_grade: "unknown", nova_group: "9" }, "123");

    expect(product).toEqual(
      jasmineLikeMatch({
        code: "123",
        name: "Unnamed product",
        nutriScore: null,
        nova: null,
        additiveTags: [],
        imageUrl: null,
      })
    );
    expect(product.nutrition.sugars).toBeNull();
    expect(product.levels.salt).toBeNull();
  });
});

function jasmineLikeMatch(partial: Record<string, unknown>) {
  return expect.objectContaining(partial);
}
