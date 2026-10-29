import type { Chart } from "chart.js";
import { centerTextPlugin, goalLinePlugin, pointerPlugin, syncActive } from "./chart-plugins";

/** A 2D context that records what was drawn. */
const fakeContext = () => {
  const calls: { name: string; args: unknown[]; fillStyle?: string; font?: string }[] = [];
  const context: Record<string, unknown> = { fillStyle: "", strokeStyle: "", font: "", lineWidth: 0, textAlign: "", textBaseline: "" };
  for (const name of ["save", "restore", "beginPath", "moveTo", "lineTo", "stroke", "setLineDash", "fillText"]) {
    context[name] = (...args: unknown[]) => calls.push({ name, args, fillStyle: context["fillStyle"] as string, font: context["font"] as string });
  }
  return { context: context as unknown as CanvasRenderingContext2D, calls };
};

/** The slice of Chart.js the plugins touch. */
const fakeChart = (extra: Record<string, unknown> = {}) => {
  const { context, calls } = fakeContext();
  let active: { datasetIndex: number; index: number }[] = [];
  const chart = {
    ctx: context,
    options: { font: { family: "Geist" } },
    chartArea: { left: 40, right: 340, top: 10, bottom: 200 },
    getDatasetMeta: () => ({ data: [{ x: 110, y: 120 }] }),
    getActiveElements: () => active,
    setActiveElements: (next: typeof active) => (active = next),
    update: vi.fn(),
    getElementsAtEventForMode: vi.fn(() => [{ index: 2 }]),
    ...extra,
  };
  return { chart: chart as unknown as Chart, calls, update: chart.update };
};

describe("chart plugins", () => {
  describe("centerTextPlugin", () => {
    it("writes the value over the label in the middle of the ring", () => {
      const { chart, calls } = fakeChart();
      centerTextPlugin.afterDatasetsDraw?.(chart as Chart<"doughnut">, { cancelable: true } as never, {
        text: () => ({ label: "October 2026", value: "1.233,40 €" }),
        labelColor: "rgb(100, 100, 100)",
        valueColor: "rgb(0, 0, 0)",
      }, false);

      const texts = calls.filter((call) => call.name === "fillText");
      expect(texts.map((call) => call.args)).toEqual([
        ["1.233,40 €", 110, 112],
        ["October 2026", 110, 134],
      ]);
      expect(texts[0].fillStyle).toBe("rgb(0, 0, 0)");
      expect(texts[0].font).toBe("600 20px Geist");
      expect(texts[1].fillStyle).toBe("rgb(100, 100, 100)");
      expect(texts[1].font).toBe("400 12px Geist");
    });

    it("draws nothing without text options or a ring", () => {
      const { chart, calls } = fakeChart({ getDatasetMeta: () => ({ data: [] }) });
      centerTextPlugin.afterDatasetsDraw?.(chart as Chart<"doughnut">, {} as never, { text: () => ({ label: "a", value: "b" }), labelColor: "", valueColor: "" }, false);
      expect(calls).toEqual([]);
    });
  });

  describe("goalLinePlugin", () => {
    const draw = (value: number, pixel: number) => {
      const { chart, calls } = fakeChart({ scales: { y: { getPixelForValue: () => pixel } } });
      goalLinePlugin.afterDatasetsDraw?.(chart as Chart<"bar">, {} as never, { value, color: "rgb(90, 90, 90)", label: "Goal" }, false);
      return calls;
    };

    it("draws a dashed line across the plot with its label above it on the left", () => {
      const calls = draw(1100, 99.6);

      expect(calls.find((call) => call.name === "setLineDash")?.args).toEqual([[5, 5]]);
      expect(calls.find((call) => call.name === "moveTo")?.args).toEqual([40, 100.5]);
      expect(calls.find((call) => call.name === "lineTo")?.args).toEqual([340, 100.5]);
      const label = calls.find((call) => call.name === "fillText");
      expect(label?.args).toEqual(["Goal", 44, 97.5]);
      expect(label?.font).toBe("400 10px Geist");
    });

    it("draws nothing without a goal, or for a goal off the plot", () => {
      expect(draw(0, 100)).toEqual([]);
      expect(draw(1100, 500)).toEqual([]);
    });
  });

  describe("pointerPlugin", () => {
    const run = (type: string, options: Parameters<NonNullable<typeof pointerPlugin.afterEvent>>[2], chart: Chart) =>
      pointerPlugin.afterEvent?.(chart as Chart<"doughnut">, { event: { type } } as never, options);

    it("reports the hovered slice and keeps the wanted one active when the pointer leaves", () => {
      const { chart } = fakeChart();
      const hover = vi.fn();
      const options = { hover, active: () => 3 };

      chart.setActiveElements([{ datasetIndex: 0, index: 1 }]);
      run("mousemove", options, chart);
      expect(hover).toHaveBeenLastCalledWith(1);
      // The page says slice 3 is the focused one: it wins over the pointer's own state.
      expect(chart.getActiveElements()).toEqual([{ datasetIndex: 0, index: 3 }]);

      chart.setActiveElements([]);
      run("mouseout", options, chart);
      expect(hover).toHaveBeenLastCalledWith(null);
      expect(chart.getActiveElements()).toEqual([{ datasetIndex: 0, index: 3 }]);
    });

    it("clears the emphasis on a mouse-out when nothing is focused", () => {
      const { chart } = fakeChart();
      chart.setActiveElements([{ datasetIndex: 0, index: 1 }]);
      run("mouseout", { hover: vi.fn(), active: () => null }, chart);
      expect(chart.getActiveElements()).toEqual([]);
    });

    it("treats touch like a mouse move and reports a click on a slice", () => {
      const { chart } = fakeChart();
      const hover = vi.fn();
      const click = vi.fn();
      chart.setActiveElements([{ datasetIndex: 0, index: 0 }]);
      run("touchstart", { hover, click }, chart);
      expect(hover).toHaveBeenCalledWith(0);

      run("click", { hover, click }, chart);
      expect(click).toHaveBeenCalledWith(2);
    });

    it("does nothing without options", () => {
      const { chart, update } = fakeChart();
      run("mouseout", undefined as never, chart);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("syncActive", () => {
    it("repaints only when the active point changes, unless asked to", () => {
      const { chart, update } = fakeChart();
      syncActive(chart, null);
      expect(update).not.toHaveBeenCalled();

      syncActive(chart, 1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith("emphasis");

      syncActive(chart, 1);
      expect(update).toHaveBeenCalledTimes(1);
      syncActive(chart, 1, true);
      expect(update).toHaveBeenCalledTimes(2);
    });
  });
});
