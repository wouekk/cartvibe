import { Injectable, inject } from "@angular/core";
import { catchError, finalize, Observable, of, switchMap, take, tap, } from "rxjs";
import { AppData, FeatureConfigService, UserService, } from "../open-api";
import { FeatureConfigStore, AuthStore } from "../store";
import { AppDataService } from "./app-data.service";
import { TokenRefreshService } from "./token-refresh.service";

@Injectable({
  providedIn: "root",
})
export class AppInitService {
  private readonly authStore = inject(AuthStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  private readonly appData = inject(AppDataService);

  constructor(
    private tokenRefreshService: TokenRefreshService,
    private userService: UserService,
    private featureConfigService: FeatureConfigService
  ) {}

  public initAppData(): Promise<boolean> {

    return new Promise((resolve) => {
      // A session from an earlier visit: renew the token and load the account. With no connection the refresh fails
      // without ending the session (TokenRefreshService), and the app starts on what the store kept.
      if (this.authStore.isLoggedIn()) {
        this.tokenRefreshService.refreshToken().pipe(
          take(1),
          switchMap(() => this.getAppData()),
          tap(() => resolve(true)),
          catchError((err) => {
            resolve(false);
            return of(err);
          })
        ).subscribe();
        return;
      }

      this.featureConfigService.getFeatureConfig().pipe(
        take(1),
        tap((config) => this.featureConfigStore.setFeatureConfig(config)),
        finalize(() => {
          resolve(true);
        })
      ).subscribe();
    });
  }

  /** Reads the account's data again and puts it into the stores. */
  public getAppData(): Observable<AppData> {
    return this.userService.getAppData().pipe(tap((appData: AppData) => this.appData.set(appData)));
  }

}

export function initAppData(appInitService: AppInitService) {
  return async () => await appInitService.initAppData();
}
