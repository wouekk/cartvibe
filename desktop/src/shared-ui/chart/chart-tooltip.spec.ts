import type { Chart, TooltipModel } from "chart.js";
import { hideChartTooltip, htmlTooltip, removeChartTooltip, tooltipCard } from "./chart-tooltip";

const canvasAt = (left: number, top: number) => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left, top, right: left + 300, bottom: top + 200, width: 300, height: 200, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  return canvas;
};

const tooltipModel = (caretX: number, caretY: number, opacity = 1) => ({ opacity, caretX, caretY, dataPoints: [{ dataIndex: 0 }] }) as unknown as TooltipModel<"bar">;

describe("chart tooltip", () => {
  let chart: Chart;

  beforeEach(() => {
    chart = { canvas: canvasAt(20, 100) } as unknown as Chart;
  });

  afterEach(() => {
    removeChartTooltip(chart);
    vi.restoreAllMocks();
  });

  /** jsdom has no layout: give the card a width and the page a 360px viewport. */
  const onA360Screen = () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
  };

  const card = () => document.querySelector<HTMLElement>(".cv-chart-tooltip");

  describe("tooltipCard", () => {
    it("is a heading and one row per figure, with the user's text escaped", () => {
      const html = tooltipCard("Fruit <b>&</b>", [
        { color: "rgb(1, 2, 3)", label: "Spent", value: "10,00 €" },
        { color: "rgb(4, 5, 6)", label: 'Share "of" total', value: "5%" },
      ]);

      const element = document.createElement("div");
      element.innerHTML = html;
      expect(element.querySelector(".font-semibold")?.textContent).toBe("Fruit <b>&</b>");
      expect(element.querySelector("b")).toBeNull();
      expect(element.querySelectorAll(".tabular-nums").length).toBe(2);
      expect((element.querySelector("span.size-2\\.5") as HTMLElement).style.background).toBe("rgb(1, 2, 3)");
      expect(element.textContent).toContain('Share "of" total');
    });
  });

  describe("htmlTooltip", () => {
    it("shows our card above the point, clamped inside the viewport", () => {
      onA360Screen();
      const handler = htmlTooltip<"bar">(() => "<div>card</div>");
      handler({ chart, tooltip: tooltipModel(0, 20) });

      const element = card()!;
      expect(element).not.toBeNull();
      expect(element.dataset["visible"]).toBe("true");
      expect(element.style.opacity).toBe("1");
      expect(element.innerHTML).toContain("card");
      // The point is at x 20 on the page, so the card cannot centre on it: it keeps its margin from the edge.
      expect(element.style.left).toBe("8px");

      // And at the right edge it keeps its margin there.
      handler({ chart, tooltip: tooltipModel(290, 20) });
      expect(element.style.left).toBe("232px");
    });

    it("hides without removing when there is nothing to show", () => {
      const handler = htmlTooltip<"bar">((tooltip) => (tooltip.opacity ? "<div>card</div>" : ""));
      handler({ chart, tooltip: tooltipModel(100, 50) });
      expect(card()!.dataset["visible"]).toBe("true");

      handler({ chart, tooltip: tooltipModel(100, 50, 0) });
      expect(card()!.dataset["visible"]).toBe("false");
      expect(card()!.style.opacity).toBe("0");
    });

    it("hides when the page renders no card for the point, and on demand", () => {
      htmlTooltip<"bar">(() => "")({ chart, tooltip: tooltipModel(100, 50) });
      expect(card()!.dataset["visible"]).toBe("false");

      htmlTooltip<"bar">(() => "<div>card</div>")({ chart, tooltip: tooltipModel(100, 50) });
      hideChartTooltip(chart);
      expect(card()!.dataset["visible"]).toBe("false");
    });

    it("takes the card off the page with its chart", () => {
      htmlTooltip<"bar">(() => "<div>card</div>")({ chart, tooltip: tooltipModel(100, 50) });
      removeChartTooltip(chart);
      expect(card()).toBeNull();
    });
  });
});
