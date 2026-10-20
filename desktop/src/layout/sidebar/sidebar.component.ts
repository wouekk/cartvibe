import { Component, computed, effect, linkedSignal, ViewEncapsulation } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { Data, NavigationEnd, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter, map, startWith, switchMap, take } from "rxjs";
import { LayoutState } from "src/store/layout.state";
import { CloseSidebar } from "src/store/layout.state.actions";
import { SetPage } from "src/store/receipt-table.actions";
import { ShoppingListState } from "src/store/shopping-list.state";
import { AboutComponent } from "../../about/about/about.component";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { ImportFormComponent } from "../../import/import-form/import-form.component";
import { AuthService, Group, GroupStatus, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { ViewportService } from "../../services/viewport.service";
import { AuthState, GroupState, Logout, SetSelectedGroupId } from "../../store";
import { hasAll } from "../../utils/permission.utils";

/**
 * The app's navigation: everyday pages (shopping lists, receipts, dashboard, reports) up top, the
 * administration pages folded into "Manage" at the bottom, and the account menu last. On a desktop
 * it is always shown — labeled, or collapsed to an icon rail — and on a phone it slides in over the
 * page and closes itself after navigating.
 */
@Component({
    selector: "app-sidebar",
    templateUrl: "./sidebar.component.html",
    styleUrls: ["./sidebar.component.scss"],
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class SidebarComponent {
  constructor(
    private authService: AuthService,
    private matDialog: MatDialog,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private viewportService: ViewportService,
  ) {
    // A phone's sidebar covers the page, so it must not stay open behind the page it opened, nor
    // come back open from a persisted session.
    effect(() => {
      this.currentUrl();
      if (this.isHandset()) {
        this.store.dispatch(new CloseSidebar());
      }
    });
  }

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public readonly isHandset = this.viewportService.isHandset;

  private readonly isMobileSidebarOpen = this.store.selectSignal(LayoutState.isSidebarOpen);

  private readonly isSidebarCollapsedSetting = this.store.selectSignal(LayoutState.isSidebarCollapsed);

  /** A phone always shows the full, labeled sidebar when it is open. */
  public readonly isCollapsed = computed(() => !this.isHandset() && this.isSidebarCollapsedSetting());

  public readonly drawerMode = computed(() => (this.isHandset() ? "over" : "side"));

  public readonly isDrawerOpen = computed(() => !this.isHandset() || this.isMobileSidebarOpen());

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => (event as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  // True when the active route opts into a full-height, no-padding content frame
  // (route data `fullHeight`), so the routed page owns its own internal scrolling
  // instead of the shell's block-flow + p-4 padding. Used by the Report Builder.
  public readonly isContentFullHeight = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.deepestRouteData()["fullHeight"] === true),
    ),
    { initialValue: false },
  );

  public selectedGroupId = this.store.selectSignal(GroupState.selectedGroupId);

  protected readonly selectedGroupIdNumber = computed(() => {
    const id = Number.parseInt(this.selectedGroupId() ?? "");
    return Number.isNaN(id) ? 0 : id;
  });

  private allGroups = this.store.selectSignal(GroupState.groups);

  public groups = computed(() =>
    this.allGroups().filter((g: Group) => g.status !== GroupStatus.Archived)
  );

  public readonly selectedGroup = computed(() =>
    this.allGroups().find((group) => group.id === this.selectedGroupIdNumber())
  );

  protected readonly Permission = Permission;

  private readonly appPermissions = this.store.selectSignal(
    AuthState.appPermissions
  );

  private readonly groupPermissions = this.store.selectSignal(
    AuthState.groupPermissions
  );

  private readonly selectedGroupPermissions = computed(
    () => this.groupPermissions()?.[this.selectedGroupIdNumber()] ?? []
  );

  private readonly receiptListLink = this.store.selectSignal(GroupState.receiptListLink);

  private readonly dashboardLink = this.store.selectSignal(GroupState.dashboardLink);

  private readonly overviewLink = this.store.selectSignal(GroupState.overviewLink);

  private readonly shoppingListGroupId = this.store.selectSignal(ShoppingListState.targetGroupId);

  // Reports are reachable with read OR the readAll bypass (the *hasAppPermission
  // directive is single-key AND-only, so the OR is resolved through the selector).
  protected readonly canViewReports = this.store.selectSignal(
    AuthState.hasAnyAppPermission([
      Permission.AppReportsRead,
      Permission.AppReportsReadAll,
    ])
  );

  /** The everyday pages, in the order they are used. */
  public readonly mainNavItems = computed(() => {
    const items: { label: string; icon: string; link: (string | number)[]; testId: string }[] = [];

    if (hasAll(this.selectedGroupPermissions(), Permission.GroupReceiptsRead)) {
      items.push({ label: "Overview", icon: "space_dashboard", link: [this.overviewLink()], testId: "nav-overview" });
    }

    const shoppingListGroupId = this.shoppingListGroupId();
    if (shoppingListGroupId !== undefined) {
      items.push({
        label: "Shopping Lists",
        icon: "shopping_cart",
        link: ["/shopping-lists/group", shoppingListGroupId],
        testId: "nav-shopping-lists",
      });
    }

    items.push({ label: "Receipts", icon: "receipt_long", link: [this.receiptListLink()], testId: "nav-receipts" });

    if (hasAll(this.selectedGroupPermissions(), Permission.GroupDashboardsRead)) {
      // The customizable widget dashboards; the Overview above is the fixed landing page.
      items.push({ label: "Dashboards", icon: "dashboard_customize", link: [this.dashboardLink()], testId: "nav-dashboard" });
    }

    if (this.canViewReports()) {
      items.push({ label: "Reports", icon: "insights", link: ["/reports"], testId: "nav-reports" });
    }

    return items;
  });

  protected readonly canViewSystemSettings = this.store.selectSignal(
    AuthState.hasAnyAppPermission([
      Permission.AppSystemSettingsRead,
      Permission.AppPromptsRead,
      Permission.AppReceiptProcessingSettingsRead,
      Permission.AppSystemEmailsRead,
      Permission.AppSystemTasksRead,
    ])
  );

  protected readonly canViewUserSettings = this.store.selectSignal(
    AuthState.hasAnyAppPermission([
      Permission.AppAccountRead,
      Permission.AppUserPreferencesRead,
      Permission.AppApiKeysRead,
    ])
  );

  /** The administration pages, each behind its own read permission. */
  public readonly manageNavItems = computed(() => {
    const has = (permission: string) => hasAll(this.appPermissions(), permission);
    const items: { label: string; icon: string; link: string[] }[] = [];

    if (has(Permission.AppCategoriesRead)) {
      items.push({ label: "Manage Categories", icon: "category", link: ["/categories"] });
    }
    if (has(Permission.AppTagsRead)) {
      items.push({ label: "Manage Tags", icon: "sell", link: ["/tags"] });
    }
    if (has(Permission.AppCustomFieldsRead)) {
      items.push({ label: "Manage Custom Fields", icon: "dynamic_form", link: ["/custom-fields"] });
    }
    if (has(Permission.AppGroupsRead)) {
      items.push({ label: "Manage Groups", icon: "groups", link: ["/groups"] });
    }
    if (has(Permission.AppUsersRead)) {
      items.push({ label: "Manage Users", icon: "person", link: ["/users"] });
    }
    // No "Manage Roles" (Phase 3 M4): a household has Admin and User, picked on the user and member
    // forms. The roles page stays at /roles.
    if (has(Permission.AppReceiptProcessingSettingsUpdate)) {
      items.push({ label: "AI", icon: "smart_toy", link: ["/ai"] });
    }
    if (this.canViewSystemSettings()) {
      items.push({ label: "System Settings", icon: "settings", link: ["/system-settings"] });
    }

    return items;
  });

  protected readonly canRunImports = computed(() => hasAll(this.appPermissions(), Permission.AppImportsRun));

  /**
   * Whether "Manage" is expanded: open while the user is on one of its pages, so the active one is
   * visible, and otherwise whatever they toggled it to until the next navigation.
   */
  public readonly isManageOpen = linkedSignal(() => {
    const url = this.currentUrl();
    return this.manageNavItems().some((item) => url.startsWith(item.link[0]));
  });

  // Walks from the router state root to the deepest activated child so the
  // fullHeight flag is picked up wherever it is declared in the route tree.
  private deepestRouteData(): Data {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data;
  }

  public groupClicked(groupId: number): void {
    this.store.dispatch(new SetSelectedGroupId(groupId.toString()));
    this.store.dispatch(new SetPage(1));
    this.router.navigate([this.store.selectSnapshot(GroupState.overviewLink)]);
  }

  public closeMobileSidebar(): void {
    if (this.isHandset()) {
      this.store.dispatch(new CloseSidebar());
    }
  }

  public logout(): void {
    this.authService
      .logout()
      .pipe(
        take(1),
        switchMap(() => this.store.dispatch(new Logout())),
        switchMap(() => this.router.navigate(["/"])),
      )
      .subscribe();
  }

  public openImportDialog(): void {
    this.matDialog.open(ImportFormComponent, DEFAULT_DIALOG_CONFIG);
  }

  public openAboutDialog(): void {
    this.matDialog.open(AboutComponent, DEFAULT_DIALOG_CONFIG);
  }
}
