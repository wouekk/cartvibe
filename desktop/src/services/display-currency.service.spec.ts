import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { DisplayCurrencyService } from "./display-currency.service";
import { seedStore } from "../testing/seed-store";
import { AuthStore } from "../store/auth.store";

describe("DisplayCurrencyService", () => {
  let service: DisplayCurrencyService;
  let store: Store;

  const setPreferences = (userPreferences: unknown) =>
    seedStore(TestBed.inject(AuthStore), { ...store.snapshot().auth, userPreferences });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NgxsModule.forRoot([])] });
    store = TestBed.inject(Store);
    service = TestBed.inject(DisplayCurrencyService);
  });

  it("formats in the household currency", () => {
    expect(service.format(12.5)).toContain("12.50");
    expect(service.format(null)).toContain("0.00");
  });

  it("ignores a Dashboard currency an older version stored in a person's preferences", () => {
    setPreferences({ displayCurrency: "PLN", displayCurrencyRate: "4.25" });

    expect(service.format("10")).toContain("10.00");
    expect(service.format("10")).not.toMatch(/42[.,]50/);
  });
});
