import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideStore, Store } from "@ngxs/store";
import { SetAuthState } from "../../store";
import { AuthState } from "../../store/auth.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetFeatureConfig } from "../../store/feature-config.state.actions";
import { ShopLogoCatalog } from "./shop-logo-catalog.service";

describe("ShopLogoCatalog", () => {
  let store: Store;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideStore([AuthState, FeatureConfigState]), provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(Store);
    http = TestBed.inject(HttpTestingController);
  });

  const signIn = () => store.dispatch(new SetAuthState({ exp: Math.floor(Date.now() / 1000) + 3600 } as any));
  const logosOn = (on: boolean) =>
    store.dispatch(new SetFeatureConfig({ enableLocalSignUp: false, aiPoweredReceipts: false, shopLogosEnabled: on }));

  it("asks the server for nothing while the household has no Logo.dev key", () => {
    signIn();
    logosOn(false);
    const catalog = TestBed.inject(ShopLogoCatalog);
    TestBed.tick();

    http.expectNone("/api/shopLogo");
    expect(catalog.candidates()).toEqual([]);
  });

  it("loads the downloaded logos once signed in with logos on", () => {
    signIn();
    logosOn(true);
    const catalog = TestBed.inject(ShopLogoCatalog);
    TestBed.tick();

    http.expectOne("/api/shopLogo").flush([{ slug: "lidl", name: "Lidl", aliases: ["lidl polska"] }]);

    expect(catalog.candidates().map((candidate) => candidate.text)).toEqual(["lidl polska", "lidl", "lidl"]);
    expect(catalog.logoUrl("lidl")).toBe("/api/shopLogo/lidl");
  });

  it("shows letters when the list cannot be loaded", () => {
    signIn();
    logosOn(true);
    const catalog = TestBed.inject(ShopLogoCatalog);
    TestBed.tick();

    http.expectOne("/api/shopLogo").flush("down", { status: 500, statusText: "Server Error" });

    expect(catalog.candidates()).toEqual([]);
  });
});
