import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { BehaviorSubject, of } from "rxjs";
import { GroupOverview, OverviewService, Permission, ReceiptService, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { AuthState } from "../../store/auth.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetPermissions } from "../../store/auth.state.actions";
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
      imports: [NgxsModule.forRoot([AuthState, FeatureConfigState, GroupState, ShoppingListState, SystemSettingsState]), PipesModule, SharedUiModule],
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
    component.selectPeriod("LAST_YEAR");
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

  it("refetches for a preset", async () => {
    component.selectPeriod("LAST_YEAR");
    await fixture.whenStable();

    const lastYear = todayInZone(TestBed.inject(Store).selectSnapshot(SystemSettingsState.timeZone)).getFullYear() - 1;
    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, undefined, `${lastYear}-01-01`, `${lastYear}-12-31`);
    expect(component.periodLabel()).toBe(`${lastYear}`);
  });

  it("waits for a complete custom range before asking", async () => {
    overviewService.getGroupOverview.mockClear();
    component.selectPeriod("CUSTOM");
    component.customFrom.set("2026-10-01");
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).not.toHaveBeenCalled();
    expect(text("overview-pick-range")).toContain("Pick a first and a last day");

    component.customTo.set("2026-10-10");
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, undefined, "2026-10-01", "2026-10-10");
  });

  it("opens the products behind the Unhealthy and Unplanned tiles for the period", () => {
    const open = jest.spyOn(TestBed.inject(MatDialog), "open").mockReturnValue({} as never);
    const { from, to } = thisMonth();

    component.openProducts("UNPLANNED");

    const data = open.mock.calls[0][1]?.data;
    expect(data).toMatchObject({ kind: "UNPLANNED", groupId: 1, from, to });
  });

  it("opens a category's receipts only for a real category", () => {
    const open = jest.spyOn(TestBed.inject(MatDialog), "open").mockReturnValue({} as never);
    const segment = { name: "Other", total: 1, share: "1%", color: "", dashArray: "", dashOffset: 0 };

    expect(component.isOpenable(segment)).toBe(false);
    component.openCategory(segment);

    expect(open).not.toHaveBeenCalled();
  });

  it("hides the shopping card for a user who can read no group's lists", () => {
    expect(fixture.nativeElement.querySelector('[data-testid="overview-tile-to-buy"]')).toBeNull();
  });
});
