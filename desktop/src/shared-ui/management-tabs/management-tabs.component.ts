import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter, map } from "rxjs";
import { marker } from "../../i18n/marker";
import { Permission } from "../../open-api";
import { AuthState } from "../../store";
import { hasAll } from "../../utils/permission.utils";
import { FilterTab } from "../filter-bar/filter-tab.interface";

/** One tab of Settings → Management: a page of its own, shown to who may read it. */
export interface ManagementTab {
  name: string;
  label: string;
  /** The page's own address; every path under it belongs to the tab (a household's members, a user's form). */
  link: string;
  readPermission: string;
}

/** Categories, Tags, Users and Households, in the order the tab strip shows them. */
export const MANAGEMENT_TABS: ManagementTab[] = [
  { name: "categories", label: marker("Categories"), link: "/categories", readPermission: Permission.AppCategoriesRead },
  { name: "tags", label: marker("Tags"), link: "/tags", readPermission: Permission.AppTagsRead },
  { name: "users", label: marker("Users"), link: "/users", readPermission: Permission.AppUsersRead },
  { name: "households", label: marker("Households"), link: "/groups", readPermission: Permission.AppGroupsRead },
];

/** The Management tabs the given app permissions may open. */
export function allowedManagementTabs(appPermissions: string[]): ManagementTab[] {
  return MANAGEMENT_TABS.filter((tab) => hasAll(appPermissions, tab.readPermission));
}

/** The tab a URL belongs to, or undefined outside Management. */
export function managementTabForUrl(url: string): ManagementTab | undefined {
  const path = url.split(/[?#]/)[0];
  return MANAGEMENT_TABS.find((tab) => path === tab.link || path.startsWith(`${tab.link}/`));
}

/**
 * The tab strip of Settings → Management, placed in the `settingsTabs` slot of each of its four pages (they keep their
 * own addresses, so links into a household or a user still work). Switching a tab opens that page.
 */
@Component({
  selector: "app-management-tabs",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-settings-tabs
      data-testid="management-tabs"
      [tabs]="tabs()"
      [value]="active()"
      (valueChange)="select($event)"
    ></app-settings-tabs>
  `,
})
export class ManagementTabsComponent {
  private readonly router = inject(Router);

  private readonly appPermissions = inject(Store).selectSignal(AuthState.appPermissions);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  private readonly allowed = computed(() => allowedManagementTabs(this.appPermissions() ?? []));

  public readonly tabs = computed<FilterTab[]>(() =>
    this.allowed().map((tab) => ({ value: tab.name, label: tab.label, testId: `management-tab-${tab.name}` }))
  );

  public readonly active = computed(() => managementTabForUrl(this.url())?.name ?? "");

  public select(name: string): void {
    const tab = this.allowed().find((candidate) => candidate.name === name);
    if (tab && tab.name !== this.active()) {
      this.router.navigateByUrl(tab.link);
    }
  }
}
