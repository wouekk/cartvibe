import { Component, computed, effect, ElementRef, inject, Injector, linkedSignal, ViewEncapsulation, ChangeDetectionStrategy, afterNextRender, viewChild, DestroyRef } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { Data, NavigationEnd, Router, RouterLinkActive, RouterLink, RouterOutlet } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, filter, map, of, startWith, switchMap, take } from "rxjs";
import { ReceiptTableStore } from "src/store/receipt-table.store";
import { ShoppingListStore } from "src/store/shopping-list.store";
import { AboutComponent } from "../../about/about/about.component";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AuthService, Group, GroupStatus, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { ViewportService } from "../../services/viewport.service";
import { AuthState, Logout, GroupStore } from "../../store";
import { hasAll } from "../../utils/permission.utils";
import { shownHousehold } from "../../utils/shown-household";
import { TabBarItem, TabBarComponent } from "../tab-bar/tab-bar.component";
import { allowedManagementTabs } from "../../shared-ui/management-tabs/management-tabs.component";
import { provideIcons, NgIcon } from "@ng-icons/core";
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
  lucideShieldCheck,
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
import { HlmSidebarWrapper } from "../../ui/sidebar/lib/hlm-sidebar-wrapper";
import { HlmSidebar } from "../../ui/sidebar/lib/hlm-sidebar";
import { HlmSidebarHeader } from "../../ui/sidebar/lib/hlm-sidebar-header";
import { HlmSidebarMenu } from "../../ui/sidebar/lib/hlm-sidebar-menu";
import { HlmSidebarMenuItem } from "../../ui/sidebar/lib/hlm-sidebar-menu-item";
import { AvatarComponent } from "../../avatar/avatar/avatar.component";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmSidebarMenuButton } from "../../ui/sidebar/lib/hlm-sidebar-menu-button";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuLabel } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-label";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { HlmSidebarContent } from "../../ui/sidebar/lib/hlm-sidebar-content";
import { HlmSidebarGroup } from "../../ui/sidebar/lib/hlm-sidebar-group";
import { NgTemplateOutlet } from "@angular/common";
import { BrnCollapsible, BrnCollapsibleTrigger, BrnCollapsibleContent } from "@spartan-ng/brain/collapsible";
import { HlmCollapsible } from "../../ui/collapsible/lib/hlm-collapsible";
import { HlmCollapsibleTrigger } from "../../ui/collapsible/lib/hlm-collapsible-trigger";
import { HlmCollapsibleContent } from "../../ui/collapsible/lib/hlm-collapsible-content";
import { HlmSidebarMenuSub } from "../../ui/sidebar/lib/hlm-sidebar-menu-sub";
import { HlmSidebarMenuSubItem } from "../../ui/sidebar/lib/hlm-sidebar-menu-sub-item";
import { HlmSidebarMenuSubButton } from "../../ui/sidebar/lib/hlm-sidebar-menu-sub-button";
import { HlmSidebarFooter } from "../../ui/sidebar/lib/hlm-sidebar-footer";
import { HlmDropdownMenuSeparator } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-separator";
import { HlmSidebarRail } from "../../ui/sidebar/lib/hlm-sidebar-rail";
import { HlmSidebarInset } from "../../ui/sidebar/lib/hlm-sidebar-inset";
import { DemoBannerComponent, DemoFooterComponent } from "../../demo/demo-runtime";
import { HeaderComponent } from "../header/header.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

