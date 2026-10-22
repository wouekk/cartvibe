import { CurrencyPipe } from "@angular/common";
import { Component, computed, effect, ElementRef, linkedSignal, signal, untracked, viewChild } from "@angular/core";
import { shakeElement } from "../../utils/shake";
import { AppDialog } from "../../dialog/app-dialog";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import type { ApexOptions } from "apexcharts";

/** The ApexCharts instance handed to chart events; only its container is used here. */
type ChartContext = { el?: HTMLElement };

/** How far the active donut slice grows from the ring's center, and how faint the other slices and legend rows go. */
const DONUT_POP_OUT_SCALE = 1.06;
const DONUT_DIMMED_OPACITY = 0.45;

/** The longest text the middle of the donut shows on one line. */
const DONUT_CENTER_LABEL_MAX = 16;

/**
 * The middle of the drawn ring: the center of the box around all its slices (they always close the circle). Undefined
 * while the ring has no size yet (ApexCharts grows the slices from nothing during its entry animation).
 */
function ringCenter(paths: SVGPathElement[]): { x: number; y: number } | undefined {
  const boxes = paths.filter((path) => typeof path.getBBox === "function").map((path) => path.getBBox());
  if (boxes.length === 0) {
    return undefined;
  }
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : undefined;
}
import { catchError, filter, firstValueFrom, map, of, switchMap, take, tap } from "rxjs";
import {
  FilterOperation,
  GroupOverview,
  OverviewService,
  Permission,
  Receipt,
  ReceiptService,
  SortDirection,
  UserPreferences,
  UserPreferencesService,
} from "../../open-api";
import { ProductCheckLauncher } from "../../product-check/product-check-launcher.service";
import { openQuickScanDialog } from "../../receipts/quick-scan-dialog/open-quick-scan-dialog";
import { AuthState, FeatureConfigState, GroupState, SetUserPreferences } from "../../store";
import { SnackbarService } from "../../services";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { DEFAULT_DIALOG_CONFIG } from "../../constants/dialog.constant";
import { todayInZone } from "../../utils/app-time-zone";
import { hasAll } from "../../utils/permission.utils";
import { downloadFile } from "../../utils/file";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { ChartColors } from "../../shared-ui/apex-chart/chart-colors";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import {
  completeLayout,
  DashboardLayout,
  defaultLayout,
  GRID_COLUMNS,
  movePanel,
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
  buildMonthlyCsv,
  buildPrintHtml,
  exceedsOneYear,
  MAX_CHART_MONTHS,
  monthKeysBetween,
  shortMonthName,
  splitIntoYears,
  PrintYear,
} from "../overview-export";
import {
  buildDonutSegments,
  buildTrendBars,
  describeChangeAgainst,
  DonutSegment,
  goalLineFraction,
  parseInlineGoalInput,
} from "../overview-chart.utils";
import {
  OverviewDetailDialogComponent,
  OverviewDetailDialogData,
  OverviewDetailKind,
} from "../overview-detail-dialog/overview-detail-dialog.component";
import { summarizeShoppingLists } from "../overview-lists";
import { isWholeCalendarMonth, previousLabel, resolvePeriod, ResolvedPeriod } from "../overview-period";
import { marker } from "../../i18n/marker";

/** Receipts listed per height step of the receipts panel. */
const RECENT_RECEIPT_COUNT = 6;

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

/** The Dashboard's names for the folded and the unknown food group. */
const OTHER_SEGMENT = "Other";
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
  standalone: false,
  // The export formats money like the rest of the app; the pipe is declared in PipesModule and needs CurrencyPipe.
  providers: [CurrencyPipe, CustomCurrencyPipe],
})
export class OverviewPageComponent {
  public readonly groupId = toSignal(
    this.activatedRoute.paramMap.pipe(map((params) => Number(params.get("groupId")))),
    { requireSync: true }
  );

  public readonly timeZone = this.store.selectSignal(SystemSettingsState.timeZone);

  /**
   * The days to ask for, set by the period picker; undefined while a custom range is incomplete. It
   * starts as this month so the first render never shows the "pick a range" prompt.
   */
  public readonly period = signal<ResolvedPeriod | undefined>(
    resolvePeriod("THIS_MONTH", todayInZone(this.store.selectSnapshot(SystemSettingsState.timeZone)))
  );

  public readonly periodLabel = computed(() => this.translation.months(this.period()?.label ?? ""));

