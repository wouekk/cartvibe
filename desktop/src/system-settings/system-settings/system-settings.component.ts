import { Component, OnInit } from "@angular/core";
import { Store } from "@ngxs/store";
import { Permission } from "../../open-api";
import { TabConfig } from "../../shared-ui/tabs/tab-config.interface";
import { AuthState } from "../../store";

interface SystemSettingsTab extends TabConfig {
  readPermission: Permission;
}

@Component({
    selector: "app-system-settings",
    templateUrl: "./system-settings.component.html",
    styleUrl: "./system-settings.component.scss",
    standalone: false
})
export class SystemSettingsComponent implements OnInit {
  public tabs: TabConfig[] = [];

  constructor(private store: Store) {
  }

  public ngOnInit(): void {
    this.initTabs();
  }

  private initTabs(): void {
    const allTabs: SystemSettingsTab[] = [
      {
        label: "System Settings",
        routerLink: "settings/view",
        name: "settings",
        readPermission: Permission.AppSystemSettingsRead,
      },
      // No "Receipt Processing Settings" or "Prompts" tab (Phase 3 M1, A3): the AI page under Manage
      // replaces them and the prompt is built in. Their routes stay, reachable by URL.
      {
        label: "System Emails",
        routerLink: "system-emails",
        name: "system-emails",
        readPermission: Permission.AppSystemEmailsRead,
      },
      {
        label: "OIDC Providers",
        routerLink: "oidc-providers",
        name: "oidc-providers",
        readPermission: Permission.AppOidcProvidersRead,
      },
      {
        label: "System Tasks",
        routerLink: "system-tasks",
        name: "system-tasks",
        readPermission: Permission.AppSystemTasksRead,
      },
      {
        label: "Logs",
        routerLink: "logs",
        name: "logs",
        readPermission: Permission.AppSystemSettingsRead,
      },
    ];

    this.tabs = allTabs
      .filter((tab) =>
        this.store.selectSnapshot(AuthState.hasAppPermission(tab.readPermission))
      )
      .map(({ readPermission, ...tab }) => tab);
  }
}
