import { inject, Injectable } from "@angular/core";
import { AppData, CurrencySeparator, CurrencySymbolPosition } from "../open-api";
import {
  FeatureConfigStore,
  UserStore,
  GroupStore,
  AuthStore,
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
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  private readonly aboutStore = inject(AboutStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly userStore = inject(UserStore);

  public set(appData: AppData): void {
    if (!this.groupStore.selectedGroupId()) {
      this.groupStore.setSelectedGroupId(appData.groups[0].id.toString());
    }

    this.authStore.setAuthState(appData.claims);
    this.authStore.setPermissions(appData.appPermissions ?? [], appData.groupPermissions ?? {});
    this.authStore.setGroupCatalog(appData.groupCategories ?? {}, appData.groupTags ?? {});
    this.featureConfigStore.setFeatureConfig(appData.featureConfig);
    this.groupStore.setGroups(appData.groups);
    this.authStore.setUserPreferences(appData.userPreferences);
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
    this.authStore.setIcons(appData.icons);
    this.aboutStore.setAbout(appData.about);
  }
}
