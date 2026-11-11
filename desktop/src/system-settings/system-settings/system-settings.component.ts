import { Component, DestroyRef, inject, OnInit, signal, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter } from "rxjs";
import { Permission } from "../../open-api";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { TabConfig } from "../../shared-ui/tabs/tab-config.interface";
import { AuthState } from "../../store";
import { marker } from "../../i18n/marker";
import { SettingsPageComponent } from "../../shared-ui/settings/settings-page.component";
import { FilterBarComponent } from "../../shared-ui/filter-bar/filter-bar.component";

interface SystemSettingsTab extends TabConfig {
  readPermission: Permission;
}

/**
 * The System Settings shell: pill tabs (the Dashboard's period picker look) over cards. Each tab is a
 * route; Currency & Time Zone, Shop Logos, Auth and Tasks are the one settings form showing its own cards
 * (plus the tables that belong with them), Sign-in providers lists the identity providers, Logs is the log viewer.
 */
@Component({
    selector: "app-system-settings",
    templateUrl: "./system-settings.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsPageComponent, FilterBarComponent, RouterOutlet]
})
export class SystemSettingsComponent implements OnInit {
  public tabs: TabConfig[] = [];

  public filterTabs: FilterTab[] = [];

  public readonly activeTab = signal("");

  private readonly router = inject(Router);

  constructor(private store: Store) {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef))
      )
      .subscribe(() => this.syncActiveTab());
  }

  public ngOnInit(): void {
    this.initTabs();
    this.syncActiveTab();
  }

  public select(name: string): void {
    const tab = this.tabs.find((candidate) => candidate.name === name);
    if (tab) {
      this.router.navigate(["/system-settings", tab.routerLink]);
    }
  }

  private syncActiveTab(): void {
    const url = this.router.url.split("?")[0];
    const active = this.tabs.find((tab) => url.startsWith(`/system-settings/${tab.routerLink}`));
    this.activeTab.set(active?.name ?? "");
  }

  private initTabs(): void {
    // The four settings tabs are one form each, so they share the settings permission; the task table inside
    // one is shown only to who may read it. Sign-in providers and Export & import (a whole-household dump)
    // have their own permission.
    const allTabs: SystemSettingsTab[] = [
      {
        label: marker("Currency & Time Zone"),
        routerLink: "general",
        name: "general",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Shop Logos"),
        routerLink: "logos",
        name: "logos",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Auth & Security"),
        routerLink: "security",
        name: "security",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Sign-in providers"),
        routerLink: "providers",
        name: "providers",
        readPermission: Permission.AppOidcProvidersRead,
      },
      {
        label: marker("Tasks & Storage"),
        routerLink: "tasks",
        name: "tasks",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Export & import"),
        routerLink: "export-import",
        name: "export-import",
        readPermission: Permission.AppBackupExport,
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
    this.filterTabs = this.tabs.map((tab) => ({ value: tab.name, label: tab.label }));
  }
}
