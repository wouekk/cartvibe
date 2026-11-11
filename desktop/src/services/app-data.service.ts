import { inject, Injectable } from "@angular/core";
import { Store } from "@ngxs/store";
import { AppData, CurrencySeparator, CurrencySymbolPosition } from "../open-api";
import {
  FeatureConfigStore,
  GroupState,
  SetAuthState,
  SetGroupCatalog,
  SetGroups,
  SetIcons,
  SetPermissions,
  SetSelectedGroupId,
  SetUserPreferences,
  UserStore,
} from "../store";
import { AboutStore } from "../store/about.store";
import { SystemSettingsStore } from "../store/system-settings.store";
import { DEFAULT_APP_TIME_ZONE } from "../utils/app-time-zone";

/**
 * Puts what the server sends at sign-in and at every start (`AppData`) into the stores. It is the one place the
 * permissions are set, so a token refresh can never narrow or widen them.
 */
@Injectable({ providedIn: "root" })
export class AppDataService {
  private readonly store = inject(Store);

  private readonly aboutStore = inject(AboutStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly userStore = inject(UserStore);

  public set(appData: AppData): void {
    if (!this.store.selectSnapshot(GroupState.selectedGroupId)) {
      this.store.dispatch(new SetSelectedGroupId(appData.groups[0].id.toString()));
    }

    this.store.dispatch(new SetAuthState(appData.claims));
    this.store.dispatch(new SetPermissions(appData.appPermissions ?? [], appData.groupPermissions ?? {}));
    this.store.dispatch(new SetGroupCatalog(appData.groupCategories ?? {}, appData.groupTags ?? {}));
    this.featureConfigStore.setFeatureConfig(appData.featureConfig);
    this.store.dispatch(new SetGroups(appData.groups));
    this.store.dispatch(new SetUserPreferences(appData.userPreferences));
    this.userStore.setUsers(appData.users);
    this.systemSettingsStore.setCurrencyDisplay(appData.currencyDisplay);
    this.systemSettingsStore.setCurrencyData(
      appData.currencySymbolPosition ?? CurrencySymbolPosition.Start,
      appData.currencyDecimalSeparator ?? CurrencySeparator.Period,
      appData.currencyThousandthsSeparator ?? CurrencySeparator.Comma,
      appData.currencyHideDecimalPlaces ?? false
    );
    this.systemSettingsStore.setTimeZone(appData.timeZone || DEFAULT_APP_TIME_ZONE);
    this.systemSettingsStore.setDateFormat(appData.dateFormat ?? "");
    this.store.dispatch(new SetIcons(appData.icons));
    this.aboutStore.setAbout(appData.about);
  }
}
