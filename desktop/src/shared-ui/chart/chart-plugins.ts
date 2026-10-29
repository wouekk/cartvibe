import type { Chart, ChartType, Plugin } from "chart.js";

/** What a plugin reads from `options.plugins.<id>`: Chart.js cannot swap a plugin on an update, so they stay module-level. */
export interface CenterTextOptions {
  /** Called on every paint, so a hover or a focus changes the middle without new options. */
  text: () => { label: string; value: string };
  labelColor: string;
  valueColor: string;
}

export interface GoalLineOptions {
  /** 0 draws nothing. */
  value: number;
  color: string;
  label: string;
}

export interface PointerOptions {
  /** The slice under the pointer, or null once it left (Chart.js's own `onHover` never reports that). */
  hover?: (index: number | null) => void;
  click?: (index: number) => void;
  /** The slice that should be emphasised once the pointer's own hover ends (the focused one, or null). */
  active?: () => number | null;
}

declare module "chart.js" {
  interface PluginOptionsByType<TType extends ChartType> {
    cvCenterText?: CenterTextOptions;
    cvGoalLine?: GoalLineOptions;
    cvPointer?: PointerOptions;
  }
}

/**
 * Makes `index` the only active (emphasised) data point. "emphasis" is a custom update mode: a plain repaint that
 * never rebuilds the chart (Chart.js's own "active" mode makes every arc adopt the hover offset). `repaint` also
 * repaints when it is already active: Chart.js restyles only the hovered slice, not the faded ones around it.
 */
export function syncActive<TType extends ChartType>(chart: Chart<TType>, index: number | null, repaint = false): void {
  const active = chart.getActiveElements();
  const same = index === null ? active.length === 0 : active.length === 1 && active[0].datasetIndex === 0 && active[0].index === index;
  if (same && !repaint) {
    return;
  }
  chart.setActiveElements(index === null ? [] : [{ datasetIndex: 0, index }]);
  chart.update("emphasis" as "none");
}

const fontFamily = <TType extends ChartType>(chart: Chart<TType>): string => chart.options?.font?.family ?? "sans-serif";

/** The donut's middle: the value in bold over a muted label (the Apex donut's center text). */
export const centerTextPlugin: Plugin<"doughnut", CenterTextOptions> = {
  id: "cvCenterText",
  afterDatasetsDraw(chart, _args, options) {
    const arc = chart.getDatasetMeta(0).data[0];
    if (!options?.text || !arc) {
      return;
    }
    const { label, value } = options.text();
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = options.valueColor;
    ctx.font = `600 20px ${fontFamily(chart)}`;
    ctx.fillText(value, arc.x, arc.y - 8);
    ctx.fillStyle = options.labelColor;
    ctx.font = `400 12px ${fontFamily(chart)}`;
    ctx.fillText(label, arc.x, arc.y + 14);
    ctx.restore();
  },
};

/** A dashed horizontal line at the goal with its label above it, on the left. */
export const goalLinePlugin: Plugin<"bar", GoalLineOptions> = {
  id: "cvGoalLine",
  afterDatasetsDraw(chart, _args, options) {
    const scale = chart.scales["y"];
    if (!options || !(options.value > 0) || !scale) {
      return;
    }
    const { ctx, chartArea } = chart;
    const y = Math.round(scale.getPixelForValue(options.value)) + 0.5;
    if (y < chartArea.top || y > chartArea.bottom) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = options.color;
    ctx.font = `400 10px ${fontFamily(chart)}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(options.label, chartArea.left + 4, y - 3);
    ctx.restore();
  },
};

/** Reports the hovered and the clicked slice to the page, including mouse-out and touch. */
export const pointerPlugin: Plugin<"doughnut", PointerOptions> = {
  id: "cvPointer",
  afterEvent(chart, args, options) {
    if (!options) {
      return;
    }
    const type: string = args.event.type; // the typings leave out touchstart and touchmove
    if (type === "mouseout") {
      options.hover?.(null);
      syncActive(chart, options.active?.() ?? null);
    } else if (type === "mousemove" || type === "touchstart" || type === "touchmove") {
      const active = chart.getActiveElements();
      options.hover?.(active.length > 0 ? active[0].index : null);
      syncActive(chart, options.active?.() ?? null);
    } else if (type === "click") {
      const hit = chart.getElementsAtEventForMode(args.event as unknown as Event, "nearest", { intersect: true }, false);
      if (hit.length > 0) {
        options.click?.(hit[0].index);
      }
    }
  },
};
