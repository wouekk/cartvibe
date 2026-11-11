import { Component, computed, effect, ElementRef, inject, linkedSignal, signal, untracked, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { shakeElement } from "../../utils/shake";
import { AppDialog } from "../../dialog/app-dialog";
import { takeUntilDestroyed, toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, filter, map, of, switchMap, take } from "rxjs";
import {
  FilterOperation,
  GroupOverview,
  OverviewService,
  Permission,
  Receipt,
  ReceiptService,
  SortDirection,
} from "../../open-api";
import { ProductCheckLauncher } from "../../product-check/product-check-launcher.service";
import { QuickScanLauncher } from "../../receipts/quick-scan-dialog/quick-scan-launcher.service";
import { AuthState, GroupState, FeatureConfigStore } from "../../store";
import { SnackbarService } from "../../services";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { DEFAULT_DIALOG_CONFIG } from "../../constants/dialog.constant";
import { todayInZone } from "../../utils/app-time-zone";
import { hasAll } from "../../utils/permission.utils";
import { finePointerSignal } from "../../utils/fine-pointer";
import { TranslationService } from "../../i18n/translation.service";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import {
  completeLayout,
  DashboardLayout,
  defaultLayout,
  GRID_COLUMNS,
  movePanel,
  applyDrop,
  DropCell,
  pinPlacements,
  placePanels,
  resolveDrop,
  roomToTheRight,
  PanelGroup,
  panelDefinition,
  panelKind,
  resizePanel,
  ResolvedPanel,
  resolveLayout,
  sameLayout,
  setVisible,
  SizeClass,
  sizeClassFor,
  dropTargetAt,
  PanelRect,
  sizeLimitHit,
  SizeLimit,
  tagPanelId,
} from "../dashboard-layout/dashboard-layout";
import { DashboardLayoutStore } from "../dashboard-layout/dashboard-layout.store";
import {
  describeChangeAgainst,
  DonutSegment,
} from "../overview-chart.utils";
import {
  OverviewDetailDialogComponent,
  OverviewDetailDialogData,
  OverviewDetailKind,
} from "../overview-detail-dialog/overview-detail-dialog.component";
import { summarizeShoppingLists } from "../overview-lists";
import { previousLabel, resolvePeriod, ResolvedPeriod } from "../overview-period";
import { monthSummary } from "../overview-summary";
import { marker } from "../../i18n/marker";
import { formatDateInput, parseDateInput } from "../../datepicker/date-input.directive";
import { addCalendarMonths, WARRANTY_ENDING_SOON_MONTHS, warrantyRows } from "../../utils/warranty-period";
import { SettingsTabsComponent } from "../../shared-ui/settings/settings-tabs.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { PeriodPickerComponent } from "../period-picker/period-picker.component";
import { HlmSwitch } from "../../ui/switch/lib/hlm-switch";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { OverviewCategoriesPanelComponent } from "../overview-categories-panel/overview-categories-panel.component";
import { OverviewTrendPanelComponent } from "../overview-trend-panel/overview-trend-panel.component";
import { OverviewSpentTileComponent } from "../overview-spent-tile/overview-spent-tile.component";
import { OverviewReceiptsPanelComponent } from "../overview-receipts-panel/overview-receipts-panel.component";
import { OverviewWarrantiesPanelComponent } from "../overview-warranties-panel/overview-warranties-panel.component";
import { OverviewShoppingPanelComponent } from "../overview-shopping-panel/overview-shopping-panel.component";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { HlmDropdownMenuSeparator } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-separator";
import { TranslatePipe, PluralPipe } from "../../i18n/translate.pipe";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";

/** Receipts listed per height step of the receipts panel. */
const RECENT_RECEIPT_COUNT = 6;

/** With a mouse the receipts panel loads this many of the period and scrolls them within its own height. */
const RECENT_RECEIPT_SCROLL_LIMIT = 50;

/** The customise screen's preview sizes, in CSS pixels; the PC preview takes the full width. */
const PREVIEW_WIDTHS: Record<string, number | null> = { mobile: 375, tablet: 768, pc: null };

/** The gap between panels (`gap-4`), which the panel widths make room for. */
const PANEL_GAP_PX = 16;

/** The taller height step of a chart, list or table panel. */
const TALL_PANEL_HEIGHT = "34rem";

/** How far the pointer travels to change a panel's height step while resizing. */
const RESIZE_ROW_STEP_PX = 80;

/** Dragging near the top or bottom edge of the scrolling area scrolls it. */
const DRAG_SCROLL_EDGE_PX = 56;
const DRAG_SCROLL_STEP_PX = 14;

/** What a panel says when a size change runs into its limit (see `sizeLimitHit`). */
const SIZE_LIMIT_MESSAGES: Record<SizeLimit, string> = {
  "min-cols": marker("{name} can't be made any narrower."),
  "max-cols": marker("{name} can't be made any wider."),
  "min-rows": marker("{name} can't be made any shorter."),
  "max-rows": marker("{name} can't be made any taller."),
};

/** The nearest ancestor that scrolls vertically, or undefined when the page itself does. */
function scrollParent(element: HTMLElement): HTMLElement | undefined {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return undefined;
}

const LIBRARY_GROUPS: { key: PanelGroup; label: string }[] = [
  { key: "kpi", label: marker("Key figures") },
  { key: "tags", label: marker("Tags") },
  { key: "charts", label: marker("Charts") },
  { key: "lists", label: marker("Lists") },
];

/** How many item names a shopping list card spells out before "and N more". */
const LIST_PREVIEW_ITEMS = 3;

/** The Dashboard's name for the unknown food group. */
const UNCATEGORIZED = marker("Uncategorized");

/**
 * The Dashboard (the landing page): a period at a glance for the selected group, any period from a
 * week to a custom range (Phase 3 D1, decision Q10). Spend and its change against the period before,
 * receipts to check, what went on unhealthy food and on things not on the shopping list, what is left
 * to buy, spend by category, the trend, and the latest receipts. Unhealthy, Unplanned and each
 * category open the list behind them. Each card loads independently, so one failing request blanks
 * only itself.
 */
@Component({
    selector: "app-overview-page",
    templateUrl: "./overview-page.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        SettingsTabsComponent,
        BrnButton,
        HlmButton,
        AppIconComponent,
        PeriodPickerComponent,
        HlmSwitch,
        CdkMenuTrigger,
        HlmDropdownMenuTrigger,
        RouterLink,
        MoneyComponent,
        OverviewCategoriesPanelComponent,
        OverviewReceiptsPanelComponent,
        OverviewSpentTileComponent,
        OverviewTrendPanelComponent,
        OverviewWarrantiesPanelComponent,
        OverviewShoppingPanelComponent,
        CdkMenu,
        HlmDropdownMenu,
        CdkMenuItem,
        HlmDropdownMenuFocusOnHover,
        HlmDropdownMenuItem,
        HlmDropdownMenuSeparator,
        TranslatePipe,
        PluralPipe, HlmTooltip],
})
export class OverviewPageComponent {
  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  public readonly groupId = toSignal(
    this.activatedRoute.paramMap.pipe(map((params) => Number(params.get("groupId")))),
    { requireSync: true }
  );

