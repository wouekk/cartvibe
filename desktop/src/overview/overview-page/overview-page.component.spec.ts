import { SnackbarService } from "../../services";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { ProductCheckLauncher } from "../../product-check/product-check-launcher.service";
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox";
import { DisplayCurrencyPipe } from "../../pipes/display-currency.pipe";
import { ChartComponent } from "../../shared-ui/chart/chart.component";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { ShopMonogramComponent } from "../../shared-ui/shop-monogram/shop-monogram.component";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from "@angular/router";
import { parseLayout } from "../dashboard-layout/dashboard-layout";
import { DashboardLayoutStore } from "../dashboard-layout/dashboard-layout.store";
import { NgxsModule, Store } from "@ngxs/store";
import { BehaviorSubject, of, Subject } from "rxjs";
import {
  DashboardLayoutService,
  GroupOverview,
  OverviewService,
  Permission,
  ReceiptService,
  ShoppingListService,
  UserPreferences,
} from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { AuthState } from "../../store/auth.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetFeatureConfig } from "../../store/feature-config.state.actions";
import { SetPermissions, SetUserPreferences } from "../../store/auth.state.actions";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { UserState } from "../../store/user.state";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { todayInZone } from "../../utils/app-time-zone";
import { toDayKey } from "../overview-period";
import { OverviewPageComponent } from "./overview-page.component";

import type { Mock } from "vitest";
import type { ChartConfiguration } from "chart.js";
const overview = (from: string, to: string): GroupOverview => ({
  month: from.slice(0, 7),
  from,
  to,
  previousFrom: "2026-09-01",
  previousTo: "2026-09-30",
  total: "92",
  previousTotal: "100",
  receiptCount: 3,
  previousReceiptCount: 2,
  openReceiptCount: 1,
  unhealthyTotal: "23",
  previousUnhealthyTotal: "10",
  unplannedTotal: "9.5",
  previousUnplannedTotal: "0",
  categories: [{ name: "Groceries", total: "92" }],
  months: [],
  trend: [
    { month: "2026-09", total: "100" },
    { month: from.slice(0, 7), total: "92" },
  ],
  trendUnit: "MONTH",
});

const CHART_COLORS = {
  foreground: "rgb(0, 0, 0)",
  mutedForeground: "rgb(100, 100, 100)",
  border: "rgb(220, 220, 220)",
  muted: "rgb(240, 240, 240)",
  card: "rgb(255, 255, 255)",
  primary: "rgb(10, 10, 10)",
  destructive: "rgb(220, 38, 38)",
  series: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)", "rgb(6, 6, 6)"],
};

