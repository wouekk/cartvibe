import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { AuthState } from "../store/auth.state";
import { SystemSettingsState } from "../store/system-settings.state";
import { DisplayCurrencyService } from "./display-currency.service";

describe("DisplayCurrencyService", () => {
  let service: DisplayCurrencyService;
  let store: Store;

  const setPreferences = (userPreferences: unknown) =>
    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, userPreferences } });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NgxsModule.forRoot([AuthState, SystemSettingsState])] });
    store = TestBed.inject(Store);
    service = TestBed.inject(DisplayCurrencyService);
  });

  it("formats like the household without a code and a rate", () => {
    setPreferences({ displayCurrency: "", displayCurrencyRate: null });

    expect(service.conversion()).toBeUndefined();
    expect(service.format(12.5)).toContain("12.50");
  });

  it("converts by the rate in the chosen currency", () => {
    setPreferences({ displayCurrency: "PLN", displayCurrencyRate: "4.25" });

    expect(service.conversion()).toEqual({ code: "PLN", rate: 4.25 });
    expect(service.format("10")).toMatch(/42[.,]50/);
  });

  it("ignores a code without a usable rate", () => {
    setPreferences({ displayCurrency: "PLN", displayCurrencyRate: "0" });

    expect(service.conversion()).toBeUndefined();
  });
});