  public readonly timeZone = this.systemSettingsStore.timeZone;

  /**
   * The days to ask for, set by the period picker; undefined while a custom range is incomplete. It
   * starts as this month so the first render never shows the "pick a range" prompt.
   */
  public readonly period = signal<ResolvedPeriod | undefined>(
    resolvePeriod("THIS_MONTH", todayInZone(this.systemSettingsStore.timeZone()))
  );

  /** The receipts list opened from a Dashboard figure starts on the period on show. */
  public readonly receiptsQuery = computed(() => {
    const period = this.period();
    return period ? { from: period.from, to: period.to } : {};
  });

  public readonly periodLabel = computed(() => this.translation.months(this.period()?.label ?? ""));

  private readonly userPreferences = this.store.selectSignal(AuthState.userPreferences);

  /** The monthly spending goal from the user's settings; 0 when none is set. */
  public readonly goal = computed(() => {
    const goal = Number(this.userPreferences()?.monthlySpendingGoal ?? 0);
    return goal > 0 ? goal : 0;
  });

  /**
   * The sentence above the panels, while the running month is shown and a goal is set: what was spent, the goal,
   * the days left and what a day may cost to end the month on the goal. Empty otherwise (no goal, another range,
   * a month that is over, or nothing loaded yet).
   */
  public readonly summarySentence = computed(() => {
    const overview = this.overview();
    const period = this.period();
    if (!overview) {
      return "";
    }

    const summary = monthSummary(Number(overview.total), this.goal(), period?.from, period?.to, this.appToday());
    if (!summary) {
      return "";
    }

    const money = (value: number) => this.displayCurrencyService.format(value);
    const params = {
      spent: money(summary.spent),
      goal: money(summary.goal),
      over: money(summary.over),
      perDay: money(summary.perDay),
      days: `${summary.daysLeft} ${this.translation.plural(summary.daysLeft, "day", "days")}`,
    };
    if (summary.over > 0) {
      return this.translation.t(marker("{spent} spent this month: {over} over the goal of {goal}. Left: {days}."), params);
    }
    if (summary.remaining === 0) {
      return this.translation.t(marker("{spent} spent this month: the goal of {goal} is reached. Left: {days}."), params);
    }
    return this.translation.t(marker("{spent} of {goal} spent this month. Left: {days}, so {perDay} a day stays on goal."), params);
  });

  private readonly groups = this.store.selectSignal(GroupState.groups);

  public readonly groupName = computed(
    () => this.groups().find((group) => group.id === this.groupId())?.name ?? ""
  );

  /**
   * What the panels ask for. Compared by value: the period picker hands over its own period as soon as it mounts (the
   * same days as the one this page starts on, in a new object), and each new object here used to send every request
   * of the page a second time.
   */
  private readonly request = computed(
    () => {
      const period = this.period();
      return period ? { groupId: this.groupId(), from: period.from, to: period.to } : undefined;
    },
    { equal: (a, b) => a?.groupId === b?.groupId && a?.from === b?.from && a?.to === b?.to }
  );

