import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import type { ChartConfiguration } from "chart.js";
import { GroupOverviewCategory } from "../../open-api";
import { StoreModule } from "../../store/store.module";
import { DonutSegment } from "../overview-chart.utils";
import { OverviewCategoriesPanelComponent } from "./overview-categories-panel.component";

// The panel is a section the page places, so it is tested the way it is used: on a host's <section>.
@Component({
  imports: [OverviewCategoriesPanelComponent],
  template: `<section
    app-overview-categories-panel
    [categories]="categories()"
    [total]="total()"
    [periodLabel]="periodLabel()"
    (open)="opened.set($event)"
  ></section>`,
})
class HostComponent {
  public readonly categories = signal<GroupOverviewCategory[]>([
    { name: "Groceries", total: "60" },
    { name: "Drinks", total: "32" },
  ]);
  public readonly total = signal("92");
  public readonly periodLabel = signal("January 2025");
  public readonly opened = signal<DonutSegment | null>(null);
}

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

describe("OverviewCategoriesPanelComponent", () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let panel: OverviewCategoriesPanelComponent;

  const byId = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const row = (name: string): HTMLElement => byId(`overview-donut-row-${name}`);
  const donut = () => panel.donutOptions(CHART_COLORS) as ChartConfiguration<"doughnut">;
  const activeIndexOnChart = () => byId("overview-donut").getAttribute("data-active-index");
  const fill = (index: number) => (donut().data.datasets[0].backgroundColor as (context: { dataIndex: number }) => string)({ dataIndex: index });
  const middle = () => donut().options?.plugins?.cvCenterText?.text?.();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent, StoreModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    panel = fixture.debugElement.query(By.directive(OverviewCategoriesPanelComponent)).componentInstance;
  });

  it("is a panel named by its title", () => {
    const section: HTMLElement = fixture.nativeElement.querySelector("section");

    expect(section.classList.contains("cv-panel")).toBe(true);
    expect(section.getAttribute("aria-labelledby")).toBe("overview-categories-title");
    expect(section.querySelector("#overview-categories-title")?.textContent).toContain("Spending by category");
  });

  it("says so when the period has no spending, and draws no ring", async () => {
    host.categories.set([]);
    await fixture.whenStable();

    expect(byId("overview-donut")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("No spending in January 2025 yet.");
  });

  it("puts the share in front of the name, with no Share column", () => {
    const headers = Array.from(fixture.nativeElement.querySelectorAll("th") as NodeListOf<HTMLElement>).map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Category", "Spent"]);

    const cells = row("Groceries").querySelectorAll("td");
    expect(cells.length).toBe(2);
    expect(cells[0].textContent?.replace(/\s+/g, " ").trim() ?? "").toMatch(/^\d+(\.\d)?% Groceries$/);
    expect(row("Groceries").querySelector('[data-testid="overview-donut-share"]')).not.toBeNull();
  });

  it("asks the page to open a category when its row or its name is clicked, and only focuses from the dot", async () => {
    row("Drinks").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.opened()?.name).toBe("Drinks");

    host.opened.set(null);
    (row("Groceries").querySelector('[data-testid="overview-category-open"]') as HTMLElement).click();
    expect(host.opened()?.name).toBe("Groceries");

    host.opened.set(null);
    byId("overview-donut-focus-Drinks").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await fixture.whenStable();
    expect(host.opened()).toBeNull();
    expect(panel.focusedSegment()).toBe("Drinks");
    expect(byId("overview-donut-focus-Drinks").getAttribute("aria-pressed")).toBe("true");
  });

  it("focuses a category, dims the others, and clears again, without new chart data", () => {
    const count = () => donut().data.datasets[0].data.length;
    const all = count();

    panel.toggleFocus("Groceries");
    expect(panel.isDimmed("Groceries")).toBe(false);
    expect(panel.isDimmed("Someone else")).toBe(true);
    expect(panel.focusedSegment()).toBe("Groceries");
    expect(count()).toBe(all);

    panel.toggleFocus("Groceries");
    expect(panel.focusedSegment()).toBeNull();
    expect(panel.isDimmed("Someone else")).toBe(false);
    expect(count()).toBe(all);
  });

  it("dims the other legend rows while one is hovered, and clears on leave", async () => {
    row("Drinks").dispatchEvent(new Event("mouseenter"));
    await fixture.whenStable();

    expect(panel.activeSegment()).toBe("Drinks");
    expect(row("Groceries").getAttribute("data-dimmed")).toBe("true");
    expect(row("Drinks").getAttribute("data-dimmed")).toBe("false");

    row("Drinks").dispatchEvent(new Event("mouseleave"));
    await fixture.whenStable();
    expect(panel.activeSegment()).toBeNull();
    expect(row("Groceries").getAttribute("data-dimmed")).toBe("false");
  });

  it("emphasises the hovered row's slice, fades the others and names it in the middle, without new chart data", async () => {
    const before = donut().data.datasets[0].data;
    expect(middle()?.label).toBe("January 2025");
    expect(middle()?.value).toContain("92");
    expect(activeIndexOnChart()).toBeNull();

    row("Drinks").dispatchEvent(new Event("mouseenter"));
    await fixture.whenStable();

    expect(panel.activeSegmentIndex()).toBe(1);
    expect(activeIndexOnChart()).toBe("1");
    expect(middle()?.label).toBe("Drinks");
    expect(middle()?.value).toContain("32");
    // The slice colors are scriptable, so the others go faint without the chart being given new data.
    expect(fill(1)).toBe("rgb(2, 2, 2)");
    expect(fill(0)).toBe("rgba(1, 1, 1, 0.45)");
    expect(donut().data.datasets[0].data).toEqual(before);

    row("Drinks").dispatchEvent(new Event("mouseleave"));
    await fixture.whenStable();
    expect(activeIndexOnChart()).toBeNull();
    expect(fill(0)).toBe("rgb(1, 1, 1)");
    expect(middle()?.label).toBe("January 2025");
  });

  it("dims the legend when a slice is hovered on the ring, a click opens it, and the focused slice stays emphasised", async () => {
    const pointer = donut().options?.plugins?.cvPointer;

    pointer?.hover?.(0);
    await fixture.whenStable();
    expect(row("Drinks").getAttribute("data-dimmed")).toBe("true");

    pointer?.hover?.(null);
    pointer?.click?.(1);
    expect(host.opened()?.name).toBe("Drinks");

    panel.toggleFocus("Drinks");
    await fixture.whenStable();
    expect(panel.focusedSegment()).toBe("Drinks");
    expect(row("Groceries").getAttribute("data-dimmed")).toBe("true");
    // Once the pointer leaves, the focused slice is the one the chart keeps emphasised.
    expect(pointer?.active?.()).toBe(1);
    expect(activeIndexOnChart()).toBe("1");
  });

  it('writes "Total" in the middle for a date range too long for it, and cuts a long category name', async () => {
    host.periodLabel.set("1 Jan 2025 – 15 Mar 2025");
    host.categories.set([{ name: "Household and cleaning", total: "92" }]);
    await fixture.whenStable();

    expect(middle()?.label).toBe("Total");

    panel.toggleFocus("Household and cleaning");
    expect(middle()?.label).toBe("Household and c…");
  });
});
