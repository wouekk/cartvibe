import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TabConfig } from "src/shared-ui/tabs/tab-config.interface";
import { marker } from "../../i18n/marker";
import { SettingsPageComponent } from "../../shared-ui/settings/settings-page.component";
import { TabsComponent } from "../../shared-ui/tabs/tabs.component";

@Component({
    selector: "app-group-tabs",
    templateUrl: "./group-tabs.component.html",
    styleUrls: ["./group-tabs.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsPageComponent, TabsComponent]
})
export class GroupTabsComponent {
  public tabs: TabConfig[] = [];

  public ngOnInit(): void {
    this.initTabs();
  }

  private initTabs(): void {
    this.tabs = [
      {
        label: "Group Details",
        routerLink: "details/view",
        name: "details",
      },
      {
        label: marker("Group Receipt Settings"),
        routerLink: "receipt-settings/view",
        name: "receipt-settings",
      },
    ];

  }
}
