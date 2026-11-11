import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, RouterStateSnapshot } from "@angular/router";
import { FeatureConfigStore } from "../store";

@Injectable({
  providedIn: "root",
})
export class FeatureGuard {
  private readonly featureConfigStore = inject(FeatureConfigStore);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    return this.featureConfigStore.hasFeature(route.data["feature"]);
  }
}