  private readonly userPreferences = this.store.selectSignal(AuthState.userPreferences);

  /** The monthly spending goal from the user's settings; 0 when none is set. */
  public readonly goal = computed(() => {
    const goal = Number(this.userPreferences()?.monthlySpendingGoal ?? 0);
    return goal > 0 ? goal : 0;
  });

  /** The Spent card compares with the goal only while one whole calendar month is shown. */
  public readonly spentGoal = computed(() => {
    const goal = this.goal();
    const overview = this.overview();
    const period = this.period();
    if (!(goal > 0) || !overview || !isWholeCalendarMonth(period?.from, period?.to)) {
      return undefined;
    }

    const spent = Number(overview.total);
    return { goal, over: Math.max(0, spent - goal), remaining: Math.max(0, goal - spent) };
  });

  /** The month chart splits bars at the goal; it needs a goal and a month-by-month trend. */
  public readonly goalMode = computed(() => this.goal() > 0 && this.overview()?.trendUnit === "MONTH");

  public readonly goalFraction = computed(() =>
    this.goalMode() ? goalLineFraction(this.chartBars().map((bar) => bar.total), this.goal()) : 0
  );

  /** The goal line is left out when the goal is higher than the tallest month: it would not fit the chart. */
  public readonly showGoalLine = computed(() => this.goalFraction() > 0 && this.goalFraction() <= 1);

  /** How full the Spent card's thin bar is: what was spent against the goal, at most all of it. */
  public readonly goalProgress = computed(() => {
    const goal = this.spentGoal();
    if (!goal) {
      return 0;
    }

    const spent = Number(this.overview()?.total ?? 0);
    return Math.min(100, Math.max(0, (spent / goal.goal) * 100));
  });

