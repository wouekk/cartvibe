import { Component, computed, effect, linkedSignal, untracked } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, map, of, switchMap } from "rxjs";
import {
  FilterOperation,
  GroupOverview,
  OverviewService,
  Permission,
  Receipt,
  ReceiptService,
  SortDirection,
  UserService,
} from "../../open-api";
import { AuthState, GroupState } from "../../store";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { todayInZone } from "../../utils/app-time-zone";
import { hasAll } from "../../utils/permission.utils";
import { FilterMonth } from "../../utils/receipt-date-filter";
import {
  buildDonutSegments,
  buildMonthBars,
  describeChange,
  DONUT_RADIUS,
  formatMonthLabel,
  monthDayRange,
  netOwed,
  previousMonthOf,
  toMonthKey,
} from "../overview-chart.utils";

const RECENT_RECEIPT_COUNT = 6;

/** How many item names a shopping list card spells out before "and N more". */
const LIST_PREVIEW_ITEMS = 3;

/**
 * The landing page: a month at a glance for the selected group — spend and its change, receipts
 * still open, who owes whom, what is left to buy, spend by category, the six-month trend, and the
 * month's latest receipts. Each card loads independently, so one failing request blanks only itself.
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

  /** The month shown: this month in the app time zone, until the user steps away from it. */
  public readonly month = linkedSignal<FilterMonth>(() => {
    const today = todayInZone(this.timeZone());
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  public readonly monthLabel = computed(() => formatMonthLabel(this.month()));

  private readonly groups = this.store.selectSignal(GroupState.groups);

  public readonly groupName = computed(
    () => this.groups().find((group) => group.id === this.groupId())?.name ?? ""
  );

  private readonly request = computed(() => ({ groupId: this.groupId(), month: this.month() }));

  public readonly overview = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ groupId, month }) =>
        this.overviewService.getGroupOverview(groupId, toMonthKey(month)).pipe(
          catchError(() => of(null))
        )
      )
    ),
    { initialValue: undefined as GroupOverview | null | undefined }
  );

  public readonly recentReceipts = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ groupId, month }) =>
        this.receiptService
          .getReceiptsForGroup(groupId, {
            page: 1,
            pageSize: RECENT_RECEIPT_COUNT,
            orderBy: "date",
            sortDirection: SortDirection.Desc,
            filter: { date: { operation: FilterOperation.Between, value: monthDayRange(month) } },
          })
          .pipe(
            // The generated item type is a merge of every paged model, so it needs an explicit narrowing.
            map((page) => page.data as unknown as Receipt[]),
            catchError(() => of([] as Receipt[]))
          )
      )
    ),
    { initialValue: [] as Receipt[] }
  );

  /** Positive: others owe the user. Undefined until loaded, or when it could not be. */
  public readonly netOwed = toSignal(
    toObservable(this.groupId).pipe(
      switchMap((groupId) =>
        this.userService.getAmountOwedForUser(groupId).pipe(
          map((amountOwed) => netOwed(amountOwed)),
          catchError(() => of(undefined))
        )
      )
    ),
    { initialValue: undefined as number | undefined }
  );

  public readonly circleRadius = DONUT_RADIUS;

  public readonly segments = computed(() => buildDonutSegments(this.overview()?.categories ?? []));

  public readonly bars = computed(() => {
    const overview = this.overview();
    return overview ? buildMonthBars(overview.months, overview.month) : [];
  });

  public readonly averageMonth = computed(() => {
    const bars = this.bars();
    return bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.total, 0) / bars.length : 0;
  });

  public readonly change = computed(() => {
    const overview = this.overview();
    return overview ? describeChange(overview.total, overview.previousTotal, previousMonthOf(this.month())) : undefined;
  });

  /** Spending went up, which the tile shows in the warning color. */
  public readonly changeIsIncrease = computed(() => {
    const overview = this.overview();
    return !!overview && Number(overview.total) > Number(overview.previousTotal);
  });

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  public readonly canAddReceipt = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsCreate)
  );

  /** The shopping list group: this group when readable, otherwise the user's first readable one. */
  public readonly shoppingListGroupId = this.store.selectSignal(ShoppingListState.targetGroupId);

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
    private userService: UserService
  ) {
    // Imperative side effect: keep the shopping list store on the group the card describes.
    effect(() => {
      const groupId = this.shoppingListGroupId();
      if (groupId !== undefined) {
        untracked(() => this.store.dispatch(new LoadShoppingLists(groupId)));
      }
    });
  }

  public selectMonth(month: FilterMonth): void {
    this.month.set(month);
  }
}
