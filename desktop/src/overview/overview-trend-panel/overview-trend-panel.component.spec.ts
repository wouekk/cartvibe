import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import type { ChartConfiguration } from "chart.js";
import { of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { GroupOverview, OverviewService } from "../../open-api";
import { SnackbarService } from "../../services";
import { StoreModule } from "../../store/store.module";
import { ResolvedPeriod } from "../overview-period";
import { OverviewTrendPanelComponent } from "./overview-trend-panel.component";

// The panel is a section the page places, so it is tested the way it is used: on a host's <section>.
@Component({
  imports: [OverviewTrendPanelComponent],
  template: `<section
    app-overview-trend-panel
    [overview]="overview()"
    [period]="period()"
    [periodLabel]="period()?.label ?? ''"
    [goal]="goal()"
    [change]="change()"
    [changeIsIncrease]="changeIsIncrease()"
    [groupId]="7"
  ></section>`,
})
class HostComponent {
  public readonly overview = signal<GroupOverview | undefined>(undefined);
  public readonly period = signal<ResolvedPeriod | undefined>(undefined);
  public readonly goal = signal(0);
  public readonly change = signal<string | undefined>(undefined);
  public readonly changeIsIncrease = signal(false);
}

const october: ResolvedPeriod = { from: "2026-10-01", to: "2026-10-31", label: "October 2026" };
const overTwoYears: ResolvedPeriod = { from: "2024-01-01", to: "2026-03-01", label: "1 Jan 2024 – 1 Mar 2026" };

const overviewOf = (from: string, to: string, overrides: Partial<GroupOverview> = {}): GroupOverview => ({
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
  unhealthyTotal: "0",
  categories: [{ name: "Groceries", total: "92" }],
  months: [],
  trend: [
    { month: "2026-09", total: "100" },
    { month: "2026-10", total: "92" },
  ],
  trendUnit: "MONTH",
  ...overrides,
});

const CHART_COLORS = {
  foreground: "rgb(0, 0, 0)",
  mutedForeground: "rgb(100, 100, 100)",
  border: "rgb(220, 220, 220)",
  muted: "rgb(240, 240, 240)",
  card: "rgb(255, 255, 255)",
  primary: "rgb(10, 10, 10)",
  destructive: "rgb(220, 38, 38)",
  series: ["rgb(1, 1, 1)", "rgb(2, 2, 2)"],
};

describe("OverviewTrendPanelComponent", () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let panel: OverviewTrendPanelComponent;
  let overviewService: { getGroupOverview: Mock };

  const byId = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string) => [...fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[];
  const title = (): string => fixture.nativeElement.querySelector("#overview-trend-title")?.textContent ?? "";
  const bars = () => panel.barsOptions(CHART_COLORS) as ChartConfiguration<"bar">;

  const show = async (period: ResolvedPeriod, overrides: Partial<GroupOverview> = {}) => {
    host.period.set(period);
    host.overview.set(overviewOf(period.from, period.to, overrides));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    overviewService = {
      getGroupOverview: vi.fn((_groupId: number, _month: string | undefined, from: string, to: string) => of(overviewOf(from, to))),
    };

    await TestBed.configureTestingModule({
      imports: [HostComponent, StoreModule],
      providers: [provideZonelessChangeDetection(), { provide: OverviewService, useValue: overviewService }],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    panel = fixture.debugElement.query(By.directive(OverviewTrendPanelComponent)).componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a panel named by its title, and draws nothing before the period has loaded", () => {
    const section: HTMLElement = fixture.nativeElement.querySelector("section");

    expect(section.classList.contains("cv-panel")).toBe(true);
    expect(section.getAttribute("aria-labelledby")).toBe("overview-trend-title");
    expect(title()).toContain("Spending by month");
    expect(byId("overview-bars")).toBeNull();
    expect(byId("overview-trend-summary")).toBeNull();
  });

  it("draws a bar per month with the period's total, the average and the change against the period before", async () => {
    host.change.set("8% less than September 2026");
    await show(october);

    expect(byId("overview-bars")).not.toBeNull();
    expect(bars().data.labels).toEqual(["Sep", "Oct"]);
    expect(bars().data.datasets.length).toBe(1);
    expect(bars().data.datasets[0].data).toEqual([100, 92]);
    expect(byId("overview-trend-summary")?.textContent).toContain("Average");
    expect(byId("overview-trend-summary")?.textContent).toContain("96");
    expect(byId("overview-trend-summary")?.textContent).not.toContain("Goal");
    expect(fixture.nativeElement.textContent).toContain("8% less than September 2026");
    expect(fixture.nativeElement.querySelector(".cv-pill-down")).not.toBeNull();
    expect(byId("overview-goal-line")).toBeNull();
  });

  it("marks the pill as an increase when spending went up", async () => {
    host.change.set("12% more than September 2026");
    host.changeIsIncrease.set(true);
    await show(october);

    expect(fixture.nativeElement.querySelector(".cv-pill-up")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cv-pill-down")).toBeNull();
  });

  it("is titled by day and thins out the labels when the trend comes back in days", async () => {
    await show(
      { from: "2026-10-20", to: "2026-10-25", label: "20 Oct 2026 – 25 Oct 2026" },
      { trendUnit: "DAY", trend: [{ month: "2026-10-21", total: "5" }] }
    );

    expect(title()).toContain("Spending by day");
    expect(byId("overview-trend-summary")?.textContent).toContain("a day");
    expect((bars().options?.scales?.["x"] as { ticks: { autoSkip: boolean } }).ticks.autoSkip).toBe(true);
  });

  describe("with a monthly goal", () => {
    it("draws the goal line, splits the bars that are over it and lists them", async () => {
      host.goal.set(95);
      await show(october);

      // September's 100 is over a goal of 95, this month's 92 is not.
      expect(panel.goalMode()).toBe(true);
      expect(byId("overview-goal-line")).not.toBeNull();
      expect(all("overview-bar-over").length).toBe(1);
      expect(all("overview-bar-over")[0].textContent).toContain("Sep");
      expect(byId("overview-trend-summary")?.textContent).toContain("Goal");
      const [spent, over] = bars().data.datasets;
      expect(spent.data).toEqual([95, 92]);
      expect(over.data).toEqual([5, 0]);
      expect(bars().options?.plugins?.cvGoalLine).toMatchObject({ value: 95 });
    });

    it("leaves out a goal line that is higher than the tallest month", async () => {
      host.goal.set(1500);
      await show(october);

      expect(panel.showGoalLine()).toBe(false);
      expect(byId("overview-goal-line")).toBeNull();
      expect(all("overview-bar-over").length).toBe(0);
      expect(bars().options?.plugins?.cvGoalLine).toMatchObject({ value: 0 });
    });

    it("does not split a chart of days: the goal is a month's", async () => {
      host.goal.set(3);
      await show(
        { from: "2026-10-20", to: "2026-10-25", label: "20 Oct 2026 – 25 Oct 2026" },
        { trendUnit: "DAY", trend: [{ month: "2026-10-21", total: "5" }] }
      );

      expect(panel.goalMode()).toBe(false);
      expect(bars().data.datasets.length).toBe(1);
      expect(byId("overview-goal-line")).toBeNull();
    });
  });

  it("opens the receipts of the household for the month, or the day, a bar stands for", async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    await show(october);

    panel.openBar(0);
    expect(navigate).toHaveBeenLastCalledWith(["/receipts/group", 7], { queryParams: { from: "2026-09-01", to: "2026-09-30" } });

    // The chart's own click hands over the bar under the pointer.
    (bars().options?.onClick as unknown as (event: unknown, elements: { index: number }[]) => void)({}, [{ index: 1 }]);
    expect(navigate).toHaveBeenLastCalledWith(["/receipts/group", 7], { queryParams: { from: "2026-10-01", to: "2026-10-31" } });

    await show(
      { from: "2026-10-20", to: "2026-10-25", label: "20 Oct 2026 – 25 Oct 2026" },
      { trendUnit: "DAY", trend: [{ month: "2026-10-21", total: "5" }] }
    );
    panel.openBar(0);
    expect(navigate).toHaveBeenLastCalledWith(["/receipts/group", 7], { queryParams: { from: "2026-10-21", to: "2026-10-21" } });

    navigate.mockClear();
    panel.openBar(40);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps only the latest twelve months when more come back, and says so", async () => {
    const trend = Array.from({ length: 13 }, (_, index) => {
      const absolute = 2025 * 12 + 9 + index;
      return { month: `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`, total: "10" };
    });
    await show({ from: "2025-10-21", to: "2026-10-20", label: "year" }, { trend });

    expect(panel.bars().length).toBe(13);
    expect(panel.chartBars().length).toBe(12);
    expect(byId("overview-chart-capped")?.textContent).toContain("12");
    expect(byId("overview-range-export")).toBeNull();
  });

  describe("a range over a year", () => {
    beforeEach(async () => {
      await show(overTwoYears);
    });

    it("offers the PDF and the CSV instead of bars", () => {
      expect(panel.rangeTooLongForChart()).toBe(true);
      expect(byId("overview-bars")).toBeNull();
      expect(byId("overview-trend-summary")).toBeNull();
      expect(byId("overview-range-export")?.textContent).toContain("best viewed as a report");
      expect(byId("overview-export-pdf")).not.toBeNull();
      expect(byId("overview-export-csv")).not.toBeNull();
    });

    it("fetches the range a calendar year at a time and downloads a CSV named after it", async () => {
      // jsdom has no object URLs; the download is an anchor with a download name, clicked.
      const createObjectURL = vi.fn(() => "blob:csv");
      Object.defineProperty(window.URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true });
      const names: (string | null)[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.getAttribute("download"));
      });

      byId("overview-export-csv")?.click();
      await fixture.whenStable();

      const calls = overviewService.getGroupOverview.mock.calls;
      expect(calls.length).toBe(3);
      expect(calls.every((call) => call[0] === 7 && call[1] === undefined)).toBe(true);
      expect(calls[0][2]).toBe("2024-01-01");
      expect(calls[2][3]).toBe("2026-03-01");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(names).toEqual(["spending-2024-01-01-2026-03-01.csv"]);
      expect(panel.exporting()).toBe(false);
    });

    it("says so when the export cannot be made, and lets the buttons be used again", async () => {
      const error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined);
      overviewService.getGroupOverview.mockImplementation(() => throwError(() => new Error("no connection")));

      await panel.exportCsv();
      await fixture.whenStable();

      expect(error).toHaveBeenCalledWith("The export could not be made. Try again.");
      expect(panel.exporting()).toBe(false);
      expect((byId("overview-export-csv") as HTMLButtonElement).disabled).toBe(false);
    });

    it("prints one page per year in a window opened by the click", async () => {
      const written: string[] = [];
      const printWindow = {
        document: { write: vi.fn((html: string) => written.push(html)), open: vi.fn(), close: vi.fn() },
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(),
      };
      vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);

      await panel.exportPdf();

      expect(overviewService.getGroupOverview).toHaveBeenCalledTimes(3);
      expect(printWindow.print).toHaveBeenCalledTimes(1);
      expect(written[written.length - 1]).toContain("1 Jan 2024 – 1 Mar 2026");
      expect(written[written.length - 1]).toContain("2025");
      expect(panel.exporting()).toBe(false);
    });

    it("asks for pop-ups when the browser refuses the print window, without fetching anything", async () => {
      const error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined);
      vi.spyOn(window, "open").mockReturnValue(null);

      await panel.exportPdf();

      expect(error).toHaveBeenCalledWith("Allow pop-ups for this site to print the report.");
      expect(overviewService.getGroupOverview).not.toHaveBeenCalled();
      expect(panel.exporting()).toBe(false);
    });

    it("closes the print window when the years cannot be fetched", async () => {
      const error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined);
      const printWindow = { document: { write: vi.fn(), open: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn() };
      vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);
      overviewService.getGroupOverview.mockImplementation(() => throwError(() => new Error("no connection")));

      await panel.exportPdf();

      expect(printWindow.close).toHaveBeenCalledTimes(1);
      expect(printWindow.print).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith("The report could not be made. Try again.");
      expect(panel.exporting()).toBe(false);
    });
  });
});