  // The goal can be set straight from the Spent card (no trip to User Settings).
  public readonly canEditGoal = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppUserPreferencesUpdate));
  public readonly editingGoal = signal(false);
  public readonly goalDraft = signal("");
  private readonly goalInput = viewChild<ElementRef<HTMLInputElement>>("goalInput");
  private savingGoal = false;

  public startEditingGoal(): void {
    const goal = this.goal();
    this.goalDraft.set(goal > 0 ? String(goal).replace(".", ",") : "");
    this.editingGoal.set(true);
  }

  public cancelEditingGoal(): void {
    this.editingGoal.set(false);
  }

  /** Saves the typed goal (Enter or leaving the field); empty or 0 removes it. */
  public saveGoal(): void {
    if (!this.editingGoal() || this.savingGoal) {
      return;
    }

    const parsed = parseInlineGoalInput(this.goalDraft());
    if (!parsed.ok) {
      this.snackbarService.error(this.translation.t("The monthly spending goal must be an amount above 0, like 1500,00."));
      return;
    }

    this.editingGoal.set(false);
    const current = this.userPreferences();
    if ((parsed.value ?? "") === (current?.monthlySpendingGoal ?? "") || (parsed.value === undefined && !(this.goal() > 0))) {
      return;
    }

    // The update replaces the whole preferences object, so everything else is sent back unchanged.
    const updated = { ...current, monthlySpendingGoal: parsed.value } as UserPreferences;
    this.savingGoal = true;
    this.userPreferencesService
      .updateUserPreferences(updated)
      .pipe(
        take(1),
        tap((saved) => {
          this.store.dispatch(new SetUserPreferences(saved));
          this.snackbarService.success(parsed.value ? marker("Monthly goal saved") : marker("Monthly goal removed"));
        }),
        catchError(() => of(undefined))
      )
      .subscribe({ complete: () => (this.savingGoal = false) });
  }

  private readonly groups = this.store.selectSignal(GroupState.groups);

  public readonly groupName = computed(
    () => this.groups().find((group) => group.id === this.groupId())?.name ?? ""
  );

  private readonly request = computed(() => {
    const period = this.period();
    return period ? { groupId: this.groupId(), from: period.from, to: period.to } : undefined;
  });

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

  /** The receipts panel lists six receipts, or twelve when it is made taller. */
  private readonly receiptsRequest = computed(() => {
    const request = this.request();
    return request ? { ...request, pageSize: RECENT_RECEIPT_COUNT * this.receiptsPanelRows() } : undefined;
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

  /** Unhealthy tile (Phase 3 D2): what the period's products rated unhealthy cost, and their share. */
  public readonly unhealthyTotal = computed(() => Number(this.overview()?.unhealthyTotal ?? 0));

  public readonly unhealthyShare = computed(() => {
    const total = Number(this.overview()?.total ?? 0);
    return total > 0 ? Math.round((this.unhealthyTotal() / total) * 100) : 0;
  });

  /** Unplanned tile (Phase 3 D1): what was bought that was not on the shopping list. */
  public readonly unplannedTotal = computed(() => Number(this.overview()?.unplannedTotal ?? 0));

  public readonly segments = computed(() => buildDonutSegments(this.overview()?.categories ?? []));

  /** The category the user focused (click a slice or a legend dot); it stays until clicked again. */
  public readonly focusedSegment = signal<string | null>(null);

  /** The category under the pointer (or keyboard focus), on the ring or in the legend. */
  public readonly hoveredSegment = signal<string | null>(null);

  /** What the ring and the legend emphasise: the hovered category, else the focused one. */
  public readonly activeSegment = computed(() => this.hoveredSegment() ?? this.focusedSegment());

  public isDimmed(name: string): boolean {
    const active = this.activeSegment();
    return active !== null && active !== name;
  }

  public toggleFocus(name: string): void {
    this.focusedSegment.update((focused) => (focused === name ? null : name));
  }

  public hoverSegment(name: string | null): void {
    this.hoveredSegment.set(name);
  }

  /** The drawn donut, kept from its chart events so a legend hover can emphasise a slice without a redraw. */
  private donutElement?: HTMLElement;

  public readonly bars = computed(() => {
    const overview = this.overview();
    return overview
      ? buildTrendBars(
          overview.trend ?? [],
          overview.trendUnit ?? "MONTH",
          overview.from ?? "",
          overview.to ?? "",
          this.goalMode() ? this.goal() : 0
        )
      : [];
  });

  public readonly isDailyTrend = computed(() => this.overview()?.trendUnit === "DAY");

  public readonly averageBar = computed(() => {
    const bars = this.chartBars();
    return bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.total, 0) / bars.length : 0;
  });

  /** Up to a year of months is drawn; a longer custom range is offered as a report instead. */
  public readonly rangeTooLongForChart = computed(() => {
    const period = this.period();
    return !!period && !this.isDailyTrend() && exceedsOneYear(period.from, period.to);
  });

  /** The bars drawn: at most the latest 12 months. */
  public readonly chartBars = computed(() => {
    const bars = this.bars();
    return !this.isDailyTrend() && bars.length > MAX_CHART_MONTHS ? bars.slice(-MAX_CHART_MONTHS) : bars;
  });

  /** Seven or more columns get narrower bars and smaller labels so a year fits the card. */
  public readonly denseChart = computed(() => this.chartBars().length > 6);

  public readonly exporting = signal(false);

  /** Months over the goal, for the legend under the chart (the red part of a bar). */
  public readonly overGoalBars = computed(() =>
    this.goalMode() ? this.chartBars().filter((bar) => (bar.overAmount ?? 0) > 0) : []
  );

  /**
   * The category donut (ApexCharts on the theme tokens); the total, or the focused category, sits in its middle. Hover
   * is not part of the options: it is applied to the drawn SVG (`applySliceEmphasis`), so it never redraws the chart.
   */
  public readonly donutOptions = (colors: ChartColors): ApexOptions => {
    const segments = this.segments();
    const { label: centerLabel, value: centerValue } = this.centerText(this.focusedSegment());
    return {
      chart: {
        type: "donut",
        height: 200,
        width: 200,
        background: "transparent",
        fontFamily: "inherit",
        animations: { speed: 400 },
        events: {
          mounted: (chart: ChartContext) => this.keepDonut(chart),
          updated: (chart: ChartContext) => this.keepDonut(chart),
          // The slices only have their final shape once the entry animation ends, so the grown slice's origin is set again.
          animationEnd: (chart: ChartContext) => this.keepDonut(chart),
          dataPointSelection: (_event: unknown, _chart: unknown, config: { dataPointIndex: number }) => {
            const segment = this.segments()[config.dataPointIndex];
            if (segment) {
              this.toggleFocus(segment.name);
            }
          },
          dataPointMouseEnter: (_event: unknown, _chart: unknown, config: { dataPointIndex: number }) =>
            this.hoverSegment(this.segments()[config.dataPointIndex]?.name ?? null),
          dataPointMouseLeave: () => this.hoverSegment(null),
        },
      },
      series: segments.map((segment) => segment.total),
      // ApexCharts writes the hovered slice's label into the middle itself, so the labels are the translated names.
      labels: segments.map((segment) => this.translation.t(segment.name)),
      colors: segments.map((_segment, index) => colors.series[index % colors.series.length]),
      stroke: { width: 3, colors: [colors.card] },
      legend: { show: false },
      dataLabels: { enabled: false },
      states: { hover: { filter: { type: "none" } }, active: { filter: { type: "none" } } },
      tooltip: {
        custom: ({ seriesIndex }: { seriesIndex: number }) => {
          const segment = segments[seriesIndex];
          if (!segment) {
            return "";
          }
          const color = colors.series[seriesIndex % colors.series.length];
          return this.tooltipCard(this.translation.t(segment.name), [
            { color, label: this.translation.t("Spent"), value: this.displayCurrencyService.format(segment.total) },
            { color, label: this.translation.t("Share of total"), value: segment.share },
          ]);
        },
      },
      plotOptions: {
        pie: {
          expandOnClick: false,
          // Room inside the chart box for the active slice to grow (DONUT_POP_OUT_SCALE) without being clipped.
          customScale: 0.92,
          donut: {
            size: "76%",
            labels: {
              show: true,
              name: { show: true, color: colors.mutedForeground, fontSize: "12px", offsetY: 22 },
              value: { show: true, color: colors.foreground, fontSize: "20px", fontWeight: 600, offsetY: -14, formatter: (value: string) => this.displayCurrencyService.format(Number(value)) },
              total: { show: true, showAlways: true, label: centerLabel, color: colors.mutedForeground, fontSize: "12px", formatter: () => centerValue },
            },
          },
        },
      },
    };
  };

  /** The ring's middle: the category's name and total, or the period and its total when none is given. */
  private centerText(name: string | null): { label: string; value: string } {
    const segment = this.segments().find((candidate) => candidate.name === name);
    return {
      label: this.fitCenterLabel(segment ? this.translation.t(segment.name) : this.periodLabel()),
      value: this.displayCurrencyService.format(segment ? segment.total : this.overview()?.total ?? 0),
    };
  }

  /** The ring's middle is about 130 px wide: a long date range reads "Total", a long category name is cut. */
  private fitCenterLabel(text: string): string {
    if (text.length <= DONUT_CENTER_LABEL_MAX) {
      return text;
    }
    return text.includes(" – ") ? this.translation.t(marker("Total")) : `${text.slice(0, DONUT_CENTER_LABEL_MAX - 1)}…`;
  }

  private keepDonut(chart: ChartContext): void {
    this.donutElement = chart?.el;    this.applySliceEmphasis();
  }

  /**
   * Emphasises the active category on the drawn SVG: its slice grows out from the ring's center, the other slices go
   * faint, and the middle names it. Done on the SVG (ApexCharts has no option for a programmatic pop-out) after every
   * render and whenever the active category changes, so hovering the legend or the ring never redraws the chart. The
   * ring is drawn smaller (customScale) so the grown slice stays inside the chart box.
   */
  private applySliceEmphasis(): void {
    const container = this.donutElement;
    if (!container?.isConnected) {
      return;
    }

    const segments = this.segments();
    const active = this.activeSegment();
    const activeIndex = segments.findIndex((segment) => segment.name === active);
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = Array.from(container.querySelectorAll<SVGPathElement>("path.apexcharts-pie-area"));
    const center = ringCenter(paths);
    for (const path of paths) {
      const match = /apexcharts-(?:donut|pie)-slice-(\d+)/.exec(path.getAttribute("class") ?? "");
      const index = match ? Number(match[1]) : -1;
      const grown = activeIndex >= 0 && index === activeIndex;
      const box = typeof path.getBBox === "function" ? path.getBBox() : undefined;
      if (center && box) {
        // fill-box puts the origin in the slice's own box, so the ring's center is given relative to it.
        path.style.transformBox = "fill-box";
        path.style.transformOrigin = `${center.x - box.x}px ${center.y - box.y}px`;
      }
      path.style.transition = calm ? "none" : "transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease";
      path.style.transform = grown ? `scale(${DONUT_POP_OUT_SCALE})` : "scale(1)";
      path.style.opacity = activeIndex >= 0 && !grown ? String(DONUT_DIMMED_OPACITY) : "1";
    }

    // ApexCharts writes the hovered slice into the middle itself; a legend hover and a cleared hover need it here.
    const text = this.centerText(active);
    const label = container.querySelector(".apexcharts-datalabel-label");
    const value = container.querySelector(".apexcharts-datalabel-value");
    if (label && value) {
      label.textContent = text.label;
      value.textContent = text.value;
    }
  }

  /** The spending bars: black in the light theme, white in the dark one (the primary token), red above the goal. */
  public readonly barsOptions = (colors: ChartColors): ApexOptions => {
    const bars = this.chartBars();
    const goalMode = this.goalMode();
    const faded = colors.mutedForeground.startsWith("rgb(") ? colors.mutedForeground.replace("rgb(", "rgba(").replace(")", ", 0.35)") : colors.mutedForeground;
    const money = (value: number) => this.displayCurrencyService.format(value);
    return {
      chart: {
        type: "bar",
        height: "100%",
        stacked: true,
        toolbar: { show: false },
        zoom: { enabled: false },
        background: "transparent",
        fontFamily: "inherit",
        animations: { speed: 500 },
      },
      series: goalMode
        ? [
            { name: "Spent", data: bars.map((bar) => bar.baseAmount ?? 0) },
            { name: "Over goal", data: bars.map((bar) => bar.overAmount ?? 0) },
          ]
        : [{ name: "Spent", data: bars.map((bar) => bar.total) }],
      colors: goalMode
        ? [({ dataPointIndex }: { dataPointIndex: number }) => (bars[dataPointIndex]?.isSelected ? colors.primary : faded), colors.destructive]
        : [({ dataPointIndex }: { dataPointIndex: number }) => (bars[dataPointIndex]?.isSelected ? colors.primary : faded)],
      plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: "end", borderRadiusWhenStacked: "last", columnWidth: bars.length > 6 ? "55%" : "38%" } },
      dataLabels: { enabled: false },
      stroke: { show: false },
      grid: { borderColor: colors.border, strokeDashArray: 3, padding: { left: 8, right: 8 }, xaxis: { lines: { show: false } } },
      xaxis: {
        categories: bars.map((bar) => this.translation.months(bar.shortName)),
        axisBorder: { color: colors.border },
        axisTicks: { show: false },
        labels: { style: { colors: colors.mutedForeground, fontSize: "12px" } },
      },
      yaxis: { labels: { style: { colors: colors.mutedForeground, fontSize: "11px" }, formatter: (value: number) => money(value) } },
      legend: { show: false },
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
          const bar = bars[dataPointIndex];
          if (!bar) {
            return "";
          }
          const rows = [{ color: colors.primary, label: this.translation.t("Spent"), value: money(bar.total) }];
          if (goalMode && (bar.overAmount ?? 0) > 0) {
            rows.push({ color: colors.destructive, label: this.translation.t("Over goal"), value: money(bar.overAmount ?? 0) });
          }
          return this.tooltipCard(this.barHeading(bar.key, bar.shortName), rows);
        },
      },
      annotations:
        goalMode && this.showGoalLine()
          ? { yaxis: [{ y: this.goal(), borderColor: colors.mutedForeground, strokeDashArray: 5, label: { text: marker("Goal"), position: "left", borderColor: "transparent", style: { color: colors.mutedForeground, background: "transparent", fontSize: "10px" } } }] }
          : {},
    };
  };

  /** The floating tooltip: a small card on the theme tokens, a heading and one row per figure (the Flowbite look). */
  /** "October 2026" for a month bar, "21 October 2026" for a day bar. */
  private barHeading(key: string, fallback: string): string {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month) {
      return fallback;
    }
    const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" });
    return this.translation.months(day ? `${day} ${monthName} ${year}` : `${monthName} ${year}`);
  }

  private tooltipCard(heading: string, rows: { color: string; label: string; value: string }[]): string {
    const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
    const body = rows
      .map(
        (row) =>
          `<div class="flex items-center gap-2 px-3 py-1.5"><span class="size-2.5 rounded-full" style="background:${row.color}"></span><span class="text-muted-foreground">${escape(row.label)}</span><span class="ml-auto pl-4 font-semibold tabular-nums">${escape(row.value)}</span></div>`
      )
      .join("");
    return `<div class="min-w-40 overflow-hidden rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-lg"><div class="border-b border-border bg-muted px-3 py-1.5 font-semibold">${escape(heading)}</div>${body}</div>`;
  }

  /** Month totals for the whole period, fetched a calendar year at a time. */
  private async loadYears(): Promise<{ label: string; from: string; to: string; overview: GroupOverview }[]> {
    const period = this.period();
    if (!period) {
      return [];
    }

    return Promise.all(
      splitIntoYears(period.from, period.to).map(async (chunk) => ({
        ...chunk,
        overview: await firstValueFrom(this.overviewService.getGroupOverview(this.groupId(), undefined, chunk.from, chunk.to)),
      }))
    );
  }

  /** The months of one year chunk, every month listed (empty ones as 0). */
  private monthTotals(chunk: { from: string; to: string; overview: GroupOverview }): { month: string; total: number }[] {
    // A chunk under four weeks comes back as days; either way the totals are gathered by "yyyy-MM". Months
    // at the edge of a range are whole months.
    const totals = new Map<string, number>();
    for (const point of chunk.overview.trend ?? []) {
      const month = point.month.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + Number(point.total));
    }
    return monthKeysBetween(chunk.from, chunk.to).map((month) => ({ month, total: totals.get(month) ?? 0 }));
  }

  /** "Month, Total Spent, Goal, Difference" for the whole range, straight to a file. */
  public async exportCsv(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      const years = await this.loadYears();
      const rows = years.flatMap((year) => this.monthTotals(year));
      downloadFile(
        new Blob([buildMonthlyCsv(rows, this.goal())], { type: "text/csv;charset=utf-8" }),
        `spending-${this.period()?.from}-${this.period()?.to}.csv`
      );
    } catch {
      this.snackbarService.error("The export could not be made. Try again.");
    } finally {
      this.exporting.set(false);
    }
  }

  /** A print view, one calendar year per landscape page; the browser's print dialog saves it as a PDF. */
  public async exportPdf(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    // Opened now, in the click, because a window opened after the requests finish is taken for a pop-up.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.snackbarService.error("Allow pop-ups for this site to print the report.");
      return;
    }
    printWindow.document.write("<p style=\"font-family:system-ui\">Preparing the report…</p>");

    this.exporting.set(true);
    try {
      const years = await this.loadYears();
      const printYears: PrintYear[] = years.map((year) => ({
        label: year.label,
        total: this.customCurrencyPipe.transform(year.overview.total),
        months: this.monthTotals(year).map((month) => ({
          name: shortMonthName(month.month),
          total: month.total,
          text: this.customCurrencyPipe.transform(month.total),
        })),
        categories: (year.overview.categories ?? []).map((category) => ({
          name: category.name,
          total: this.customCurrencyPipe.transform(category.total),
        })),
      }));

      const html = buildPrintHtml(marker("Spending by year"), this.periodLabel(), printYears);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch {
      printWindow.close();
      this.snackbarService.error("The report could not be made. Try again.");
    } finally {
      this.exporting.set(false);
    }
  }

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

  private readonly hasAiPoweredReceipts = this.store.selectSignal(FeatureConfigState.hasFeature("aiPoweredReceipts"));

  public readonly canQuickScan = computed(
    () =>
      this.hasAiPoweredReceipts() &&
      hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsQuickScan)
  );

  /** The shopping list group: this group when readable, otherwise the user's first readable one. */
  public readonly shoppingListGroupId = this.store.selectSignal(ShoppingListState.targetGroupId);

  public readonly canCreateList = computed(() => {
    const listGroupId = this.shoppingListGroupId();
    return (
      listGroupId !== undefined &&
      hasAll(this.groupPermissions()[listGroupId] ?? [], Permission.GroupShoppingListsCreate)
    );
  });

  /** Where "New list" goes, as the string segments app-button takes. */
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
    const ids = ["spent", "receipts", "unhealthy", "unplanned", "categories", "trend", "recentReceipts"];
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
   * A panel's width is exactly its share of a row (span of the grid's columns, less its part of the gaps). Panels never
   * stretch, so the size set in the editor is the size drawn and a row may end with empty space.
   */
  public panelFlex(panel: ResolvedPanel): string {
    const columns = this.gridColumns();
    return `0 0 calc(${panel.span} / ${columns} * 100% - ${(PANEL_GAP_PX * (columns - panel.span)) / columns}px)`;
  }

  /** The panels in the order drawn: while one is dragged, the order it would have if dropped now. */
  public readonly displayPanels = computed(() => {
    const order = this.dragOrder();
    const panels = this.panels();
    return order ? order.map((id) => panels.find((panel) => panel.id === id) as ResolvedPanel).filter(Boolean) : panels;
  });

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
    const hit = sizeLimitHit(id, size);
    if (hit) {
      this.notifyLimit(id, hit.limit);
      return false;
    }
    this.editLayout((layout) => resizePanel(layout, id, size));
    return true;
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

    this.draggingId.set(panel.id);
    this.dragOrder.set(original);

    const place = () => {
      // The panel's own slot is where it would sit untransformed, so the drag follows the pointer across reflows.
      const rect = element.getBoundingClientRect();
      const slotLeft = rect.left - translateX;
      const slotTop = rect.top - translateY;
      translateX = pointer.x - grabX - slotLeft;
      translateY = pointer.y - grabY - slotTop;
      element.style.transform = `translate(${translateX}px, ${translateY}px)`;

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
      this.dragOrder.set(undefined);
      this.draggingId.set(undefined);
      if (commit && order) {
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
      const hit = sizeLimitHit(panel.id, { cols, rows });
      if (hit) {
        if (!atLimit) {
          atLimit = true;
          this.notifyLimit(panel.id, hit.limit);
        }
        // Keep what still fits: a diagonal drag past the width limit can still change the height.
        const definition = panelDefinition(panel.id);
        if (definition) {
          this.editLayout((layout) =>
            resizePanel(layout, panel.id, {
              cols: Math.min(definition.maxCols, Math.max(definition.minCols, cols)),
              rows: Math.min(definition.maxRows, Math.max(1, rows)),
            })
          );
        }
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

    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = marker("Discard changes");
    dialogRef.componentInstance.dialogContent = this.translation.t("Leave without saving your dashboard changes?");
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
    private matDialog: AppDialog,
    private userPreferencesService: UserPreferencesService,
    private snackbarService: SnackbarService,
    private customCurrencyPipe: CustomCurrencyPipe,
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

    // Imperative side effect: a goal editor that just opened takes the keyboard, with its text selected.
    effect(() => {
      const input = this.goalInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });

    // Imperative side effect: emphasise the active donut slice on the drawn SVG (hover never redraws the chart).
    effect(() => {
      this.activeSegment();
      this.segments();
      untracked(() => this.applySliceEmphasis());
    });

    // Imperative side effect: keep the shopping list store on the group the card describes.
    effect(() => {
      const groupId = this.shoppingListGroupId();
      if (groupId !== undefined) {
        untracked(() => this.store.dispatch(new LoadShoppingLists(groupId)));
      }
    });
  }

  /** Opens the products behind the Unhealthy or Unplanned tile. */
  public openProducts(kind: "UNHEALTHY" | "UNPLANNED"): void {
    this.openDetail(kind, kind === "UNHEALTHY" ? marker("Unhealthy products") : marker("Products not on the list"));
  }

  /** Opens the product lines of one category slice (the split is by line, by category id when there is one). */
  public openCategory(segment: DonutSegment): void {
    if (!this.isOpenable(segment)) {
      return;
    }
    this.openDetail("FOODGROUP", segment.name, {
      foodGroup: segment.name === UNCATEGORIZED ? "" : segment.name,
      ...(segment.categoryId !== undefined ? { categoryId: segment.categoryId } : {}),
    });
  }

  /** Opens the product lines behind a tag tile. */
  public openTag(tile: { tagId: number; name: string }): void {
    this.openDetail("TAG", tile.name, { tagId: tile.tagId });
  }

  /** "Other" folds several groups together, so there is no single list behind it. */
  public isOpenable(segment: DonutSegment): boolean {
    return segment.name !== OTHER_SEGMENT;
  }

  public openQuickScan(): void {
    openQuickScanDialog(this.matDialog).pipe(take(1)).subscribe();
  }

  /** Checks a product's barcode on Open Food Facts; see src/product-check. */
  public scanProduct(): void {
    this.productCheck.start();
  }

  private openDetail(
    kind: OverviewDetailKind,
    title: string,
    filter: Pick<OverviewDetailDialogData, "categoryId" | "foodGroup" | "tagId"> = {}
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
    this.matDialog.open(OverviewDetailDialogComponent, { ...DEFAULT_DIALOG_CONFIG, data });
  }
}
