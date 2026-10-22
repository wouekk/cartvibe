import { Component, computed, effect, inject, linkedSignal, ViewEncapsulation } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { Data, NavigationEnd, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter, map, startWith, switchMap, take } from "rxjs";
import { SetPage } from "src/store/receipt-table.actions";
import { ShoppingListState } from "src/store/shopping-list.state";
import { AboutComponent } from "../../about/about/about.component";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AuthService, Group, GroupStatus, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { ViewportService } from "../../services/viewport.service";
import { AuthState, GroupState, Logout, SetSelectedGroupId } from "../../store";
import { hasAll } from "../../utils/permission.utils";
import { provideIcons } from "@ng-icons/core";
import {
  lucideBot,
  lucideCheck,
  lucideChartLine,
  lucideChevronDown,
  lucideChevronsUpDown,
  lucideEllipsisVertical,
  lucideInfo,
  lucideLanguages,
  lucideLayoutDashboard,
  lucideLogOut,
  lucidePalette,
  lucideReceiptText,
  lucideSettings,
  lucideShapes,
  lucideShoppingCart,
  lucideSlidersHorizontal,
  lucideTag,
  lucideTextCursorInput,
  lucideUser,
  lucideUserCog,
  lucideUsers,
} from "@ng-icons/lucide";
import { HlmSidebarService } from "@spartan-ng/helm/sidebar";
import { marker } from "../../i18n/marker";

/** The nav items name Material icons; the sidebar draws the matching Lucide ones, like spartan's own. */
const LUCIDE_ICONS: Record<string, string> = {
  space_dashboard: "lucideLayoutDashboard",
  shopping_cart: "lucideShoppingCart",
  receipt_long: "lucideReceiptText",
  insights: "lucideChartLine",
  category: "lucideShapes",
  sell: "lucideTag",
  dynamic_form: "lucideTextCursorInput",
  groups: "lucideUsers",
  person: "lucideUser",
  smart_toy: "lucideBot",
  settings: "lucideSettings",
  manage_accounts: "lucideUserCog",
  translate: "lucideLanguages",
  palette: "lucidePalette",
};

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
    standalone: false,
    providers: [
      provideIcons({
        lucideBot,
        lucideCheck,
        lucideChartLine,
        lucideChevronDown,
        lucideChevronsUpDown,
        lucideEllipsisVertical,
        lucideInfo,
        lucideLanguages,
        lucideLayoutDashboard,
        lucideLogOut,
        lucidePalette,
        lucideReceiptText,
        lucideSettings,
        lucideShapes,
        lucideShoppingCart,
        lucideSlidersHorizontal,
        lucideTag,
        lucideTextCursorInput,
        lucideUser,
        lucideUserCog,
        lucideUsers,
      }),
    ],
})
export class SidebarComponent {
  /** The Lucide icon for a nav item's Material icon name. */
  public lucide(material: string): string {
    return LUCIDE_ICONS[material] ?? "lucideSettings";
  }

  constructor(
    private authService: AuthService,
    private matDialog: AppDialog,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private viewportService: ViewportService,
  ) {
    // A phone's sidebar is a sheet over the page, so it must not stay open behind the page it opened.
    effect(() => {
      this.currentUrl();
      this.sidebar.setOpenMobile(false);
    });
  }

  private readonly sidebar = inject(HlmSidebarService);

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public readonly isHandset = this.viewportService.isHandset;

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

  /** With only one real group (the Household, Phase 3 M5) there is nothing to switch between or manage. */
  public readonly hasSeveralGroups = computed(() => this.groups().filter((g: Group) => !g.isAllGroup).length > 1);

  /** What the header names: the chosen group, or the only real one while the "All" group is chosen. */
  public readonly shownGroup = computed(() => {
    const selected = this.allGroups().find((group) => group.id === this.selectedGroupIdNumber());
    if (this.hasSeveralGroups() || (selected && !selected.isAllGroup)) {
      return selected;
    }
    return this.groups().find((g: Group) => !g.isAllGroup) ?? selected;
  });

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
      items.push({ label: "Dashboard", icon: "space_dashboard", link: [this.overviewLink()], testId: "nav-overview" });
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

    if (this.canViewReports()) {
      items.push({ label: "Reports", icon: "insights", link: ["/reports"], testId: "nav-reports" });
    }

    return items;
  });

  protected readonly isAdmin = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppUsersRead));

  // Admin only: a member who can use the AI page also holds the receipt-processing permissions, which
  // must not open System Settings.
  protected readonly canViewSystemSettings = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppSystemSettingsRead)
  );

  protected readonly canViewUserSettings = this.store.selectSignal(
    AuthState.hasAnyAppPermission([
      Permission.AppAccountRead,
      Permission.AppUserPreferencesRead,
      Permission.AppApiKeysRead,
    ])
  );

  /**
   * Everything under "Settings": the household's catalogues, the AI, the person's own settings, then the pages only an
   * admin may open. Each entry sits behind its own read permission; Language and Theme need none.
   */
  public readonly manageNavItems = computed(() => {
    const has = (permission: string) => hasAll(this.appPermissions(), permission);
    const items: { label: string; icon: string; link: string[]; testId: string }[] = [];

    if (has(Permission.AppCategoriesRead)) {
      items.push({ label: marker("Manage Categories"), icon: "category", link: ["/categories"], testId: "nav-categories" });
    }
    if (has(Permission.AppTagsRead)) {
      items.push({ label: marker("Manage Tags"), icon: "sell", link: ["/tags"], testId: "nav-tags" });
    }
    if (has(Permission.AppReceiptProcessingSettingsUpdate)) {
      items.push({ label: "AI", icon: "smart_toy", link: ["/ai"], testId: "nav-ai" });
    }
    if (this.canViewUserSettings()) {
      items.push({ label: marker("User Settings"), icon: "manage_accounts", link: ["/settings"], testId: "nav-user-settings" });
    }
    items.push({ label: marker("Language"), icon: "translate", link: ["/language"], testId: "nav-language" });
    items.push({ label: marker("Theme"), icon: "palette", link: ["/theme"], testId: "nav-theme" });

    if (has(Permission.AppGroupsRead)) {
      items.push({ label: marker("Manage Households"), icon: "groups", link: ["/groups"], testId: "nav-households" });
    }
    if (has(Permission.AppUsersRead)) {
      items.push({ label: marker("Manage Users"), icon: "person", link: ["/users"], testId: "nav-users" });
    }
    // No "Manage Roles" (Phase 3 M4): a household has Admin and User, picked on the user and member
    // forms. The roles page stays at /roles.
    if (this.canViewSystemSettings()) {
      items.push({ label: "System Settings", icon: "settings", link: ["/system-settings"], testId: "nav-system-settings" });
    }

    return items;
  });

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
    this.sidebar.setOpenMobile(false);
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

  public openAboutDialog(): void {
    this.matDialog.open(AboutComponent, DEFAULT_DIALOG_CONFIG);
  }
}