describe("OverviewPageComponent", () => {
  let fixture: ComponentFixture<OverviewPageComponent>;
  let component: OverviewPageComponent;
  let overviewService: { getGroupOverview: Mock };
  let receiptService: { getReceiptsForGroup: Mock };
  const params = new BehaviorSubject(convertToParamMap({ groupId: "1" }));
  let routeData: BehaviorSubject<Record<string, unknown>>;
  let dashboardLayoutService: { getDashboardLayout: Mock; updateDashboardLayout: Mock };

  const text = (testId: string): string =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";

  const thisMonth = (): { from: string; to: string } => {
    const today = todayInZone(TestBed.inject(Store).selectSnapshot(SystemSettingsState.timeZone));
    return {
      from: toDayKey(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDayKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  };

  beforeEach(async () => {
    overviewService = {
      getGroupOverview: vi.fn((_groupId: number, _month: string, from: string, to: string) => of(overview(from, to))),
    };
    receiptService = { getReceiptsForGroup: vi.fn(() => of({ data: [], totalCount: 0 })) };
    routeData = new BehaviorSubject<Record<string, unknown>>({});
    dashboardLayoutService = {
      getDashboardLayout: vi.fn(() => of({ userId: 1, layout: "", canCustomise: true })),
      updateDashboardLayout: vi.fn((command: { layout: string }) => of({ userId: 1, layout: command.layout, canCustomise: true })),
    };

    await TestBed.configureTestingModule({
      declarations: [OverviewPageComponent],
      imports: [ChartComponent, TranslatePipe, NgxsModule.forRoot([AuthState, FeatureConfigState, GroupState, ShoppingListState, SystemSettingsState, UserState]), PipesModule, SharedUiModule, MoneyComponent, ShopMonogramComponent, DisplayCurrencyPipe, ...HlmCheckboxImports],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params, data: routeData, snapshot: { get data() { return routeData.value; } } } },
        { provide: DashboardLayoutService, useValue: dashboardLayoutService },
        { provide: OverviewService, useValue: overviewService },
        { provide: ReceiptService, useValue: receiptService },
        { provide: ShoppingListService, useValue: { getShoppingListsForGroup: vi.fn(() => of([])) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.inject(Store).dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead] }));
    fixture = TestBed.createComponent(OverviewPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("starts the product checker from the Check product button", () => {
    const start = vi.spyOn(TestBed.inject(ProductCheckLauncher), "start").mockImplementation(() => undefined);

    component.scanProduct();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("starts on this month, asks for its first and last day, and fills the tiles", () => {
    const { from, to } = thisMonth();

    expect(overviewService.getGroupOverview).toHaveBeenCalledWith(1, undefined, from, to);
    expect(text("overview-tile-receipts")).toContain("3");
    expect(text("overview-tile-receipts")).toContain("1 to check");
    expect(text("overview-tile-spent")).toContain("8% less than September 2026");
    expect(text("overview-tile-unhealthy")).toContain("25% of");
    expect(text("overview-tile-unplanned")).toContain("9.5");
  });

  it("shows no warning in a period without unhealthy products", async () => {
    overviewService.getGroupOverview.mockImplementation((_groupId: number, _month: string, from: string, to: string) =>
      of({ ...overview(from, to), unhealthyTotal: "0", unplannedTotal: "0" })
    );
    component.period.set({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
    await fixture.whenStable();

    expect(text("overview-tile-unhealthy")).toContain("Nothing unhealthy");
    expect(text("overview-tile-unplanned")).toContain("Everything was planned");
  });

  it("asks for the period's receipts as calendar days, newest first", () => {
    const { from, to } = thisMonth();
    const [groupId, command] = receiptService.getReceiptsForGroup.mock.calls[0];

    expect(groupId).toBe(1);
    expect(command.sortDirection).toBe("desc");
    expect(command.filter.date.operation).toBe("BETWEEN");
    expect(command.filter.date.value).toEqual([from, to]);
  });

  it("refetches when the picker chooses another period", async () => {
    component.period.set({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, undefined, "2025-01-01", "2025-12-31");
    expect(component.periodLabel()).toBe("2025");
  });

  it("waits for a complete custom range before asking", async () => {
    overviewService.getGroupOverview.mockClear();
    component.period.set(undefined);
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).not.toHaveBeenCalled();
    expect(text("overview-pick-range")).toContain("Type a first and a last day");

    component.period.set({ from: "2026-10-01", to: "2026-10-10", label: "1 Oct 2026 â 10 Oct 2026" });
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, undefined, "2026-10-01", "2026-10-10");
  });

  it("opens the products behind the Unhealthy and Unplanned tiles for the period", () => {
    const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const { from, to } = thisMonth();

    component.openProducts("UNPLANNED");

    const data = open.mock.calls[0][1]?.data;
    expect(data).toMatchObject({ kind: "UNPLANNED", groupId: 1, from, to });
  });

  it("does not open the folded Other slice", () => {
    const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const segment = { name: "Other", total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 };

    expect(component.isOpenable(segment)).toBe(false);
    component.openCategory(segment);

    expect(open).not.toHaveBeenCalled();
  });

  it("opens the products of a food group, and Uncategorized as the empty group", () => {
    const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const segment = (name: string) => ({ name, total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 });

    component.openCategory(segment("Dairy"));
    component.openCategory(segment("Uncategorized"));

    expect(open.mock.calls[0][1]?.data).toMatchObject({ kind: "FOODGROUP", foodGroup: "Dairy" });
    expect(open.mock.calls[1][1]?.data).toMatchObject({ kind: "FOODGROUP", foodGroup: "" });
  });

  it("opens a category slice by its id when it has one", () => {
    const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);

    component.openCategory({ name: "Nabiał", categoryId: 4, total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 });

    expect(open.mock.calls[0][1]?.data).toMatchObject({ kind: "FOODGROUP", categoryId: 4 });
  });

  it("gives each tag shown on the Dashboard a tile like Unhealthy, opening the lines behind it", async () => {
    overviewService.getGroupOverview.mockImplementation((_groupId: number, _month: string, from: string, to: string) =>
      of({ ...overview(from, to), tags: [{ tagId: 7, name: "Party", total: "23", previousTotal: "10" }] })
    );
    component.period.set({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
    await fixture.whenStable();

    const tile = text("overview-tile-tag-7");
    expect(tile).toContain("Party");
    expect(tile).toContain("23");
    expect(tile).toContain("25% of");

    const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    (fixture.nativeElement.querySelector('[data-testid="overview-tile-tag-7"]') as HTMLElement).click();
    expect(open.mock.calls[0][1]?.data).toMatchObject({ kind: "TAG", tagId: 7, from: "2025-01-01", to: "2025-12-31" });
  });

  describe("monthly spending goal", () => {
    const setGoal = async (goal: string | undefined) => {
      TestBed.inject(Store).dispatch(new SetUserPreferences({ monthlySpendingGoal: goal } as UserPreferences));
      await fixture.whenStable();
    };

    const allowEditing = async () => {
      TestBed.inject(Store).dispatch(
        new SetPermissions([Permission.AppUserPreferencesUpdate], { 1: [Permission.GroupReceiptsRead] })
      );
      await fixture.whenStable();
    };

    it("changes nothing without a goal", async () => {
      await setGoal(undefined);

      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-goal]")).toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-progress]")).toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-goal-line]")).toBeNull();
      expect(text("overview-tile-spent")).toContain("8% less than");
    });

    it("shows the goal beside the amount, a thin bar and what is left", async () => {
      await setGoal("100");

      expect(text("overview-spent-goal")).toContain("/");
      expect(text("overview-spent-goal")).toContain("100");
      expect(text("overview-spent-remaining")).toContain("left");
      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-over]")).toBeNull();
      expect(component.spentGoal()).toEqual({ goal: 100, over: 0, remaining: 8 });
      expect(component.goalProgress()).toBe(92);
      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-progress] > div").style.width).toBe("92%");
    });

    it("fills the bar red and says how far over the goal a month went", async () => {
      await setGoal("80");

      expect(text("overview-spent-over")).toContain("over goal");
      expect(component.spentGoal()).toEqual({ goal: 80, over: 12, remaining: 0 });
      expect(component.goalProgress()).toBe(100);
      const fill = fixture.nativeElement.querySelector("[data-testid=overview-spent-progress] > div");
      expect(fill.classList).toContain("tile__progress-fill--over");
      expect(fill.style.width).toBe("100%");
    });

    it("leaves the Spent card alone outside a whole month", async () => {
      await setGoal("100");
      component.period.set({ from: "2026-10-12", to: "2026-10-18", label: "week" });
      await fixture.whenStable();

      expect(component.spentGoal()).toBeUndefined();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-goal]")).toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-spent-progress]")).toBeNull();
    });

    it("draws the goal line and splits the bars that are over it", async () => {
      await setGoal("95");

      expect(fixture.nativeElement.querySelector("[data-testid=overview-goal-line]")).not.toBeNull();
      const bars = component.bars();
      // The trend is September 100 and this month 92, so September is over a goal of 95 and this month is not.
      expect(bars[0].overAmount).toBe(5);
      expect(bars[1].overAmount).toBe(0);
      expect(fixture.nativeElement.querySelectorAll("[data-testid=overview-bar-over]").length).toBe(1);
      expect(text("overview-trend-summary")).toContain("Goal");
    });

    it("gives the chart the goal, a red over-goal part, and rounds only the top segment of each bar", async () => {
      await setGoal("95");

      const spec = component.barsOptions(CHART_COLORS) as ChartConfiguration<"bar">;
      expect(spec.options?.plugins?.cvGoalLine).toMatchObject({ value: 95, color: CHART_COLORS.mutedForeground });
      const [spent, over] = spec.data.datasets;
      expect(spent.data).toEqual([95, 92]);
      expect(over.data).toEqual([5, 0]);
      expect(over.backgroundColor).toBe(CHART_COLORS.destructive);

      const colorOf = (index: number) => (spent.backgroundColor as (context: { dataIndex: number }) => string)({ dataIndex: index });
      expect(colorOf(1)).toBe(CHART_COLORS.primary); // this month is the selected bar
      expect(colorOf(0)).toBe("rgba(100, 100, 100, 0.35)");

      const radius = (dataset: (typeof spec.data.datasets)[number], index: number) =>
        (dataset.borderRadius as (context: { dataIndex: number }) => unknown)({ dataIndex: index });
      expect(radius(over, 0)).toMatchObject({ topLeft: 4, topRight: 4, bottomLeft: 0 }); // September: the red part is the top
      expect(radius(spent, 0)).toBe(0); // and the base under it stays square
      expect(radius(spent, 1)).toMatchObject({ topLeft: 4, topRight: 4 }); // this month has no red part
    });

    it("keeps the scale on the tallest month and leaves out a goal line that would not fit", async () => {
      await setGoal("1500");

      expect(component.bars().every((bar) => (bar.overAmount ?? 0) === 0)).toBe(true);
      expect(component.bars()[0].fraction).toBe(1);
      expect(fixture.nativeElement.querySelector("[data-testid=overview-goal-line]")).toBeNull();
      expect(text("overview-trend-summary")).toContain("Goal");
    });

    describe("setting it from the card", () => {
      let userPreferencesService: { updateUserPreferences: Mock };

      beforeEach(() => {
        userPreferencesService = {
          updateUserPreferences: vi.fn((preferences: UserPreferences) => of(preferences)),
        };
        (component as any).userPreferencesService = userPreferencesService;
        (component as any).snackbarService = { error: vi.fn(), success: vi.fn() };
      });

      const type = async (value: string) => {
        const input = fixture.nativeElement.querySelector("[data-testid=overview-goal-input]") as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event("input"));
        await fixture.whenStable();
        return input;
      };

      const click = async (testId: string) => {
        (fixture.nativeElement.querySelector(`[data-testid=${testId}]`) as HTMLElement).click();
        await fixture.whenStable();
      };

      it("offers nothing to someone who cannot update their preferences", async () => {
        await setGoal(undefined);

        expect(fixture.nativeElement.querySelector("[data-testid=overview-set-goal]")).toBeNull();
      });

      it("offers + Set goal when there is none, and saves on Enter without losing other preferences", async () => {
        await allowEditing();
        TestBed.inject(Store).dispatch(new SetUserPreferences({ closeChipSelectOnSelect: true } as UserPreferences));
        await fixture.whenStable();
        await click("overview-set-goal");

        const input = await type("1500,5");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await fixture.whenStable();

        expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith({
          closeChipSelectOnSelect: true,
          monthlySpendingGoal: "1500.5",
        });
        expect(component.goal()).toBe(1500.5);
        expect(fixture.nativeElement.querySelector("[data-testid=overview-goal-input]")).toBeNull();
      });

      it("turns the goal into an input on click and removes it when cleared", async () => {
        await allowEditing();
        await setGoal("100");
        await click("overview-spent-goal");

        const input = await type("0");
        input.dispatchEvent(new Event("blur"));
        await fixture.whenStable();

        expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledTimes(1);
        expect(userPreferencesService.updateUserPreferences.mock.calls[0][0].monthlySpendingGoal).toBeUndefined();
        expect(component.goal()).toBe(0);
      });

      it("does not save on Escape, nor an unchanged goal", async () => {
        await allowEditing();
        await setGoal("100");
        await click("overview-goal-edit");
        const input = await type("250");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        input.dispatchEvent(new Event("blur"));
        await fixture.whenStable();

        expect(userPreferencesService.updateUserPreferences).not.toHaveBeenCalled();

        await click("overview-goal-edit");
        const same = fixture.nativeElement.querySelector("[data-testid=overview-goal-input]") as HTMLInputElement;
        same.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await fixture.whenStable();

        expect(userPreferencesService.updateUserPreferences).not.toHaveBeenCalled();
      });

      it("refuses an amount it cannot read", async () => {
        await allowEditing();
        await setGoal(undefined);
        await click("overview-set-goal");

        const input = await type("abc");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await fixture.whenStable();

        expect(userPreferencesService.updateUserPreferences).not.toHaveBeenCalled();
        expect(component.editingGoal()).toBe(true);
      });
    });
  });

  describe("a year of months and longer ranges", () => {
    const monthlyTrend = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const absolute = 2025 * 12 + 9 + index;
        return { month: `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`, total: index === 3 ? "78.44" : "0" };
      });

    it("draws twelve months in one row, each bar with its own month name", async () => {
      overviewService.getGroupOverview.mockImplementation((_g: number, _m: string, from: string, to: string) =>
        of({ ...overview(from, to), trend: monthlyTrend(12) })
      );
      component.period.set({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
      await fixture.whenStable();

      const spec = component.barsOptions(CHART_COLORS);
      const labels = spec.data.labels as string[];
      expect(labels.length).toBe(12);
      expect(labels.every((name) => name.length > 0)).toBe(true);
      // Every month keeps its label (slanted when they do not fit); only a month of days is thinned out.
      expect((spec.options?.scales?.["x"] as { ticks: { autoSkip: boolean } }).ticks.autoSkip).toBe(false);
      expect(fixture.nativeElement.querySelector("[data-testid=overview-bars]")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-chart-capped]")).toBeNull();
    });

    it("keeps only the latest twelve when a little more comes back", async () => {
      overviewService.getGroupOverview.mockImplementation((_g: number, _m: string, from: string, to: string) =>
        of({ ...overview(from, to), trend: monthlyTrend(13) })
      );
      component.period.set({ from: "2025-10-21", to: "2026-10-20", label: "year" });
      await fixture.whenStable();

      expect(component.chartBars().length).toBe(12);
      expect(fixture.nativeElement.querySelector("[data-testid=overview-chart-capped]")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-range-export]")).toBeNull();
    });

    it("offers the PDF and CSV instead of bars for a range over a year", async () => {
      component.period.set({ from: "2024-01-01", to: "2026-03-01", label: "long" });
      await fixture.whenStable();

      expect(component.rangeTooLongForChart()).toBe(true);
      expect(fixture.nativeElement.querySelector(".bars")).toBeNull();
      expect(text("overview-range-export")).toContain("best viewed as a report");
      expect(fixture.nativeElement.querySelector("[data-testid=overview-export-pdf]")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=overview-export-csv]")).not.toBeNull();
    });
  });

  it("hides the shopping card for a user who can read no group's lists", () => {
    expect(fixture.nativeElement.querySelector('[data-testid="overview-tile-to-buy"]')).toBeNull();
  });

  describe("an empty receipts card", () => {
    it("says there are no receipts yet in the period, with no button for someone who cannot add one", () => {
      expect(text("overview-receipts-empty")).toContain("No receipts yet in");
      expect(fixture.nativeElement.querySelector("[data-testid=overview-empty-add-receipt]")).toBeNull();
    });

    it("offers Add receipt here, and not in the top action bar, to someone who can add one", async () => {
      TestBed.inject(Store).dispatch(
        new SetPermissions([], { 1: [Permission.GroupReceiptsRead, Permission.GroupReceiptsCreate] })
      );
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector("[data-testid=overview-add-receipt]")).toBeNull();
      const button = fixture.nativeElement.querySelector("[data-testid=overview-empty-add-receipt]");
      expect(button).not.toBeNull();
      expect(button.textContent).toContain("Add receipt");
    });
  });

  describe("Quick Scan without an AI key", () => {
    const quickScanButton = () => fixture.nativeElement.querySelector("[data-testid=overview-quick-scan]");

    it("shows the button to a member who may scan and, with no AI set up, asks whoever may configure it to add a key", async () => {
      TestBed.inject(Store).dispatch(
        new SetPermissions([Permission.AppReceiptProcessingSettingsUpdate], { 1: [Permission.GroupReceiptsRead, Permission.GroupReceiptsQuickScan] })
      );
      await fixture.whenStable();
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      const confirm = { headerText: "", dialogContent: "", confirmText: "" };
      const open = vi
        .spyOn(TestBed.inject(AppDialog), "open")
        .mockReturnValue({ componentInstance: confirm, afterClosed: () => of(true) } as never);

      expect(quickScanButton()).not.toBeNull();
      component.openQuickScan();

      expect(open).toHaveBeenCalledWith(ConfirmationDialogComponent);
      expect(confirm.confirmText).toBe("Add AI API key");
      expect(navigate).toHaveBeenCalledWith(["/ai"]);
    });

    it("tells a member who cannot configure the AI to ask an admin, and goes nowhere", async () => {
      TestBed.inject(Store).dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead, Permission.GroupReceiptsQuickScan] }));
      await fixture.whenStable();
      const hint = vi.spyOn(TestBed.inject(SnackbarService), "hint");
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      component.openQuickScan();

      expect(hint).toHaveBeenCalledWith("Scanning needs an AI API key. Ask an admin to add one.");
      expect(navigate).not.toHaveBeenCalled();
    });

    it("opens the scan dialog once the AI is set up", async () => {
      TestBed.inject(Store).dispatch(new SetFeatureConfig({ aiPoweredReceipts: true } as never));
      TestBed.inject(Store).dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead, Permission.GroupReceiptsQuickScan] }));
      await fixture.whenStable();
      const hint = vi.spyOn(TestBed.inject(SnackbarService), "hint");
      const open = vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({ afterClosed: () => new Subject() } as never);

      expect(component.aiConfigured()).toBe(true);
      component.openQuickScan();

      expect(open).toHaveBeenCalledTimes(1);
      expect(hint).not.toHaveBeenCalled();
    });

    it("hides the button from a member who may not scan", async () => {
      await fixture.whenStable();
      expect(quickScanButton()).toBeNull();
    });
  });

  it("focuses a category on the ring, dims the others, and clears again", async () => {
    await fixture.whenStable();
    const first = component.segments()[0];
    expect(first).toBeDefined();
    const count = () => component.donutOptions(CHART_COLORS).data.datasets[0].data.length;
    const all = count();

    component.toggleFocus(first.name);
    expect(component.isDimmed(first.name)).toBe(false);
    expect(component.isDimmed("Someone else")).toBe(true);
    expect(component.focusedSegment()).toBe(first.name);
    expect(count()).toBe(all);

    component.toggleFocus(first.name);
    expect(component.focusedSegment()).toBeNull();
    expect(component.isDimmed("Someone else")).toBe(false);
    expect(count()).toBe(all);
  });

  describe("donut and legend in step", () => {
    const twoCategories = (from: string, to: string): GroupOverview => ({
      ...overview(from, to),
      categories: [
        { name: "Groceries", total: "60" },
        { name: "Drinks", total: "32" },
      ],
    });

    beforeEach(async () => {
      overviewService.getGroupOverview.mockImplementation((_groupId: number, _month: string, from: string, to: string) =>
        of(twoCategories(from, to))
      );
      component.period.set({ from: "2025-01-01", to: "2025-01-31", label: "January 2025" });
      await fixture.whenStable();
    });

    const row = (name: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="overview-donut-row-${name}"]`);

    it("puts the share in front of the name, with no Share column", () => {
      const headers = Array.from(fixture.nativeElement.querySelectorAll(".donut__legend th") as NodeListOf<HTMLElement>).map((th) =>
        th.textContent?.trim()
      );
      expect(headers).toEqual(["Category", "Spent"]);

      const cells = row("Groceries").querySelectorAll("td");
      expect(cells.length).toBe(2);
      const first = cells[0].textContent?.replace(/\s+/g, " ").trim() ?? "";
      expect(first).toMatch(/^\d+(\.\d)?% Groceries$/);
      expect(row("Groceries").querySelector('[data-testid="overview-donut-share"]')).not.toBeNull();
    });

    it("dims the other legend rows while one is hovered, and clears on leave", async () => {
      row("Drinks").dispatchEvent(new Event("mouseenter"));
      await fixture.whenStable();

      expect(component.activeSegment()).toBe("Drinks");
      expect(row("Groceries").getAttribute("data-dimmed")).toBe("true");
      expect(row("Drinks").getAttribute("data-dimmed")).toBe("false");

      row("Drinks").dispatchEvent(new Event("mouseleave"));
      await fixture.whenStable();
      expect(component.activeSegment()).toBeNull();
      expect(row("Groceries").getAttribute("data-dimmed")).toBe("false");
    });

    const donut = () => component.donutOptions(CHART_COLORS) as ChartConfiguration<"doughnut">;
    const hostIndex = () => (fixture.nativeElement.querySelector('[data-testid="overview-donut"]') as HTMLElement).getAttribute("data-active-index");
    const fill = (index: number) => (donut().data.datasets[0].backgroundColor as (context: { dataIndex: number }) => string)({ dataIndex: index });

    it("emphasises the hovered row's slice, fades the others and names it in the middle, without new chart data", async () => {
      const before = donut().data.datasets[0].data;
      expect(donut().options?.plugins?.cvCenterText?.text?.().label).toBe("January 2025");
      expect(hostIndex()).toBeNull();

      row("Drinks").dispatchEvent(new Event("mouseenter"));
      await fixture.whenStable();

      expect(component.activeSegmentIndex()).toBe(1);
      expect(hostIndex()).toBe("1");
      const middle = donut().options?.plugins?.cvCenterText?.text?.();
      expect(middle?.label).toBe("Drinks");
      expect(middle?.value).toContain("32");
      // The slice colors are scriptable, so the others go faint without the chart being given new data.
      expect(fill(1)).toBe("rgb(2, 2, 2)");
      expect(fill(0)).toBe("rgba(1, 1, 1, 0.45)");
      expect(donut().data.datasets[0].data).toEqual(before);

      row("Drinks").dispatchEvent(new Event("mouseleave"));
      await fixture.whenStable();
      expect(hostIndex()).toBeNull();
      expect(fill(0)).toBe("rgb(1, 1, 1)");
      expect(donut().options?.plugins?.cvCenterText?.text?.().label).toBe("January 2025");
    });

    it("dims the legend when a slice is hovered on the ring, and a click still focuses it", async () => {
      const pointer = donut().options?.plugins?.cvPointer;

      pointer?.hover?.(0);
      await fixture.whenStable();
      expect(row("Drinks").getAttribute("data-dimmed")).toBe("true");

      pointer?.hover?.(null);
      pointer?.click?.(1);
      await fixture.whenStable();
      expect(component.focusedSegment()).toBe("Drinks");
      expect(row("Groceries").getAttribute("data-dimmed")).toBe("true");
      // Once the pointer leaves, the focused slice is the one the chart keeps emphasised.
      expect(pointer?.active?.()).toBe(1);
      expect(hostIndex()).toBe("1");
    });
  });

  describe("panel layout", () => {
    const panelOrder = (): string[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid^="dashboard-panel-"][data-span]')).map(
        (panel) => panel.getAttribute("data-testid")!.replace("dashboard-panel-", "")
      );

    const save = async (layout: object) => {
      TestBed.inject(DashboardLayoutStore).layout.set(parseLayout(JSON.stringify(layout)));
      await fixture.whenStable();
    };

    it("draws the default panels, KPI tiles first, and links each receipt's date to the receipt", async () => {
      receiptService.getReceiptsForGroup.mockReturnValue(
        of({ data: [{ id: 41, date: "2025-01-03", name: "Lidl", shopName: "Lidl", amount: "12", status: "OPEN" }], totalCount: 1 })
      );
      component.period.set({ from: "2025-01-01", to: "2025-01-31", label: "January 2025" });
      await fixture.whenStable();

      expect(panelOrder()).toEqual(["spent", "receipts", "unhealthy", "unplanned", "warranties", "categories", "trend", "recentReceipts", "warrantiesEndingSoon"]);
      // The router directives are not loaded here (the shop name link has no href either); the date is now a link.
      const dateLink = fixture.nativeElement.querySelector('[data-testid="overview-receipt-date-link"]') as HTMLAnchorElement;
      expect(dateLink.tagName).toBe("A");
      expect(dateLink.textContent).toContain("Jan 3");
    });

    it("follows the saved order and sizes, and leaves hidden panels out", async () => {
      await save({
        version: 1,
        panels: [
          { id: "trend", visible: true, cols: 6, rows: 1 },
          { id: "spent", visible: true, cols: 1, rows: 1 },
          { id: "unhealthy", visible: false, cols: 1, rows: 1 },
        ],
      });

      expect(panelOrder().slice(0, 2)).toEqual(["trend", "spent"]);
      expect(panelOrder()).not.toContain("unhealthy");
      // Panels the saved layout does not mention still show, after their group.
      expect(panelOrder()).toContain("receipts");
      const trend = fixture.nativeElement.querySelector('[data-testid="dashboard-panel-trend"]') as HTMLElement;
      expect(trend.getAttribute("data-span")).toBe("6");
    });

    it("lists the warranties ending in the next two months, nearest first, with the days left", async () => {
      const today = toDayKey(todayInZone(TestBed.inject(Store).selectSnapshot(SystemSettingsState.timeZone)));
      const inDays = (days: number) => {
        const [year, month, day] = today.split("-").map(Number);
        return toDayKey(new Date(year, month - 1, day + days));
      };
      receiptService.getReceiptsForGroup.mockImplementation((_groupId: number, command: { filter?: { warrantyActive?: boolean } }) =>
        of(
          command.filter?.warrantyActive
            ? {
                data: [
                  { id: 5, name: "Kettle", shopName: "Media Expert", date: "2025-01-03", warrantyUntil: today, amount: "1", status: "OPEN", warrantyProducts: ["Electric kettle", "Descaler"] },
                  { id: 6, name: "Phone", shopName: "", date: "2025-01-03", warrantyUntil: inDays(12), amount: "1", status: "OPEN" },
                ],
                totalCount: 2,
              }
            : { data: [], totalCount: 0 }
        )
      );
      // The panel loads once per group, so it needs a component created after the answer is set up.
      fixture = TestBed.createComponent(OverviewPageComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
      component.period.set({ from: "2025-01-01", to: "2025-01-31", label: "January 2025" });
      await fixture.whenStable();

      const request = receiptService.getReceiptsForGroup.mock.calls.find(([, command]) => command.filter?.warrantyActive)?.[1];
      expect(request).toEqual(
        expect.objectContaining({ orderBy: "warranty_until", sortDirection: "asc", filter: { warrantyActive: true, warrantyEndsBy: expect.any(String) } })
      );
      const daysLeft = Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="overview-warranty-days-left"]') as NodeListOf<HTMLElement>
      ).map((cell) => cell.textContent?.trim().replace(/\s+/g, " "));
      expect(daysLeft).toEqual(["Today", "", "12 days"]);
      const products = Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="overview-warranty-product"]') as NodeListOf<HTMLElement>
      ).map((cell) => cell.textContent?.trim());
      expect(products).toEqual(["Electric kettle", "Descaler", "–"]);
    });

    it("gives a tag shown on the Dashboard its own panel next to the KPI tiles", async () => {
      overviewService.getGroupOverview.mockImplementation((_groupId: number, _month: string, from: string, to: string) =>
        of({ ...overview(from, to), tags: [{ tagId: 7, name: "Party", total: "23", previousTotal: "10" }] })
      );
      component.period.set({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
      await fixture.whenStable();

      expect(panelOrder().indexOf("tag:7")).toBe(panelOrder().indexOf("warranties") + 1);
      expect(component.panelLabel("tag:7")).toBe("Party");
    });

    it("lists twelve receipts when the receipts panel is made taller", async () => {
      await save({ version: 1, panels: [{ id: "recentReceipts", visible: true, cols: 4, rows: 2 }] });

      expect(receiptService.getReceiptsForGroup.mock.calls.at(-1)?.[1]).toMatchObject({ pageSize: 12 });
    });

    it("stacks every panel in one column on a phone-sized grid", async () => {
      (component as unknown as { gridWidth: { set(width: number): void } }).gridWidth.set(375);
      await fixture.whenStable();

      expect(component.sizeClass()).toBe("compact");
      expect(component.gridColumns()).toBe(1);
      expect(component.panels().every((panel) => panel.span === 1)).toBe(true);
    });

    it("shows no Customize button to someone who may not customise", async () => {
      expect(fixture.nativeElement.querySelector('[data-testid="overview-customise"]')).not.toBeNull();

      TestBed.inject(DashboardLayoutStore).canCustomise.set(false);
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('[data-testid="overview-customise"]')).toBeNull();
    });

    describe("the customise screen", () => {
      beforeEach(async () => {
        routeData.next({ customise: true });
        await fixture.whenStable();
      });

      it("swaps the page actions for the customise toolbar and lists the panels by group", () => {
        expect(fixture.nativeElement.querySelector('[data-testid="overview-quick-scan"]')).toBeNull();
        expect(fixture.nativeElement.querySelector('[data-testid="dashboard-customise-toolbar"]')).not.toBeNull();
        expect(component.libraryGroups().map((group) => group.key)).toEqual(["kpi", "charts", "lists"]);
        expect(fixture.nativeElement.querySelector('[data-testid="dashboard-library-unhealthy"]')).not.toBeNull();
      });

      it("hides and moves panels in the draft only, then saves the whole layout and returns", async () => {
        const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

        component.setPanelVisible("unhealthy", false);
        component.shiftPanel("trend", -1);
        await fixture.whenStable();
        expect(panelOrder()).not.toContain("unhealthy");
        expect(panelOrder().indexOf("trend")).toBeLessThan(panelOrder().indexOf("categories"));
        expect(component.layoutDirty()).toBe(true);
        expect(TestBed.inject(DashboardLayoutStore).layout()).toBeUndefined();

        (fixture.nativeElement.querySelector('[data-testid="dashboard-customise-save"]') as HTMLButtonElement).click();
        await fixture.whenStable();

        const sent = JSON.parse(dashboardLayoutService.updateDashboardLayout.mock.calls[0][0].layout);
        expect(sent.version).toBe(1);
        expect(sent.panels.find((panel: { id: string }) => panel.id === "unhealthy").visible).toBe(false);
        expect(navigate).toHaveBeenCalledWith(["/overview/group", "1"]);
        expect(component.layoutDirty()).toBe(false);
      });

      it("refuses sizes past the limits with a shake and a hint, and widths outside the PC view", async () => {
        const hint = vi.spyOn(TestBed.inject(SnackbarService), "hint");
        const spent = () => component.panels().find((panel) => panel.id === "spent")!;
        expect(component.resize("spent", { cols: 9 })).toBe(false);
        expect(spent().cols).toBe(2);
        expect(hint).toHaveBeenCalledTimes(1);

        expect(component.resize("spent", { cols: 1 })).toBe(true);
        expect(spent().cols).toBe(1);
        expect(component.resize("spent", { cols: 2 })).toBe(true);
        expect(component.resize("spent", { cols: 1 })).toBe(true);

        component.setPreviewDevice("tablet");
        (component as unknown as { gridWidth: { set(width: number): void } }).gridWidth.set(744);
        await fixture.whenStable();
        expect(component.previewWidth()).toBe(768);
        hint.mockClear();
        expect(component.resize("spent", { cols: 2 })).toBe(false);
        expect(hint).toHaveBeenCalledTimes(1);
      });

      it("steps from the current size, not from the copy the menu was opened with", () => {
        const spent = () => component.panels().find((panel) => panel.id === "spent")!;
        component.stepSize("spent", -1, 0);
        expect(spent().cols).toBe(1);
        component.stepSize("spent", 1, 0);
        expect(spent().cols).toBe(2);
        component.stepSize("spent", -1, 0);
        expect(spent().cols).toBe(1);
      });

      it("draws every panel in its own grid cell, exactly as wide as it is set", () => {
        const first = component.panels()[0];
        expect(component.gridColumn(first)).toBe(`${first.x + 1} / span ${first.span}`);
        expect(component.gridRow(first)).toBe(first.row + 1);
      });

      it("moves a panel into empty columns and keeps the others where they were", async () => {
        component.setPanelVisible("trend", false);
        await fixture.whenStable();
        const before = Object.fromEntries(component.panels().map((panel) => [panel.id, [panel.x, panel.row]]));
        component.nudgePanel("categories", 1, 0);
        await fixture.whenStable();
        const after = Object.fromEntries(component.panels().map((panel) => [panel.id, [panel.x, panel.row]]));

        expect(before["categories"]).toEqual([0, 1]);
        expect(after["categories"]).toEqual([1, 1]);
        for (const id of Object.keys(before).filter((key) => key !== "categories")) {
          expect(after[id]).toEqual(before[id]);
        }
      });

      it("cannot widen a panel into its neighbour, and says so", () => {
        const hint = vi.spyOn(TestBed.inject(SnackbarService), "hint");
        // Spent (2 columns) has Receipts right beside it.
        expect(component.resize("spent", { cols: 3 })).toBe(false);
        expect(hint).toHaveBeenCalled();
      });

      it("asks before leaving with unsaved changes, and leaves at once without any", async () => {
        const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
        const open = vi.spyOn(TestBed.inject(AppDialog), "open");

        component.cancelCustomising();
        expect(open).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledTimes(1);

        const afterClosed = new Subject<boolean | undefined>();
        open.mockReturnValue({ componentInstance: {}, afterClosed: () => afterClosed } as never);
        component.setPanelVisible("trend", false);
        component.cancelCustomising();
        expect(open).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledTimes(1);

        afterClosed.next(true);
        expect(navigate).toHaveBeenCalledTimes(2);
        expect(component.layoutDirty()).toBe(false);
      });

      it("resets to the default layout", async () => {
        component.setPanelVisible("trend", false);
        component.resetLayout();
        await fixture.whenStable();
        expect(panelOrder()).toContain("trend");
      });
    });
  });
});
