import { Component, computed, effect, signal, untracked } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, map, of, switchMap, take } from "rxjs";
import {
  FilterOperation,
  GroupOverview,
  OverviewService,
  Permission,
  Receipt,
  ReceiptService,
  SortDirection,
} from "../../open-api";
import { openQuickScanDialog } from "../../receipts/quick-scan-dialog/open-quick-scan-dialog";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { AuthState, FeatureConfigState, GroupState } from "../../store";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { DEFAULT_DIALOG_CONFIG } from "../../constants/dialog.constant";
import { todayInZone } from "../../utils/app-time-zone";
import { hasAll } from "../../utils/permission.utils";
import {
  buildDonutSegments,
  buildTrendBars,
  describeChangeAgainst,
  DONUT_RADIUS,
  DonutSegment,
} from "../overview-chart.utils";
import {
  OverviewDetailDialogComponent,
  OverviewDetailDialogData,
  OverviewDetailKind,
} from "../overview-detail-dialog/overview-detail-dialog.component";
import { PERIOD_CHOICES, PeriodPreset, previousLabel, resolvePeriod } from "../overview-period";

const RECENT_RECEIPT_COUNT = 6;

/** How many item names a shopping list card spells out before "and N more". */
const LIST_PREVIEW_ITEMS = 3;

/** Segments that are not one real category, so there is no receipt list to open behind them. */
const NON_CATEGORY_SEGMENTS = ["Other", "Uncategorized", "(Restricted)"];

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
  styleUrls: ["./overview-page.component.scss"],
  standalone: false,
})
export class OverviewPageComponent {
  public readonly groupId = toSignal(
    this.activatedRoute.paramMap.pipe(map((params) => Number(params.get("groupId")))),
    { requireSync: true }
  );

  public readonly timeZone = this.store.selectSignal(SystemSettingsState.timeZone);

  public readonly periodTabs: FilterTab[] = PERIOD_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
  }));

  /** The period shown: this month until the user picks another. */
  public readonly preset = signal<PeriodPreset>("THIS_MONTH");

  /** The custom range's ends, "yyyy-MM-dd", typed into the two date inputs. */
  public readonly customFrom = signal("");

  public readonly customTo = signal("");

  /** The days to ask for; undefined while a custom range is incomplete or backwards. */
  public readonly period = computed(() =>
    resolvePeriod(this.preset(), todayInZone(this.timeZone()), { from: this.customFrom(), to: this.customTo() })
  );

  public readonly periodLabel = computed(() => this.period()?.label ?? "");

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

  public readonly circleRadius = DONUT_RADIUS;

  public readonly segments = computed(() => buildDonutSegments(this.overview()?.categories ?? []));

  public readonly bars = computed(() => {
    const overview = this.overview();
    return overview ? buildTrendBars(overview.trend ?? [], overview.trendUnit ?? "MONTH", overview.from, overview.to) : [];
  });

  public readonly isDailyTrend = computed(() => this.overview()?.trendUnit === "DAY");

  public readonly averageBar = computed(() => {
    const bars = this.bars();
    return bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.total, 0) / bars.length : 0;
  });

  /** What the previous* figures are compared with: "September 2026", "2025", "5 Oct 2026 – 11 Oct 2026". */
  public readonly previousName = computed(() => {
    const overview = this.overview();
    return overview ? previousLabel(overview.previousFrom, overview.previousTo) : "";
  });

  public readonly change = computed(() => {
    const overview = this.overview();
    return overview ? describeChangeAgainst(overview.total, overview.previousTotal, this.previousName()) : undefined;
  });

  /** Spending went up, which the tile shows in the warning color. */
  public readonly changeIsIncrease = computed(() => {
    const overview = this.overview();
    return !!overview && Number(overview.total) > Number(overview.previousTotal);
  });

  public readonly unhealthyChange = computed(() => {
    const overview = this.overview();
    return overview
      ? describeChangeAgainst(overview.unhealthyTotal, overview.previousUnhealthyTotal ?? "0", this.previousName())
      : undefined;
  });

  public readonly unplannedChange = computed(() => {
    const overview = this.overview();
    return overview
      ? describeChangeAgainst(overview.unplannedTotal ?? "0", overview.previousUnplannedTotal ?? "0", this.previousName())
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

  private readonly shoppingLists = this.store.selectSignal(ShoppingListState.lists);

  private readonly loadedShoppingListGroupId = this.store.selectSignal(ShoppingListState.groupId);

  public readonly listSummaries = computed(() => {
    if (this.loadedShoppingListGroupId() !== this.shoppingListGroupId()) {
      return [];
    }

    return this.shoppingLists().map((list) => {
      const toBuy = list.items.filter((item) => !item.isChecked);
      const names = toBuy.slice(0, LIST_PREVIEW_ITEMS).map((item) => item.name);
      const more = toBuy.length - names.length;
      return {
        id: list.id,
        name: list.name,
        count: toBuy.length,
        preview: toBuy.length === 0 ? "Nothing left to buy" : names.join(", ") + (more > 0 ? `, and ${more} more` : ""),
      };
    });
  });

  public readonly itemsToBuy = computed(() => this.listSummaries().reduce((sum, list) => sum + list.count, 0));

  constructor(
    private activatedRoute: ActivatedRoute,
    private overviewService: OverviewService,
    private receiptService: ReceiptService,
    private store: Store,
    private matDialog: MatDialog
  ) {
    // Imperative side effect: keep the shopping list store on the group the card describes.
    effect(() => {
      const groupId = this.shoppingListGroupId();
      if (groupId !== undefined) {
        untracked(() => this.store.dispatch(new LoadShoppingLists(groupId)));
      }
    });
  }

  public selectPeriod(value: string): void {
    this.preset.set(value as PeriodPreset);
  }

  public setCustomDay(target: "from" | "to", event: Event): void {
    const day = (event.target as HTMLInputElement).value;
    (target === "from" ? this.customFrom : this.customTo).set(day);
  }

  /** Opens the products behind the Unhealthy or Unplanned tile. */
  public openProducts(kind: "UNHEALTHY" | "UNPLANNED"): void {
    this.openDetail(kind, kind === "UNHEALTHY" ? "Unhealthy products" : "Products not on the list");
  }

  /** Opens the receipts of one category, when the slice is a real category the caller may read. */
  public openCategory(segment: DonutSegment): void {
    const categoryId = this.categoryIdFor(segment.name);
    if (categoryId !== undefined) {
      this.openDetail("CATEGORY", segment.name, categoryId);
    }
  }

  public isOpenable(segment: DonutSegment): boolean {
    return this.categoryIdFor(segment.name) !== undefined;
  }

  public openQuickScan(): void {
    openQuickScanDialog(this.matDialog).pipe(take(1)).subscribe();
  }

  private categoryIdFor(name: string): number | undefined {
    if (NON_CATEGORY_SEGMENTS.includes(name)) {
      return undefined;
    }

    return this.store.selectSnapshot(AuthState.groupCategories(this.groupId()))?.find((category) => category.name === name)?.id;
  }

  private openDetail(kind: OverviewDetailKind, title: string, categoryId?: number): void {
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
      categoryId,
    };
    this.matDialog.open(OverviewDetailDialogComponent, { ...DEFAULT_DIALOG_CONFIG, data });
  }
}
