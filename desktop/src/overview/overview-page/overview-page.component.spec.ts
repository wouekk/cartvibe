import { MoneyComponent } from "../../shared-ui/money/money.component";
import { ShopMonogramComponent } from "../../shared-ui/shop-monogram/shop-monogram.component";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { BehaviorSubject, of } from "rxjs";
import {
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
import { SetPermissions, SetUserPreferences } from "../../store/auth.state.actions";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { todayInZone } from "../../utils/app-time-zone";
import { toDayKey } from "../overview-period";
import { OverviewPageComponent } from "./overview-page.component";

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
  let overviewService: { getGroupOverview: jest.Mock };
  let receiptService: { getReceiptsForGroup: jest.Mock };
  const params = new BehaviorSubject(convertToParamMap({ groupId: "1" }));

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
      getGroupOverview: jest.fn((_groupId: number, _month: string, from: string, to: string) => of(overview(from, to))),
    };
    receiptService = { getReceiptsForGroup: jest.fn(() => of({ data: [], totalCount: 0 })) };

    await TestBed.configureTestingModule({
      declarations: [OverviewPageComponent],
      imports: [NgxsModule.forRoot([AuthState, FeatureConfigState, GroupState, ShoppingListState, SystemSettingsState]), PipesModule, SharedUiModule, MoneyComponent, ShopMonogramComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: OverviewService, useValue: overviewService },
        { provide: ReceiptService, useValue: receiptService },
        { provide: ShoppingListService, useValue: { getShoppingListsForGroup: jest.fn(() => of([])) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.inject(Store).dispatch(new SetPermissions([], { 1: [Permission.GroupReceiptsRead] }));
    fixture = TestBed.createComponent(OverviewPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
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

    component.period.set({ from: "2026-10-01", to: "2026-10-10", label: "1 Oct 2026 – 10 Oct 2026" });
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, undefined, "2026-10-01", "2026-10-10");
  });

  it("opens the products behind the Unhealthy and Unplanned tiles for the period", () => {
    const open = jest.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const { from, to } = thisMonth();

    component.openProducts("UNPLANNED");

    const data = open.mock.calls[0][1]?.data;
    expect(data).toMatchObject({ kind: "UNPLANNED", groupId: 1, from, to });
  });

  it("does not open the folded Other slice", () => {
    const open = jest.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const segment = { name: "Other", total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 };

    expect(component.isOpenable(segment)).toBe(false);
    component.openCategory(segment);

    expect(open).not.toHaveBeenCalled();
  });

  it("opens the products of a food group, and Uncategorized as the empty group", () => {
    const open = jest.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({} as never);
    const segment = (name: string) => ({ name, total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 });

    component.openCategory(segment("Dairy"));
    component.openCategory(segment("Uncategorized"));

    expect(open.mock.calls[0][1]?.data).toMatchObject({ kind: "FOODGROUP", foodGroup: "Dairy" });
    expect(open.mock.calls[1][1]?.data).toMatchObject({ kind: "FOODGROUP", foodGroup: "" });
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

    it("keeps the scale on the tallest month and leaves out a goal line that would not fit", async () => {
      await setGoal("1500");

      expect(component.bars().every((bar) => (bar.overAmount ?? 0) === 0)).toBe(true);
      expect(component.bars()[0].fraction).toBe(1);
      expect(fixture.nativeElement.querySelector("[data-testid=overview-goal-line]")).toBeNull();
      expect(text("overview-trend-summary")).toContain("Goal");
    });

    describe("setting it from the card", () => {
      let userPreferencesService: { updateUserPreferences: jest.Mock };

      beforeEach(() => {
        userPreferencesService = {
          updateUserPreferences: jest.fn((preferences: UserPreferences) => of(preferences)),
        };
        (component as any).userPreferencesService = userPreferencesService;
        (component as any).snackbarService = { error: jest.fn(), success: jest.fn() };
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

      const options = component.barsOptions(CHART_COLORS);
      expect((options.xaxis as { categories: string[] }).categories.length).toBe(12);
      expect((options.xaxis as { categories: string[] }).categories.every((name) => name.length > 0)).toBe(true);
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

    it("offers the same Add receipt button as the top of the page to someone who can add one", async () => {
      TestBed.inject(Store).dispatch(
        new SetPermissions([], { 1: [Permission.GroupReceiptsRead, Permission.GroupReceiptsCreate] })
      );
      await fixture.whenStable();

      const button = fixture.nativeElement.querySelector("[data-testid=overview-empty-add-receipt]");
      expect(button).not.toBeNull();
      expect(button.getAttribute("buttonText")).toBe("Add receipt");
    });
  });
});
