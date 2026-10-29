import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { ApexOptions } from "apexcharts";
import { ApexChartComponent } from "./apex-chart.component";

import type { Mock } from "vitest";
type ChartInstance = { options: ApexOptions; render: Mock; updateOptions: Mock; destroy: Mock };

// vi.mock is hoisted above the imports, so what its factory uses has to be hoisted too.
const instances = vi.hoisted(() => [] as ChartInstance[]);

vi.mock("apexcharts", () => ({
  __esModule: true,
  // A constructor (called with `new`), so a function rather than an arrow.
  default: vi.fn(function (_el: HTMLElement, options: ApexOptions) {
    const instance = {
      options,
      render: vi.fn(() => Promise.resolve()),
      updateOptions: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    };
    instances.push(instance);
    return instance;
  }),
}));

/** Lets the MutationObserver, the effect and the chained draw (with its dynamic import) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("ApexChartComponent", () => {
  beforeEach(() => {
    instances.length = 0;
    TestBed.configureTestingModule({
      imports: [ApexChartComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("updates in place for new data and rebuilds without animation when the theme changes", async () => {
    const fixture = TestBed.createComponent(ApexChartComponent);
    fixture.componentRef.setInput("options", () => ({ chart: { type: "donut", animations: { speed: 400 } }, series: [1] }));
    await fixture.whenStable();
    await settle();
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalled();

    fixture.componentRef.setInput("options", () => ({ chart: { type: "donut", animations: { speed: 400 } }, series: [2] }));
    await fixture.whenStable();
    await settle();
    expect(instances).toHaveLength(1);
    expect(instances[0].updateOptions).toHaveBeenCalledTimes(1);

    document.documentElement.classList.add("dark");
    await settle();
    await fixture.whenStable();
    await settle();

    expect(instances[0].destroy).toHaveBeenCalled();
    expect(instances).toHaveLength(2);
    expect(instances[1].options.chart?.animations?.enabled).toBe(false);
    expect(instances[1].options.chart?.animations?.speed).toBe(400);
  });
});
