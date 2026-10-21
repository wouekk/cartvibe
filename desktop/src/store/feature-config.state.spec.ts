import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { FeatureConfig } from "../open-api";
import { FeatureConfigState } from "./feature-config.state";
import { SetFeatureConfig } from "./feature-config.state.actions";

describe("FeatureConfigState", () => {
  let store: Store;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([FeatureConfigState])],
    });
    store = TestBed.inject(Store);
  });

  it("defaults oidcProviders to an empty array", () => {
    expect(store.selectSnapshot(FeatureConfigState.oidcProviders)).toEqual([]);
  });

  it("patches oidcProviders from SetFeatureConfig", () => {
    store.dispatch(
      new SetFeatureConfig({
        enableLocalSignUp: false,
        aiPoweredReceipts: false,
        oidcProviders: [{ name: "google", displayName: "Google" }],
      })
    );

    expect(store.selectSnapshot(FeatureConfigState.oidcProviders)).toEqual([
      { name: "google", displayName: "Google" },
    ]);
  });

  // The field is optional on the contract, so a server that predates it sends
  // nothing. Consumers still iterate the result, so it must never be undefined.
  it("falls back to an empty array when the payload omits oidcProviders", () => {
    store.dispatch(
      new SetFeatureConfig({
        enableLocalSignUp: false,
        aiPoweredReceipts: false,
      })
    );

    expect(store.selectSnapshot(FeatureConfigState.oidcProviders)).toEqual([]);
  });

  it("keeps the other feature flags when patching", () => {
    store.dispatch(
      new SetFeatureConfig({
        enableLocalSignUp: true,
        aiPoweredReceipts: true,
      })
    );

    expect(store.selectSnapshot(FeatureConfigState.enableLocalSignUp)).toBe(true);
    expect(store.selectSnapshot(FeatureConfigState.aiPoweredReceipts)).toBe(true);
  });
});
