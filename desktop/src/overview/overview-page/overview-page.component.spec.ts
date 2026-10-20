import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { BehaviorSubject, of } from "rxjs";
import { GroupOverview, OverviewService, Permission, ReceiptService, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { todayInZone } from "../../utils/app-time-zone";
import { OverviewPageComponent } from "./overview-page.component";

const overview = (month: string): GroupOverview => ({
  month,
  total: "92",
  previousTotal: "100",
  receiptCount: 3,
  openReceiptCount: 1,
  unhealthyTotal: "23",
  categories: [{ name: "Groceries", total: "92" }],
  months: [
    { month: "2026-05", total: "0" },
    { month: "2026-06", total: "0" },
    { month: "2026-07", total: "0" },
    { month: "2026-08", total: "0" },
    { month: "2026-09", total: "100" },
    { month, total: "92" },
  ],
});

describe("OverviewPageComponent", () => {
  let fixture: ComponentFixture<OverviewPageComponent>;
  let component: OverviewPageComponent;
  let overviewService: { getGroupOverview: jest.Mock };
  let receiptService: { getReceiptsForGroup: jest.Mock };
  const params = new BehaviorSubject(convertToParamMap({ groupId: "1" }));

  const text = (testId: string): string =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";

  beforeEach(async () => {
    overviewService = { getGroupOverview: jest.fn((_groupId: number, month: string) => of(overview(month))) };
    receiptService = { getReceiptsForGroup: jest.fn(() => of({ data: [], totalCount: 0 })) };

    await TestBed.configureTestingModule({
      declarations: [OverviewPageComponent],
      imports: [NgxsModule.forRoot([AuthState, GroupState, ShoppingListState, SystemSettingsState]), PipesModule, SharedUiModule],
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

  it("asks for the current month and fills the tiles", () => {
    // "This month" is the app time zone's, exactly as the page computes it.
    const now = todayInZone(TestBed.inject(Store).selectSnapshot(SystemSettingsState.timeZone));
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    expect(overviewService.getGroupOverview).toHaveBeenCalledWith(1, key);
    expect(text("overview-tile-receipts")).toContain("3");
    expect(text("overview-tile-receipts")).toContain("1 still open");
    expect(text("overview-tile-spent")).toContain("8% less than");
    expect(text("overview-tile-unhealthy")).toContain("25% of");
  });

  it("shows no warning in a month without unhealthy products", async () => {
    overviewService.getGroupOverview.mockImplementation((_groupId: number, month: string) =>
      of({ ...overview(month), unhealthyTotal: "0" })
    );
    component.selectMonth({ year: 2026, month: 0 });
    await fixture.whenStable();

    expect(text("overview-tile-unhealthy")).toContain("Nothing unhealthy");
  });

  it("asks for the month's receipts as calendar days, newest first", () => {
    const [groupId, command] = receiptService.getReceiptsForGroup.mock.calls[0];
    expect(groupId).toBe(1);
    expect(command.sortDirection).toBe("desc");
    expect(command.filter.date.operation).toBe("BETWEEN");
    expect(command.filter.date.value[0]).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("refetches when the month changes", async () => {
    component.selectMonth({ year: 2026, month: 0 });
    await fixture.whenStable();

    expect(overviewService.getGroupOverview).toHaveBeenLastCalledWith(1, "2026-01");
    expect(component.monthLabel()).toBe("January 2026");
  });

  it("hides the shopping card for a user who can read no group's lists", () => {
    expect(fixture.nativeElement.querySelector('[data-testid="overview-tile-to-buy"]')).toBeNull();
  });
});