/** The nav items name Material icons; the sidebar draws the matching Lucide ones, like spartan's own. */
const LUCIDE_ICONS: Record<string, string> = {
  space_dashboard: "lucideLayoutDashboard",
  shopping_cart: "lucideShoppingCart",
  receipt_long: "lucideReceiptText",
  verified_user: "lucideShieldCheck",
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

/** The everyday pages the phone's tab bar offers, in its order; the rest stay in the sheet behind More. */
const TAB_BAR_PAGES = ["nav-overview", "nav-shopping-lists", "nav-receipts"];

/** An entry under Settings. `activeUnder` lists every page address the entry stands for (Management's four tabs). */
interface ManageNavItem {
  label: string;
  icon: string;
  link: string[];
  testId: string;
  activeUnder?: string[];
}

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
    changeDetection: ChangeDetectionStrategy.Eager,
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
            lucideShieldCheck,
            lucideShoppingCart,
            lucideSlidersHorizontal,
            lucideTag,
            lucideTextCursorInput,
            lucideUser,
            lucideUserCog,
            lucideUsers,
        }),
    ],
    imports: [
        HlmSidebarWrapper,
        HlmSidebar,
        HlmSidebarHeader,
        HlmSidebarMenu,
        HlmSidebarMenuItem,
        AvatarComponent,
        BrnTooltip,
        HlmSidebarMenuButton,
        CdkMenuTrigger,
        HlmDropdownMenuTrigger,
        NgIcon,
        CdkMenu,
        HlmDropdownMenu,
        HlmDropdownMenuLabel,
        CdkMenuItem,
        HlmDropdownMenuFocusOnHover,
        HlmDropdownMenuItem,
        HlmSidebarContent,
        HlmSidebarGroup,
        NgTemplateOutlet,
        BrnCollapsible,
        HlmCollapsible,
        BrnCollapsibleTrigger,
        HlmCollapsibleTrigger,
        BrnCollapsibleContent,
        HlmCollapsibleContent,
        HlmSidebarMenuSub,
        HlmSidebarMenuSubItem,
        HlmSidebarMenuSubButton,
        RouterLinkActive,
        RouterLink,
        HlmSidebarFooter,
        HlmDropdownMenuSeparator,
        HlmSidebarRail,
        HlmSidebarInset,
        DemoBannerComponent,
        HeaderComponent,
        RouterOutlet,
        DemoFooterComponent,
        TabBarComponent,
        TranslatePipe,
    ],
})
export class SidebarComponent {
  private readonly groupStore = inject(GroupStore);

  private readonly shoppingListStore = inject(ShoppingListStore);

  private readonly receiptTableStore = inject(ReceiptTableStore);

  /** The Lucide icon for a nav item's Material icon name. */
  public lucide(material: string): string {
    return LUCIDE_ICONS[material] ?? "lucideSettings";
  }

  constructor(
    private authService: AuthService,
    private dialog: AppDialog,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private viewportService: ViewportService,
  ) {
    afterNextRender(() => this.publishTopBarHeight());
    // A phone's sidebar is a sheet over the page, so it must not stay open behind the page it opened.
    effect(() => {
      this.currentUrl();
      this.sidebar.setOpenMobile(false);
    });
  }

  private readonly sidebar = inject(HlmSidebarService);

  private readonly injector = inject(Injector);

  private readonly topBar = viewChild<ElementRef<HTMLElement>>("topBar");

  private readonly destroyRef = inject(DestroyRef);

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public readonly isHandset = this.viewportService.isHandset;