  /** undefined while loading (or a custom range is incomplete), null when the request failed. */
  public readonly overview = toSignal<GroupOverview | null | undefined>(
    toObservable(this.request).pipe(
      switchMap((request) =>
        request
          ? this.overviewService
              .getGroupOverview(request.groupId, undefined, request.from, request.to)
              .pipe(catchError(() => of(null)))
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  );

  private readonly finePointer = finePointerSignal();

  /** The receipts the panel is tall enough for: six, or twelve when it is made taller. */
  private readonly receiptsPanelVisible = computed(() => RECENT_RECEIPT_COUNT * this.receiptsPanelRows());

  /**
   * With a mouse the panel loads more of the period and scrolls them under the wheel. On a touch screen it lists only
   * what it is tall for: a scroll box under the thumb would catch the swipe meant for the page, and the table already
   * scrolls sideways on a phone.
   */
  private readonly receiptsRequest = computed(() => {
    const request = this.request();
    const pageSize = this.finePointer() ? RECENT_RECEIPT_SCROLL_LIMIT : this.receiptsPanelVisible();
    return request ? { ...request, pageSize } : undefined;
  });

  public readonly recentReceipts = toSignal(
    toObservable(this.receiptsRequest).pipe(
      switchMap((request) =>
        request
          ? this.receiptService
              .getReceiptsForGroup(request.groupId, {
                page: 1,
                pageSize: request.pageSize,
                orderBy: "date",
                sortDirection: SortDirection.Desc,
                filter: { date: { operation: FilterOperation.Between, value: [request.from, request.to] } },
              })
              .pipe(
                // The generated item type is a merge of every paged model, so it needs an explicit narrowing.
                map((page) => page.data as unknown as Receipt[]),
                catchError(() => of([] as Receipt[]))
              )
          : of([] as Receipt[])
      )
    ),
    { initialValue: [] as Receipt[] }
  );

  /** Today in the app time zone, "yyyy-MM-dd": the warranty panel counts its days left from it. */
  private readonly appToday = computed(() => formatDateInput(todayInZone(this.systemSettingsStore.timeZone())));

  /** Bumped after a warranty row's Edit or Remove, so the panel loads again. */
  private readonly warrantyReload = signal(0);

  public reloadWarranties(): void {
    this.warrantyReload.update((count) => count + 1);
  }

  /**
   * The receipts whose warranty ends in the next two months, nearest first, whatever the period picked: what is still
   * covered and soon will not be. The tile counts them; the panel lists their products.
   */
  public readonly warrantiesEndingSoon = toSignal(
    toObservable(
      computed(() => ({ groupId: this.request() ? this.groupId() : undefined, reload: this.warrantyReload() }), {
        // The list does not depend on the period, so a new period does not load it again.
        equal: (a, b) => a.groupId === b.groupId && a.reload === b.reload,
      })
    ).pipe(
      switchMap(({ groupId }) => {
        if (groupId === undefined) {
          return of([] as Receipt[]);
        }
        const today = this.appToday();
        const endsBy = formatDateInput(addCalendarMonths(parseDateInput(today) ?? new Date(), WARRANTY_ENDING_SOON_MONTHS));
        return this.receiptService
          .getReceiptsForGroup(groupId, {
            page: 1,
            pageSize: 50,
            orderBy: "warranty_until",
            sortDirection: SortDirection.Asc,
            filter: { warrantyActive: true, warrantyEndsBy: endsBy },
          })
          .pipe(
            map((page) => page.data as unknown as Receipt[]),
            catchError(() => of([] as Receipt[]))
          );
      })
    ),
    { initialValue: [] as Receipt[] }
  );

  /** The panel's rows: a product each (one row for a receipt without products), with its days left (0 is today). */
  public readonly warrantyEndingSoonRows = computed(() => warrantyRows(this.warrantiesEndingSoon(), this.appToday()));

  /** The scroll box height: the header and the visible rows (2.5rem + a hairline each), or null when they all fit. */
  public readonly recentReceiptsMaxHeight = computed(() => {
    const rows = this.receiptsPanelVisible();
    return this.finePointer() && this.recentReceipts().length > rows ? `calc(${rows + 1} * (2.5rem + 1px))` : null;
  });

  /** Unhealthy tile (Phase 3 D2): what the period's products rated unhealthy cost, and their share. */
  public readonly unhealthyTotal = computed(() => Number(this.overview()?.unhealthyTotal ?? 0));

  public readonly unhealthyShare = computed(() => {
    const total = Number(this.overview()?.total ?? 0);
    return total > 0 ? Math.round((this.unhealthyTotal() / total) * 100) : 0;
  });

  /** Unplanned tile (Phase 3 D1): what was bought that was not on the shopping list. */
  public readonly unplannedTotal = computed(() => Number(this.overview()?.unplannedTotal ?? 0));

  /** What the previous* figures are compared with: "September 2026", "2025", "5 Oct 2026 – 11 Oct 2026". */
  private readonly translate = (text: string, params?: Record<string, string | number | null | undefined>) => this.translation.t(text, params);

  public readonly previousName = computed(() => {
    const overview = this.overview();
    return overview ? previousLabel(overview.previousFrom ?? "", overview.previousTo ?? "") : "";
  });

  public readonly change = computed(() => {
    const overview = this.overview();
    return overview ? describeChangeAgainst(overview.total, overview.previousTotal, this.previousName(), this.translate) : undefined;
  });

  /** Spending went up, which the tile shows in the warning color. */
  public readonly changeIsIncrease = computed(() => {
    const overview = this.overview();
    return !!overview && Number(overview.total) > Number(overview.previousTotal);
  });

  public readonly unhealthyChange = computed(() => {
    const overview = this.overview();
    return overview
      ? describeChangeAgainst(overview.unhealthyTotal, overview.previousUnhealthyTotal ?? "0", this.previousName(), this.translate)
      : undefined;
  });

  public readonly unplannedChange = computed(() => {
    const overview = this.overview();
    return overview
      ? describeChangeAgainst(overview.unplannedTotal ?? "0", overview.previousUnplannedTotal ?? "0", this.previousName(), this.translate)
      : undefined;
  });

  /**
   * One tile per tag marked "Show on the Dashboard" (Manage Tags), built like the Unhealthy tile: what the
   * period's product lines carrying the tag cost, their share of the spending, and the change.
   */
  public readonly tagTiles = computed(() => {
    const overview = this.overview();
    if (!overview) {
      return [];
    }
    const spent = Number(overview.total);
    return (overview.tags ?? []).map((tag) => {
      const total = Number(tag.total);
      return {
        tagId: tag.tagId,
        name: tag.name,
        total,
        share: spent > 0 ? Math.round((total / spent) * 100) : 0,
        change: describeChangeAgainst(tag.total, tag.previousTotal, this.previousName(), this.translate),
      };
    });
  });

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  public readonly canAddReceipt = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsCreate)
  );

