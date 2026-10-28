import { Injectable } from "@angular/core";
import { Action, createSelector, Selector, State, StateContext, } from "@ngxs/store";
import { FeatureConfig, OidcProviderSummary } from "../open-api";
import { SetFeatureConfig } from "./feature-config.state.actions";

@State<FeatureConfig>({
  name: "featureConfig",
  defaults: {
    enableLocalSignUp: true,
    aiPoweredReceipts: false,
    oidcProviders: [],
    shopLogoKey: "",
  },
})
@Injectable()
export class FeatureConfigState {
  @Selector()
  static enableLocalSignUp(state: FeatureConfig): boolean {
    return state.enableLocalSignUp as boolean;
  }

  @Selector()
  static aiPoweredReceipts(state: FeatureConfig): boolean {
    return state.aiPoweredReceipts as boolean;
  }

  @Selector()
  static oidcProviders(state: FeatureConfig): OidcProviderSummary[] {
    return state.oidcProviders ?? [];
  }

  /** The Logo.dev publishable key shop logos load with; "" shows every shop's first letter. */
  @Selector()
  static shopLogoKey(state: FeatureConfig): string {
    // Optional chaining: the monogram reads this in every list, also in specs that never register the state.
    return state?.shopLogoKey ?? "";
  }

  @Selector()
  static featureConfig(state: FeatureConfig): FeatureConfig {
    return state;
  }

  static hasFeature(feature: string) {
    return createSelector([FeatureConfigState], (state: FeatureConfig) => {
      return !!(state as any)[feature];
    });
  }

  @Action(SetFeatureConfig)
  setFeatureConfig(
    { patchState }: StateContext<FeatureConfig>,
    payload: SetFeatureConfig
  ) {
    patchState({
      aiPoweredReceipts: payload.config?.aiPoweredReceipts,
      enableLocalSignUp: payload.config?.enableLocalSignUp,
      // Coalesced rather than assigned straight through: the field is optional on
      // the contract, so a server that predates it sends nothing, and consumers
      // should still get an array to iterate.
      oidcProviders: payload.config?.oidcProviders ?? [],
      shopLogoKey: payload.config?.shopLogoKey ?? "",
    });
  }
}
