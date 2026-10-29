import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ChartStub } from "../../testing/chartjs.stub";
import { ChartColors } from "./chart-colors";
import { ChartComponent, ChartSpec } from "./chart.component";

/** Lets the MutationObserver, the effects and the chained draw (with its dynamic import) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

const spec = (total: number, extra: Record<string, unknown> = {}): ChartSpec =>
  ({ type: "doughnut", data: { labels: ["A", "B"], datasets: [{ data: [total, 1] }] }, options: { animation: { duration: 400 }, ...extra } }) as ChartSpec;

describe("ChartComponent", () => {
  const colorsSeen: ChartColors[] = [];

  const create = async (build: (colors: ChartColors) => ChartSpec = (colors) => (colorsSeen.push(colors), spec(1))) => {
    const fixture = TestBed.createComponent(ChartComponent);
    fixture.componentRef.setInput("options", build);
    fixture.componentRef.setInput("label", "Spending by category");
    await fixture.whenStable();
    await vi.waitFor(() => expect(ChartStub.instances).toHaveLength(1));
    await settle();
    return fixture;
  };

  beforeEach(() => {
    ChartStub.instances.length = 0;
    colorsSeen.length = 0;
    TestBed.configureTestingModule({ imports: [ChartComponent], providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.querySelectorAll(".cv-chart-tooltip").forEach((element) => element.remove());
  });

  it("draws one chart on a labelled canvas and passes the token colors to the factory", async () => {
    const fixture = await create();

    expect(ChartStub.instances).toHaveLength(1);
    const canvas = fixture.nativeElement.querySelector("canvas") as HTMLCanvasElement;
    expect(ChartStub.instances[0].canvas).toBe(canvas);
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe("Spending by category");
    expect(colorsSeen[0].series).toHaveLength(6);
    // A canvas cannot read `inherit`: the computed family list is passed.
    expect((ChartStub.instances[0].config.options["font"] as { family: string }).family).toBeDefined();
  });

  it("updates in place and animated for new data, and recolors without a new chart or animation on a theme change", async () => {
    const fixture = await create();
    const chart = ChartStub.instances[0];
    expect(chart.updates).toEqual([]);

    fixture.componentRef.setInput("options", () => spec(2));
    await fixture.whenStable();
    await settle();
    expect(ChartStub.instances).toHaveLength(1);
    expect(chart.updates).toEqual([undefined]);
    expect((chart.data as { datasets: { data: number[] }[] }).datasets[0].data[0]).toBe(2);

    document.documentElement.classList.add("dark");
    await settle();
    await fixture.whenStable();
    await settle();

    expect(ChartStub.instances).toHaveLength(1);
    expect(chart.destroyed).toBe(false);
    expect(chart.updates).toEqual([undefined, "none"]);
  });

  it("turns the animation off under reduced motion", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      await create();
      expect(ChartStub.instances[0].config.options["animation"]).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  describe("the emphasised data point", () => {
    it("is applied without a rebuild, shown on the host, and cleared again", async () => {
      const fixture = await create();
      const chart = ChartStub.instances[0];
      const host = fixture.nativeElement as HTMLElement;

      fixture.componentRef.setInput("activeIndex", 1);
      await fixture.whenStable();
      await settle();
      expect(chart.getActiveElements()).toEqual([{ datasetIndex: 0, index: 1 }]);
      expect(chart.updates).toContain("emphasis");
      expect(host.getAttribute("data-active-index")).toBe("1");
      expect(ChartStub.instances).toHaveLength(1);

      fixture.componentRef.setInput("activeIndex", null);
      await fixture.whenStable();
      await settle();
      expect(chart.getActiveElements()).toEqual([]);
      expect(host.hasAttribute("data-active-index")).toBe(false);
    });

    it("is left alone for a chart that never sets it (the bars keep their own hover)", async () => {
      await create();
      expect(ChartStub.instances[0].updates).toEqual([]);
    });

    it("is re-applied after a redraw that replaced the data", async () => {
      const fixture = await create();
      fixture.componentRef.setInput("activeIndex", 0);
      await fixture.whenStable();
      await settle();

      ChartStub.instances[0].setActiveElements([]); // what Chart.js does on a mouse-out
      fixture.componentRef.setInput("options", () => spec(3));
      await fixture.whenStable();
      await settle();
      expect(ChartStub.instances[0].getActiveElements()).toEqual([{ datasetIndex: 0, index: 0 }]);
    });
  });

  it("clears the hover when a touch lands outside the chart, and ignores the mouse", async () => {
    const hover = vi.fn();
    const active = vi.fn(() => null);
    await create(() => spec(1, { plugins: { cvPointer: { hover, active } } }));
    const chart = ChartStub.instances[0];
    chart.setActiveElements([{ datasetIndex: 0, index: 0 }]);

    const tap = (pointerType: string) => {
      const event = new Event("pointerdown", { bubbles: true }) as Event & { pointerType: string };
      event.pointerType = pointerType;
      document.body.dispatchEvent(event);
    };
    tap("mouse");
    expect(hover).not.toHaveBeenCalled();

    tap("touch");
    expect(hover).toHaveBeenCalledWith(null);
    expect(chart.getActiveElements()).toEqual([]);
  });

  it("destroys the chart and its tooltip with the component", async () => {
    const fixture = await create();
    const chart = ChartStub.instances[0];
    fixture.destroy();
    expect(chart.destroyed).toBe(true);
  });
});