  /**
   * Publishes the height of the sticky top bar (demo banner + header) as `--app-top-bar` on the page, so a sticky row
   * inside a page (the shopping list's "Add an item") pins just below it instead of under or over it.
   */
  private publishTopBarHeight(): void {
    const bar = this.topBar()?.nativeElement;
    if (!bar || typeof ResizeObserver === "undefined") {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--app-top-bar", `${bar.offsetHeight}px`));
    observer.observe(bar);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      root.style.removeProperty("--app-top-bar");
    });
  }

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

  public selectedGroupId = this.groupStore.selectedGroupId;

  protected readonly selectedGroupIdNumber = computed(() => {
    const id = Number.parseInt(this.selectedGroupId() ?? "");
    return Number.isNaN(id) ? 0 : id;
  });

  private allGroups = this.groupStore.groups;

  public groups = computed(() =>
    this.allGroups().filter((g: Group) => g.status !== GroupStatus.Archived)
  );

  /** With only one real group (the Household, Phase 3 M5) there is nothing to switch between or manage. */
  public readonly hasSeveralGroups = computed(() => this.groups().filter((g: Group) => !g.isAllGroup).length > 1);

  /** What the header names: the chosen group, or the only real one while the "All" group is chosen. */
  public readonly shownGroup = computed(() => shownHousehold(this.allGroups(), this.selectedGroupIdNumber()));

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

  private readonly receiptListLink = this.groupStore.receiptListLink;

  private readonly warrantiesLink = this.groupStore.warrantiesLink;

  private readonly overviewLink = this.groupStore.overviewLink;

  private readonly shoppingListGroupId = this.shoppingListStore.targetGroupId;

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

    // Its own entry, not under Receipts: the running warranties of the group being browsed.
    if (hasAll(this.selectedGroupPermissions(), Permission.GroupReceiptsRead)) {
      items.push({ label: "Warranties", icon: "verified_user", link: [this.warrantiesLink()], testId: "nav-warranties" });
    }

    if (this.canViewReports()) {
      items.push({ label: "Reports", icon: "insights", link: ["/reports"], testId: "nav-reports" });
    }

    return items;
  });

  /** The phone's tab bar: Dashboard, Lists and Receipts, each only when the sidebar offers it too. */
  public readonly tabItems = computed<TabBarItem[]>(() =>
    TAB_BAR_PAGES.flatMap((testId) => {
      const item = this.mainNavItems().find((candidate) => candidate.testId === testId);
      if (!item) {
        return [];
      }
      // "Shopping Lists" is too long for a fifth of a phone's width.
      const label = testId === "nav-shopping-lists" ? marker("Lists") : item.label;
      return [{ label, icon: this.lucide(item.icon), link: item.link, testId }];
    })
  );

  private readonly addTargetGroupId = this.groupStore.addTargetGroupId;

  /** Scan goes to the household being browsed (the only one while "All" is chosen), so it follows that one's permission. */
  public readonly canQuickScan = computed(() => {
    const groupId = this.addTargetGroupId();
    return groupId !== undefined && hasAll(this.groupPermissions()?.[groupId] ?? [], Permission.GroupReceiptsQuickScan);
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
    ])
  );

  /**
   * Everything under "Settings": System Settings, Management, User Settings, AI, Theme, then Language last. Each entry
   * sits behind its own read permission; Language and Theme need none.
   */
  public readonly manageNavItems = computed(() => {
    const has = (permission: string) => hasAll(this.appPermissions(), permission);
    const items: ManageNavItem[] = [];

    // Order: System Settings, Management, User Settings, AI, Theme, Language.
    // No "Manage Roles" (Phase 3 M4): a household has Admin and User, picked on the user and member
    // forms. The roles page stays at /roles.
    if (this.canViewSystemSettings()) {
      items.push({ label: "System Settings", icon: "settings", link: ["/system-settings"], testId: "nav-system-settings" });
    }

    // Categories, Tags, Users and Households are one page with tabs; the entry opens the first tab the user may read
    // and stays highlighted on all four (their pages keep their own addresses).
    const managementTabs = allowedManagementTabs(this.appPermissions());
    if (managementTabs.length > 0) {
      items.push({
        label: marker("Management"),
        icon: "category",
        link: [managementTabs[0].link],
        testId: "nav-management",
        activeUnder: managementTabs.map((tab) => tab.link),
      });
    }
    if (this.canViewUserSettings()) {
      items.push({ label: marker("User Settings"), icon: "manage_accounts", link: ["/settings"], testId: "nav-user-settings" });
    }
    if (has(Permission.AppReceiptProcessingSettingsUpdate)) {
      items.push({ label: "AI", icon: "smart_toy", link: ["/ai"], testId: "nav-ai" });
    }
    items.push({ label: marker("Theme"), icon: "palette", link: ["/theme"], testId: "nav-theme" });
    items.push({ label: marker("Language"), icon: "translate", link: ["/language"], testId: "nav-language" });

    return items;
  });

  /**
   * Whether "Manage" is expanded: open while the user is on one of its pages, so the active one is
   * visible, and otherwise whatever they toggled it to until the next navigation.
   */
  public readonly isManageOpen = linkedSignal(() => {
    const url = this.currentUrl();
    return this.manageNavItems().some((item) => this.isActiveUnder(item, url) || url.startsWith(item.link[0]));
  });

  /** Whether an entry that covers several pages (Management) is the current one. */
  public isActiveUnder(item: ManageNavItem, url: string = this.currentUrl()): boolean {
    return !!item.activeUnder?.some((link) => url === link || url.startsWith(`${link}/`) || url.startsWith(`${link}?`));
  }

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
    this.groupStore.setSelectedGroupId(groupId.toString());
    this.receiptTableStore.setPage(1);
    this.router.navigate([this.groupStore.overviewLink()]);
  }

  public closeMobileSidebar(): void {
    this.sidebar.setOpenMobile(false);
  }

  /** The tab bar's More: everything that is not a tab lives in the sheet. */
  public openMobileSidebar(): void {
    this.sidebar.setOpenMobile(true);
  }

  /**
   * The tab bar's Scan. The launcher (and the scan dialog behind it) loads on the first tap, so the shell's own bundle
   * does not carry the receipts code.
   */
  public openQuickScan(): void {
    void import("../../receipts/quick-scan-dialog/quick-scan-launcher.service").then(({ QuickScanLauncher }) =>
      this.injector.get(QuickScanLauncher).open().pipe(take(1)).subscribe()
    );
  }

  public logout(): void {
    this.authService
      .logout()
      .pipe(
        take(1),
        // Signing out always ends the session in this browser, even when the server could not be told (no
        // connection, or a refresh token it had already retired); the token then just runs out there.
        catchError(() => of(undefined)),
        switchMap(() => this.store.dispatch(new Logout())),
        switchMap(() => this.router.navigate(["/"])),
      )
      .subscribe();
  }

  public openAboutDialog(): void {
    this.dialog.open(AboutComponent, DEFAULT_DIALOG_CONFIG);
  }
}
