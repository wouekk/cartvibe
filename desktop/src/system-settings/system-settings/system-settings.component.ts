import { Component, DestroyRef, inject, OnInit, signal, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter } from "rxjs";
import { Permission } from "../../open-api";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { TabConfig } from "../../shared-ui/tabs/tab-config.interface";
import { AuthState } from "../../store";
import { marker } from "../../i18n/marker";

interface SystemSettingsTab extends TabConfig {
  readPermission: Permission;
}

/**
 * The System Settings shell: five pill tabs (the Dashboard's period picker look) over cards. Each tab is a
 * route; General, Auth and Tasks are the one settings form showing its own cards (plus the
 * tables that belong with them), Logs is the log viewer.
 */
@Component({
    selector: "app-system-settings",
    templateUrl: "./system-settings.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
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
    // The four settings tabs are one form each, so they share the settings permission; the tables inside
    // them (system emails, OIDC providers, tasks) are shown only to who may read them.
    const allTabs: SystemSettingsTab[] = [
      {
        label: marker("General & Currency"),
        routerLink: "general",
        name: "general",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Auth & Security"),
        routerLink: "security",
        name: "security",
        readPermission: Permission.AppSystemSettingsRead,
      },
      {
        label: marker("Tasks & Storage"),
        routerLink: "tasks",
        name: "tasks",
        readPermission: Permission.AppSystemSettingsRead,
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
