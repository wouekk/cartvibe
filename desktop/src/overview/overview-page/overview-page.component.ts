import { CurrencyPipe } from "@angular/common";
import { Component, computed, effect, ElementRef, signal, untracked, viewChild } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { Store } from "@ngxs/store";
import type { ApexOptions } from "apexcharts";

/** The ApexCharts instance handed to chart events; only its container is used here. */
type ChartContext = { el?: HTMLElement };

/** How far the focused donut slice pops out, in pixels. */
const DONUT_POP_OUT_PX = 7;
import { catchError, firstValueFrom, map, of, switchMap, take, tap } from "rxjs";
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
import { ViewportService } from "../../services/viewport.service";
import { ChartColors } from "../../shared-ui/apex-chart/chart-colors";
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
  donutSliceOffset,
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

const RECENT_RECEIPT_COUNT = 6;

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

  public readonly recentReceipts = toSignal(
    toObservable(this.request).pipe(
      switchMap((request) =>
        request
          ? this.receiptService
              .getReceiptsForGroup(request.groupId, {
                page: 1,
                pageSize: RECENT_RECEIPT_COUNT,
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

  /** The category the user focused (click a slice or a legend dot); the others dim and the ring's middle shows it. */
  public readonly focusedSegment = signal<string | null>(null);

  public isDimmed(name: string): boolean {
    const focused = this.focusedSegment();
    return focused !== null && focused !== name;
  }

  public toggleFocus(name: string): void {
    this.focusedSegment.update((focused) => (focused === name ? null : name));
  }

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

  /** The category donut (ApexCharts on the theme tokens); the total, or the focused category, sits in its middle. */
  public readonly donutOptions = (colors: ChartColors): ApexOptions => {
    const segments = this.segments();
    const focusedName = this.focusedSegment();
    const focused = segments.find((segment) => segment.name === focusedName);
    const centerLabel = focused ? this.translation.t(focused.name) : this.periodLabel();
    const centerValue = this.displayCurrencyService.format(focused ? focused.total : this.overview()?.total ?? 0);
    return {
      chart: {
        type: "donut",
        height: 200,
        width: 200,
        background: "transparent",
        fontFamily: "inherit",
        animations: { speed: 400 },
        events: {
          mounted: (chart: ChartContext) => this.popFocusedSlice(chart),
          updated: (chart: ChartContext) => this.popFocusedSlice(chart),
          dataPointSelection: (_event: unknown, _chart: unknown, config: { dataPointIndex: number }) => {
            const segment = this.segments()[config.dataPointIndex];
            if (segment) {
              this.toggleFocus(segment.name);
            }
          },
        },
      },
      series: segments.map((segment) => segment.total),
      labels: segments.map((segment) => segment.name),
      colors: segments.map((_segment, index) => colors.series[index % colors.series.length]),
      fill: { opacity: segments.map((segment) => (focusedName !== null && segment.name !== focusedName ? 0.22 : 1)) },
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
          donut: {
            size: "76%",
            labels: {
              show: true,
              name: { show: true, color: colors.mutedForeground, fontSize: "12px", offsetY: 18 },
              value: { show: true, color: colors.foreground, fontSize: "20px", fontWeight: 600, offsetY: -14, formatter: () => centerValue },
              total: { show: true, showAlways: true, label: centerLabel, color: colors.mutedForeground, fontSize: "12px", formatter: () => centerValue },
            },
          },
        },
      },
    };
  };

  /**
   * Pushes the focused slice out along its middle by a few pixels (it settles back when focus is cleared). Done on the
   * drawn SVG after every render, since ApexCharts has no option for a programmatic pop-out; the donut is drawn
   * smaller (customScale) so the slice stays inside the chart box and so inside the panel.
   */
  private popFocusedSlice(chart: ChartContext): void {
    const container: HTMLElement | undefined = chart?.el;
    if (!container) {
      return;
    }

    const segments = this.segments();
    const focusedIndex = segments.findIndex((segment) => segment.name === this.focusedSegment());
    const offset = focusedIndex >= 0 ? donutSliceOffset(segments.map((segment) => segment.total), focusedIndex, DONUT_POP_OUT_PX) : { x: 0, y: 0 };
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    container.querySelectorAll<SVGPathElement>("path.apexcharts-pie-area").forEach((path) => {
      const match = /apexcharts-(?:donut|pie)-slice-(d+)/.exec(path.getAttribute("class") ?? "");
      const pushed = match !== null && Number(match[1]) === focusedIndex;
      path.style.transition = calm ? "none" : "transform 180ms ease-out";
      path.style.transform = pushed ? `translate(${offset.x}px, ${offset.y}px)` : "translate(0, 0)";
    });
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

  /** On a phone the shopping panel leads the page; on larger screens it sits beside the receipts. */
  public readonly isHandset = this.viewportService.isHandset;

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
    private viewportService: ViewportService
  ) {
    // Imperative side effect: a goal editor that just opened takes the keyboard, with its text selected.
    effect(() => {
      const input = this.goalInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
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

  /** Opens the products of one food group (the category split is by product, Phase 3 3c). */
  public openCategory(segment: DonutSegment): void {
    if (!this.isOpenable(segment)) {
      return;
    }
    this.openDetail("FOODGROUP", segment.name, segment.name === UNCATEGORIZED ? "" : segment.name);
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

  private openDetail(kind: OverviewDetailKind, title: string, foodGroup?: string): void {
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
      foodGroup,
    };
    this.matDialog.open(OverviewDetailDialogComponent, { ...DEFAULT_DIALOG_CONFIG, data });
  }
}