  private readonly hasAiPoweredReceipts = computed(() => this.featureConfigStore.hasFeature("aiPoweredReceipts"));

  /** Whether anyone has set the AI up yet; without it Quick Scan cannot read a receipt. */
  public readonly aiConfigured = computed(() => this.hasAiPoweredReceipts());

  private readonly quickScanLauncher = inject(QuickScanLauncher);

  /** The button shows whenever the member may scan; without the AI it asks for a key instead of opening the dialog. */
  public readonly canQuickScan = computed(() => hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsQuickScan));

  /** The shopping list group: this group when readable, otherwise the user's first readable one. */
  public readonly shoppingListGroupId = this.store.selectSignal(ShoppingListState.targetGroupId);

  public readonly canCreateList = computed(() => {
    const listGroupId = this.shoppingListGroupId();
    return (
      listGroupId !== undefined &&
      hasAll(this.groupPermissions()[listGroupId] ?? [], Permission.GroupShoppingListsCreate)
    );
  });

  /** Where "New list" goes, as the segments a routerLink takes. */
  public readonly newListLink = computed(() => ["/shopping-lists/group", String(this.shoppingListGroupId())]);

  private readonly shoppingLists = this.store.selectSignal(ShoppingListState.lists);

  private readonly loadedShoppingListGroupId = this.store.selectSignal(ShoppingListState.groupId);

  /** The open lists of the shopping list group, for the Dashboard's shopping panel (empty until that group has loaded). */
  public readonly openLists = computed(() =>
    this.loadedShoppingListGroupId() === this.shoppingListGroupId() ? this.shoppingLists() : []
  );

  /** Crossing items off from the panel needs the same permission as on the Shopping lists page. */
  public readonly canUpdateLists = computed(() => {
    const listGroupId = this.shoppingListGroupId();
    return (
      listGroupId !== undefined &&
      hasAll(this.groupPermissions()[listGroupId] ?? [], Permission.GroupShoppingListsUpdate)
    );
  });

  // ---- Panel layout (src/overview/dashboard-layout): what shows, in what order and at what size -------------------

  /** The customise screen (`/overview/group/:id/customize`) is this page in edit mode, so the preview shows real data. */
  public readonly customising = toSignal(this.activatedRoute.data.pipe(map((data) => data["customise"] === true)), {
    initialValue: this.activatedRoute.snapshot?.data?.["customise"] === true,
  });

  public readonly canCustomiseLayout = this.layoutStore.canCustomise;

  public readonly customiseLink = computed(() => ["/overview/group", String(this.groupId()), "customize"]);

  /** The panels this person can have: the shopping ones need a readable list group, a tag needs "Show on the Dashboard". */
  public readonly availablePanels = computed(() => {
    const ids = ["spent", "receipts", "unhealthy", "unplanned", "categories", "trend", "recentReceipts", "warranties", "warrantiesEndingSoon"];
    if (this.shoppingListGroupId() !== undefined) {
      ids.push("toBuy", "shoppingList");
    }
    return [...ids, ...(this.overview()?.tags ?? []).map((tag) => tagPanelId(tag.tagId))];
  });

  /** The layout being edited on the customise screen; it starts from the saved one and follows it after a save. */
  public readonly draftLayout = linkedSignal<DashboardLayout | undefined>(() => this.layoutStore.layout());

  private readonly activeLayout = computed(() => (this.customising() ? this.draftLayout() : this.layoutStore.layout()));

  /** The grid's own width picks phone, tablet or PC, so the preview frame reflows the panels like a real screen. */
  private readonly gridWidth = signal(0);

  private readonly panelGrid = viewChild<ElementRef<HTMLElement>>("panelGrid");

  public readonly sizeClass = computed<SizeClass>(() => (this.gridWidth() > 0 ? sizeClassFor(this.gridWidth()) : "wide"));

  public readonly gridColumns = computed(() => GRID_COLUMNS[this.sizeClass()]);

  public readonly panels = computed(() => resolveLayout(this.activeLayout(), this.availablePanels(), this.sizeClass()));

  private readonly receiptsPanelRows = computed(
    () => completeLayout(this.activeLayout(), this.availablePanels()).panels.find((panel) => panel.id === "recentReceipts")?.rows ?? 1
  );

  public readonly layoutDirty = computed(() => {
    const available = this.availablePanels();
    return !sameLayout(completeLayout(this.draftLayout(), available), completeLayout(this.layoutStore.layout(), available));
  });

  public readonly savingLayout = signal(false);

  /** The panel list above the preview; its button folds it away to see more of the preview. */
  public readonly libraryOpen = signal(true);

  public readonly previewTabs: FilterTab[] = [
    { value: "mobile", label: marker("Mobile"), icon: "smartphone" },
    { value: "tablet", label: marker("Tablet"), icon: "tablet" },
    { value: "pc", label: marker("PC"), icon: "computer" },
  ];

  public readonly previewDevice = signal("pc");

  public readonly previewWidth = computed(() => (this.customising() ? PREVIEW_WIDTHS[this.previewDevice()] ?? null : null));

  public readonly previewFrame = computed(() => this.previewWidth() !== null);

  public setPreviewDevice(device: string): void {
    this.previewDevice.set(device in PREVIEW_WIDTHS ? device : "pc");
  }

  /** The panel list: every available panel by group, switched on or off. */
  public readonly libraryGroups = computed(() => {
    const available = this.availablePanels();
    const panels = completeLayout(this.draftLayout(), available).panels.filter((panel) => available.includes(panel.id));
    return LIBRARY_GROUPS.map((group) => ({
      ...group,
      entries: panels
        .filter((panel) => panelDefinition(panel.id)?.group === group.key)
        .map((panel) => ({ id: panel.id, label: this.panelLabel(panel.id), visible: panel.visible })),
    })).filter((group) => group.entries.length > 0);
  });

  public panelLabel(id: string): string {
    if (panelKind(id) === "tag") {
      return this.overview()?.tags?.find((tag) => tagPanelId(tag.tagId) === id)?.name ?? this.translation.t("Tag");
    }
    return this.translation.t(panelDefinition(id)?.label ?? id);
  }

  public tagTile(id: string) {
    return this.tagTiles().find((tile) => tagPanelId(tile.tagId) === id);
  }

  /**
   * A panel sits in a cell of the grid: its start column and row, and exactly its width in columns. Panels never stretch,
   * so the size set in the editor is the size drawn, and a row may have empty columns.
   */
  public gridColumn(panel: ResolvedPanel): string {
    return `${panel.x + 1} / span ${panel.span}`;
  }

  public gridRow(panel: ResolvedPanel): number {
    return panel.row + 1;
  }

  /**
   * The panels as drawn. While one is dragged on a phone or tablet, the others reflow live to the order it would have if
   * dropped now; in the PC view they stay where they are and a dashed outline shows the cell it would take.
   */
  public readonly displayPanels = computed(() => {
    const order = this.dragOrder();
    const panels = this.panels();
    if (!order) {
      return panels;
    }
    const ordered = order.map((id) => panels.find((panel) => panel.id === id) as ResolvedPanel).filter(Boolean);
    const placed = placePanels(ordered, this.gridColumns(), false);
    return ordered.map((panel, index) => ({ ...panel, x: placed[index].x, row: placed[index].row }));
  });

  /** The cell a dragged panel would take in the PC view. */
  public readonly dropPreview = signal<(DropCell & { span: number }) | undefined>(undefined);

  /** "2/6": the width a panel has, so a change is always visible. */
  public sizeLabel(panel: ResolvedPanel): string {
    return `${panel.span}/${this.gridColumns()}`;
  }

  /** A taller panel keeps its extra height; the content grows past it rather than being cut. */
  public panelMinHeight(panel: ResolvedPanel): string | null {
    return panel.rows > 1 && this.sizeClass() !== "compact" ? TALL_PANEL_HEIGHT : null;
  }

  /** Edits start from the saved layout completed with what is available now (new tags included). */
  private editLayout(change: (layout: DashboardLayout) => DashboardLayout): void {
    this.draftLayout.set(change(completeLayout(this.draftLayout(), this.availablePanels())));
  }

  public setPanelVisible(id: string, visible: boolean): void {
    this.editLayout((layout) => setVisible(layout, id, visible));
  }

  /** Resizes a panel; a size past its limits is refused with a shake and a short note instead of silently clamped. */
  public resize(id: string, size: { cols?: number; rows?: number }): boolean {
    if (size.cols !== undefined && this.sizeClass() !== "wide") {
      shakeElement(this.panelElement(id));
      this.snackbarService.hint(this.translation.t(marker("Widths are set in the PC view.")));
      return false;
    }
    const hit = sizeLimitHit(id, size) ?? this.noRoomToWiden(id, size.cols);
    if (hit) {
      this.notifyLimit(id, hit.limit);
      return false;
    }
    this.commitSize(id, size);
    return true;
  }

  /** In the PC view a panel may only grow up to the next panel in its row, or the grid's edge. */
  private noRoomToWiden(id: string, cols: number | undefined): { limit: SizeLimit; value: number } | undefined {
    if (cols === undefined || this.sizeClass() !== "wide") {
      return undefined;
    }
    const room = roomToTheRight(this.panels(), id);
    return cols > room ? { limit: "max-cols", value: room } : undefined;
  }

  /** Writes a size that fits (limits and room already respected), keeping every other panel where it is. */
  private commitSize(id: string, size: { cols?: number; rows?: number }): void {
    const placements = this.panels();
    this.editLayout((layout) => resizePanel(this.sizeClass() === "wide" ? pinPlacements(layout, placements) : layout, id, size));
  }

  /** A requested size cut back to what the panel's limits and the room beside it allow. */
  private clampSize(id: string, size: { cols: number; rows: number }): { cols: number; rows: number } {
    const definition = panelDefinition(id);
    if (!definition) {
      return size;
    }
    const maxCols = this.sizeClass() === "wide" ? Math.min(definition.maxCols, roomToTheRight(this.panels(), id)) : definition.maxCols;
    return {
      cols: Math.min(maxCols, Math.max(definition.minCols, size.cols)),
      rows: Math.min(definition.maxRows, Math.max(1, size.rows)),
    };
  }

  /**
   * The panel menu's Wider / Narrower / Taller / Shorter. The menu keeps the panel it was opened with, so the step starts
   * from the panel's size now (by id), never from that stale copy: after widening, Narrower has to narrow from the new width.
   */
  public stepSize(id: string, byCols: number, byRows: number): void {
    const current = this.panels().find((panel) => panel.id === id);
    if (!current) {
      return;
    }
    this.resize(id, byCols !== 0 ? { cols: current.cols + byCols } : { rows: current.rows + byRows });
  }

  public toggleHeight(id: string): void {
    this.stepSize(id, 0, this.rowsOf(id) === 1 ? 1 : -1);
  }

  public rowsOf(id: string): number {
    return this.panels().find((panel) => panel.id === id)?.rows ?? 1;
  }

  private notifyLimit(id: string, limit: SizeLimit): void {
    shakeElement(this.panelElement(id));
    this.snackbarService.hint(this.translation.t(SIZE_LIMIT_MESSAGES[limit], { name: this.panelLabel(id) }));
  }

  private panelElement(id: string): HTMLElement | null {
    return this.panelGrid()?.nativeElement.querySelector<HTMLElement>(`[data-panel-id="${id}"]`) ?? null;
  }

  public canChangeHeight(panel: ResolvedPanel): boolean {
    return (panelDefinition(panel.id)?.maxRows ?? 1) > 1;
  }

  public isFirstPanel(id: string): boolean {
    return this.panels()[0]?.id === id;
  }

  public isLastPanel(id: string): boolean {
    return this.panels().at(-1)?.id === id;
  }

  /** Moves a panel one place among the shown ones, in the order of the size being previewed. */
  public shiftPanel(id: string, by: -1 | 1): void {
    const shown = this.panels();
    const target = shown[shown.findIndex((panel) => panel.id === id) + by];
    if (target) {
      this.editLayout((layout) => movePanel(layout, this.sizeClass(), id, target.id));
    }
  }

  /** The PC view's Move left / right / up / down: one cell that way, else the nearest free spot, else it says there is no room. */
  public nudgePanel(id: string, dx: number, dy: number): void {
    const placements = this.panels();
    const own = placements.find((place) => place.id === id);
    if (!own) {
      return;
    }
    const cell = resolveDrop(placements, id, own.span, own.row + dy, own.x + dx);
    if (!cell.newRow && cell.x === own.x && cell.row === own.row) {
      shakeElement(this.panelElement(id));
      this.snackbarService.hint(this.translation.t(marker("There is no room to move {name} that way."), { name: this.panelLabel(id) }));
      return;
    }
    this.editLayout((layout) => applyDrop(pinPlacements(layout, placements), placements, id, cell));
  }

  // ---- Dragging a panel (any direction, diagonals included) -----------------------------------------------------

  /** The shown panels' order while one is being dragged; undefined otherwise. */
  private readonly dragOrder = signal<string[] | undefined>(undefined);

  public readonly draggingId = signal<string | undefined>(undefined);

  /**
   * Starts moving a panel by its handle. The panel follows the pointer; the others reflow live to the place it would
   * take (the nearest panel to the pointer), and letting go keeps that order. Escape or a cancelled pointer puts it back.
   */
  public startDrag(event: PointerEvent, panel: ResolvedPanel): void {
    const grid = this.panelGrid()?.nativeElement;
    const element = this.panelElement(panel.id);
    if (!grid || !element || event.button !== 0 || this.draggingId()) {
      return;
    }
    event.preventDefault();

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);

    const original = this.panels().map((shown) => shown.id);
    const scroller = scrollParent(grid);
    const startRect = element.getBoundingClientRect();
    // Where the pointer grabbed the panel, relative to its top left corner.
    const grabX = event.clientX - startRect.left;
    const grabY = event.clientY - startRect.top;
    let translateX = 0;
    let translateY = 0;
    let pointer = { x: event.clientX, y: event.clientY };
    let frame = 0;

    const wide = this.sizeClass() === "wide";
    this.draggingId.set(panel.id);
    this.dragOrder.set(wide ? undefined : original);

    const place = () => {
      // The panel's own slot is where it would sit untransformed, so the drag follows the pointer across reflows.
      const rect = element.getBoundingClientRect();
      const slotLeft = rect.left - translateX;
      const slotTop = rect.top - translateY;
      translateX = pointer.x - grabX - slotLeft;
      translateY = pointer.y - grabY - slotTop;
      element.style.transform = `translate(${translateX}px, ${translateY}px)`;

      if (wide) {
        // The PC view: the others stay put and a dashed outline shows the cell the panel would take.
        this.dropPreview.set(this.cellUnderPanel(panel, pointer.x - grabX, pointer.y));
        return;
      }

      const insideOwnSlot = pointer.x >= slotLeft && pointer.x <= slotLeft + rect.width && pointer.y >= slotTop && pointer.y <= slotTop + rect.height;
      if (insideOwnSlot) {
        return;
      }
      const rects: PanelRect[] = (this.dragOrder() ?? original).map((id) => {
        const box = this.panelElement(id)?.getBoundingClientRect();
        return { id, left: box?.left ?? 0, top: box?.top ?? 0, width: box?.width ?? 0, height: box?.height ?? 0 };
      });
      const targetId = dropTargetAt(rects, pointer, panel.id);
      const order = this.dragOrder() ?? original;
      if (targetId && order.indexOf(targetId) !== order.indexOf(panel.id)) {
        const moved = order.filter((id) => id !== panel.id);
        moved.splice(order.indexOf(targetId), 0, panel.id);
        this.dragOrder.set(moved);
      }
    };

    const autoScroll = () => {
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      const step = pointer.y < top + DRAG_SCROLL_EDGE_PX ? -DRAG_SCROLL_STEP_PX : pointer.y > bottom - DRAG_SCROLL_EDGE_PX ? DRAG_SCROLL_STEP_PX : 0;
      if (step !== 0) {
        if (scroller) {
          scroller.scrollTop += step;
        } else {
          window.scrollBy(0, step);
        }
      }
      // Every frame, so the panel stays under the pointer after the others reflow or the page scrolls.
      place();
      frame = requestAnimationFrame(autoScroll);
    };

    const move = (moveEvent: PointerEvent) => {
      pointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      place();
    };

    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      handle.releasePointerCapture?.(event.pointerId);
      element.style.transform = "";

      const order = this.dragOrder();
      const preview = this.dropPreview();
      this.dragOrder.set(undefined);
      this.dropPreview.set(undefined);
      this.draggingId.set(undefined);
      if (commit && wide && preview) {
        const placements = this.panels();
        this.editLayout((layout) => applyDrop(pinPlacements(layout, placements), placements, panel.id, preview));
      } else if (commit && order) {
        const index = order.indexOf(panel.id);
        const target = original[index];
        if (target && target !== panel.id) {
          this.editLayout((layout) => movePanel(layout, this.sizeClass(), panel.id, target));
        }
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        finish(false);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    frame = requestAnimationFrame(autoScroll);
    place();
  }

  /**
   * The grid cell a panel dragged in the PC view would land in: its left edge picks the column, the pointer picks the row
   * (below the last row opens a new one), and a taken cell moves to the nearest free spot (see `resolveDrop`).
   */
  private cellUnderPanel(panel: ResolvedPanel, leftEdge: number, pointerY: number): DropCell & { span: number } {
    const grid = this.panelGrid()?.nativeElement;
    const placements = this.panels();
    if (!grid) {
      return { x: panel.x, row: panel.row, newRow: false, span: panel.span };
    }
    const box = grid.getBoundingClientRect();
    const columnWidth = (box.width + PANEL_GAP_PX) / this.gridColumns();
    const x = Math.round((leftEdge - box.left) / columnWidth);

    const bands = new Map<number, { top: number; bottom: number }>();
    for (const place of placements) {
      // The dragged panel is skipped: it is under the pointer, so its own box would put the pointer in every row it passes.
      const rect = place.id === panel.id ? undefined : this.panelElement(place.id)?.getBoundingClientRect();
      if (rect) {
        const band = bands.get(place.row);
        bands.set(place.row, { top: Math.min(band?.top ?? rect.top, rect.top), bottom: Math.max(band?.bottom ?? rect.bottom, rect.bottom) });
      }
    }
    const sorted = [...bands.entries()].sort((a, b) => a[0] - b[0]);
    let row = sorted.length;
    if (sorted.length > 0 && pointerY < sorted[0][1].top) {
      row = 0;
    }
    for (const [rank, band] of sorted) {
      if (pointerY <= band.bottom + PANEL_GAP_PX / 2) {
        row = rank;
        break;
      }
    }
    return { ...resolveDrop(placements, panel.id, panel.span, row, x, this.gridColumns()), span: panel.span };
  }

  /**
   * Corner-handle resize in the PC view, wider or narrower, taller or shorter and diagonally in one gesture: the width
   * snaps to grid columns and the height to its steps. At a limit the panel shakes and says so, once per time it is hit.
   */
  public startResize(event: PointerEvent, panel: ResolvedPanel): void {
    const grid = this.panelGrid()?.nativeElement;
    if (!grid || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const columnWidth = (grid.getBoundingClientRect().width + PANEL_GAP_PX) / this.gridColumns();
    const startX = event.clientX;
    const startY = event.clientY;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    let atLimit = false;

    const move = (moveEvent: PointerEvent) => {
      const cols = panel.cols + Math.round((moveEvent.clientX - startX) / columnWidth);
      const dy = moveEvent.clientY - startY;
      const rows = dy > RESIZE_ROW_STEP_PX ? panel.rows + 1 : dy < -RESIZE_ROW_STEP_PX ? panel.rows - 1 : panel.rows;
      const hit = sizeLimitHit(panel.id, { cols, rows }) ?? this.noRoomToWiden(panel.id, cols);
      if (hit) {
        if (!atLimit) {
          atLimit = true;
          this.notifyLimit(panel.id, hit.limit);
        }
        // Keep what still fits: a diagonal drag past the width limit can still change the height.
        this.commitSize(panel.id, this.clampSize(panel.id, { cols, rows }));
        return;
      }
      atLimit = false;
      this.resize(panel.id, { cols, rows });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  public resetLayout(): void {
    this.draftLayout.set(defaultLayout(this.availablePanels()));
  }

  public saveLayout(): void {
    if (this.savingLayout()) {
      return;
    }
    this.savingLayout.set(true);
    this.layoutStore
      .save(completeLayout(this.draftLayout(), this.availablePanels()))
      .subscribe((saved) => {
        this.savingLayout.set(false);
        if (saved) {
          this.snackbarService.success(marker("Dashboard saved"));
          this.router.navigate(["/overview/group", String(this.groupId())]);
        }
      });
  }

  /** Leaves the customise screen; unsaved changes are confirmed first. */
  public cancelCustomising(): void {
    const leave = () => this.router.navigate(["/overview/group", String(this.groupId())]);
    if (!this.layoutDirty()) {
      leave();
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = marker("Discard changes");
    dialogRef.componentInstance.dialogContent = this.translation.t("Leave without saving your dashboard changes?");
    dialogRef.componentInstance.confirmText = marker("Discard");
    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => !!confirmed)
      )
      .subscribe(() => {
        this.draftLayout.set(this.layoutStore.layout());
        leave();
      });
  }

  public readonly listSummaries = computed(() => {
    if (this.loadedShoppingListGroupId() !== this.shoppingListGroupId()) {
      return [];
    }

    return summarizeShoppingLists(this.shoppingLists(), LIST_PREVIEW_ITEMS);
  });

  public readonly itemsToBuy = computed(() => this.listSummaries().reduce((sum, list) => sum + list.count, 0));

  constructor(
    private activatedRoute: ActivatedRoute,
    private overviewService: OverviewService,
    private receiptService: ReceiptService,
    private store: Store,
    private dialog: AppDialog,
    private snackbarService: SnackbarService,
    private productCheck: ProductCheckLauncher,
    public readonly displayCurrencyService: DisplayCurrencyService,
    public readonly translation: TranslationService,
    private layoutStore: DashboardLayoutStore,
    private router: Router
  ) {
    this.layoutStore.load();

    // Imperative side effect: measure the panel grid, whose own width picks the phone, tablet or PC arrangement.
    effect((onCleanup) => {
      const grid = this.panelGrid()?.nativeElement;
      if (!grid || typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver((entries) => this.gridWidth.set(entries[0]?.contentRect.width ?? 0));
      observer.observe(grid);
      untracked(() => this.gridWidth.set(grid.getBoundingClientRect().width));
      onCleanup(() => observer.disconnect());
    });

    // Imperative side effect: keep the shopping list store on the group the card describes.
    effect(() => {
      const groupId = this.shoppingListGroupId();
      if (groupId !== undefined) {
        untracked(() => this.store.dispatch(new LoadShoppingLists(groupId)));
      }
    });

    // Watched, not read once: when the app is already on the Dashboard the router keeps this component and only the
    // query changes.
    this.activatedRoute.queryParamMap
      ?.pipe(
        filter((query) => query.get("scan") === "1"),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.openScanFromShortcut());
  }

  /**
   * The installed app's "Scan a receipt" shortcut (`shortcuts` in manifest.webmanifest) lands here as `?scan=1`,
   * through the group-less `/overview` route.
   */
  private async openScanFromShortcut(): Promise<void> {
    // The query is dropped first, so a reload or Back does not open the dialog again, and the dialog opens only once
    // that has settled: a dialog closes when the address changes under it.
    await this.router.navigate([], { relativeTo: this.activatedRoute, queryParams: {}, replaceUrl: true });
    if (this.canQuickScan()) {
      this.openQuickScan();
    }
  }

  /** Opens the products behind the Unhealthy or Unplanned tile. */
  public openProducts(kind: "UNHEALTHY" | "UNPLANNED"): void {
    this.openDetail(kind, this.translation.t(kind === "UNHEALTHY" ? marker("Unhealthy products") : marker("Products not on the list")));
  }

  /**
   * Opens the product lines of one category slice (the split is by line, by category id when there is one). "Other"
   * opens the several categories it folds, one section each.
   */
  public openCategory(segment: DonutSegment): void {
    if (segment.members) {
      this.openDetail("OTHER", this.translation.data(segment.name), { members: segment.members });
      return;
    }
    this.openDetail("FOODGROUP", this.translation.data(segment.name), {
      foodGroup: segment.name === UNCATEGORIZED ? "" : segment.name,
      ...(segment.categoryId !== undefined ? { categoryId: segment.categoryId } : {}),
    });
  }

  /** Opens the receipts of one trend bar's month or day. */
  /** Opens the product lines behind a tag tile. */
  public openTag(tile: { tagId: number; name: string }): void {
    this.openDetail("TAG", tile.name, { tagId: tile.tagId });
  }

  /** Without an AI key the launcher asks whether to add one instead of opening the scan dialog. */
  public openQuickScan(): void {
    this.quickScanLauncher.open().pipe(take(1)).subscribe();
  }

  /** Checks a product's barcode on Open Food Facts; see src/product-check. */
  public scanProduct(): void {
    this.productCheck.start();
  }

  /** `title` is display text: already translated, or the data's own name. */
  private openDetail(
    kind: OverviewDetailKind,
    title: string,
    filter: Pick<OverviewDetailDialogData, "categoryId" | "foodGroup" | "tagId" | "members"> = {}
  ): void {
    const period = this.period();
    if (!period) {
      return;
    }

    const data: OverviewDetailDialogData = {
      title: `${title}, ${period.label}`,
      kind,
      groupId: this.groupId(),
      from: period.from,
      to: period.to,
      ...filter,
    };
    this.dialog.open(OverviewDetailDialogComponent, { ...DEFAULT_DIALOG_CONFIG, data });
  }
}
