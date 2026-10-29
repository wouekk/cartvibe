import { TestBed } from "@angular/core/testing";
import { CheckedProduct } from "./product-check.models";
import { RECENT_PRODUCTS_KEY, RECENT_PRODUCTS_LIMIT, RecentProductsService } from "./recent-products.service";

function product(code: string): CheckedProduct {
  return {
    code,
    name: `Product ${code}`,
    brand: "",
    imageUrl: null,
    nutriScore: null,
    nova: null,
    additiveTags: [],
    nutrition: { energyKcal: null, sugars: null, saturatedFat: null, salt: null, fiber: null, proteins: null },
    levels: { sugars: null, saturatedFat: null, salt: null, fat: null },
  };
}

describe("RecentProductsService", () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps the newest first, without repeats, up to the limit", () => {
    const service = TestBed.inject(RecentProductsService);

    for (let i = 1; i <= RECENT_PRODUCTS_LIMIT + 2; i++) {
      service.add(product(String(i)));
    }
    service.add(product("5"));

    const codes = service.products().map((item) => item.code);
    expect(codes.length).toBe(RECENT_PRODUCTS_LIMIT);
    expect(codes[0]).toBe("5");
    expect(codes.filter((code) => code === "5").length).toBe(1);
  });

  it("is restored from storage and ignores junk in it", () => {
    localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify([product("1"), { nonsense: true }, null]));

    expect(TestBed.inject(RecentProductsService).products().map((item) => item.code)).toEqual(["1"]);
  });

  it("starts empty when storage holds something unreadable", () => {
    localStorage.setItem(RECENT_PRODUCTS_KEY, "{not json");

    expect(TestBed.inject(RecentProductsService).products()).toEqual([]);
  });

  it("still works when storage refuses writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const service = TestBed.inject(RecentProductsService);

    expect(() => service.add(product("1"))).not.toThrow();
    expect(service.products().length).toBe(1);
  });

  it("clears the list and the storage", () => {
    const service = TestBed.inject(RecentProductsService);
    service.add(product("1"));
    service.clear();

    expect(service.products()).toEqual([]);
    expect(localStorage.getItem(RECENT_PRODUCTS_KEY)).toBe("[]");
  });
});
