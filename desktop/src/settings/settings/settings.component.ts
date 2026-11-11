import { Component, computed, ChangeDetectionStrategy, inject } from "@angular/core";
import { DEFAULT_HOST_CLASS } from "src/constants";
import { Permission } from "../../open-api";
import { AuthStore } from "../../store";
import { TabConfig } from "../../shared-ui/tabs/tab-config.interface";
import { marker } from "../../i18n/marker";
import { SettingsPageComponent } from "../../shared-ui/settings/settings-page.component";
import { TabsComponent } from "../../shared-ui/tabs/tabs.component";

@Component({
    selector: "app-settings",
    templateUrl: "./settings.component.html",
    host: DEFAULT_HOST_CLASS,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsPageComponent, TabsComponent]
})
export class SettingsComponent {
  private readonly authStore = inject(AuthStore);

  private readonly canReadProfile = computed(() => this.authStore.hasAppPermission(Permission.AppAccountRead));

  private readonly canReadPreferences = computed(() => this.authStore.hasAppPermission(Permission.AppUserPreferencesRead));

  public readonly tabs = computed<TabConfig[]>(() => {
    const tabs: TabConfig[] = [];

    if (this.canReadProfile()) {
      tabs.push({
        label: marker("User Profile"),
        routerLink: "user-profile/view",
        name: "user-profile",
      });
    }

    if (this.canReadPreferences()) {
      tabs.push({
        label: marker("User Preferences"),
        routerLink: "user-preferences/view",
        name: "user-preferences",
      });
    }
    // Theme and Language have their own pages under Settings in the sidebar.

    return tabs;
  });

}
