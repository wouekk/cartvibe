import { TestBed } from "@angular/core/testing";
import { FeatureConfigStore } from "./feature-config.store";

describe("FeatureConfigStore", () => {
  let features: FeatureConfigStore;

  beforeEach(() => {
    features = TestBed.inject(FeatureConfigStore);
  });

  it("defaults oidcProviders to an empty array", () => {
    expect(features.oidcProviders()).toEqual([]);
  });

  it("takes oidcProviders from the server's config", () => {
    features.setFeatureConfig({
      enableLocalSignUp: false,
      aiPoweredReceipts: false,
      oidcProviders: [{ name: "google", displayName: "Google" }],
    });

    expect(features.oidcProviders()).toEqual([{ name: "google", displayName: "Google" }]);
  });

  // The field is optional on the contract, so a server that predates it sends
  // nothing. Consumers still iterate the result, so it must never be undefined.
  it("falls back to an empty array when the config omits oidcProviders", () => {
    features.setFeatureConfig({ enableLocalSignUp: false, aiPoweredReceipts: false });

    expect(features.oidcProviders()).toEqual([]);
  });

  it("keeps the other feature flags", () => {
    features.setFeatureConfig({ enableLocalSignUp: true, aiPoweredReceipts: true });

    expect(features.enableLocalSignUp()).toBe(true);
    expect(features.aiPoweredReceipts()).toBe(true);
    expect(features.hasFeature("aiPoweredReceipts")).toBe(true);
    expect(features.hasFeature("somethingElse")).toBe(false);
  });

  // The key was dropped on its way into the store once, and then nothing ever offered push.
  it("keeps the server's Web Push key, and reads a missing one as none", () => {
    expect(features.webPushPublicKey()).toBe("");

    features.setFeatureConfig({ enableLocalSignUp: true, aiPoweredReceipts: false, webPushPublicKey: "BPublicKey" });
    expect(features.webPushPublicKey()).toBe("BPublicKey");

    features.setFeatureConfig({ enableLocalSignUp: true, aiPoweredReceipts: false });
    expect(features.webPushPublicKey()).toBe("");
  });

  it("says whether shop logos are on", () => {
    expect(features.shopLogosEnabled()).toBe(false);

    features.setFeatureConfig({ enableLocalSignUp: true, aiPoweredReceipts: false, shopLogosEnabled: true });

    expect(features.shopLogosEnabled()).toBe(true);
  });
});
