import { computed, Injectable } from "@angular/core";
import { FeatureConfig, OidcProviderSummary } from "../open-api";
import { StateStore } from "./state-store";

/** What the server has switched on, read at every start (`AppDataService`) and not kept between visits. */
@Injectable({ providedIn: "root" })
export class FeatureConfigStore extends StateStore<FeatureConfig> {
  public readonly enableLocalSignUp = computed(() => this.state().enableLocalSignUp as boolean);

  public readonly aiPoweredReceipts = computed(() => this.state().aiPoweredReceipts as boolean);

  public readonly oidcProviders = computed((): OidcProviderSummary[] => this.state().oidcProviders ?? []);

  /** Whether the server has a Logo.dev key, and so logos to show; without one every shop shows its first letter. */
  public readonly shopLogosEnabled = computed(() => !!this.state().shopLogosEnabled);

  /** The server's VAPID public key, "" when it has none (and then nothing asks for push). */
  public readonly webPushPublicKey = computed(() => this.state().webPushPublicKey ?? "");

  constructor() {
    super(() => ({
      enableLocalSignUp: true,
      aiPoweredReceipts: false,
      oidcProviders: [],
      shopLogosEnabled: false,
      webPushPublicKey: "",
    }));
  }

  /** Whether the named feature is on. Reads the signal, so it follows the config inside a `computed`. */
  public hasFeature(feature: string): boolean {
    return !!(this.state() as any)[feature];
  }

  public setFeatureConfig(config: FeatureConfig): void {
    this.patch({
      aiPoweredReceipts: config?.aiPoweredReceipts,
      enableLocalSignUp: config?.enableLocalSignUp,
      // Coalesced rather than assigned straight through: the field is optional on
      // the contract, so a server that predates it sends nothing, and consumers
      // should still get an array to iterate.
      oidcProviders: config?.oidcProviders ?? [],
      shopLogosEnabled: !!config?.shopLogosEnabled,
      webPushPublicKey: config?.webPushPublicKey ?? "",
    });
  }
}
